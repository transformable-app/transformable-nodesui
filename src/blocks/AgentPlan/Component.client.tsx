'use client'

import { Check, Loader2, Pause, Play, RefreshCcw, Send, Square, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/utilities/ui'

type AgentOption = {
  id: string
  name: string
  outputBinding?: unknown
  slug: string
}

type PayloadSiteOption = {
  allowedCollections: string[]
  id: string
  name: string
  schemaProfileHash?: string | null
  slug: string
}

type PlanTask = {
  errorMessage?: string | null
  id: string
  outputPreview?: string | null
  pendingApproval?: {
    expiresAt?: string | null
    id: string
    prompt?: string | null
    title?: string | null
  } | null
  status?: string | null
  taskID?: string | null
  title?: string | null
}

type PlanState = {
  id: string
  status?: string | null
  title?: string | null
}

type Props = {
  agents: AgentOption[]
  description?: string | null
  payloadSites: PayloadSiteOption[]
  title?: string | null
  userID: string
}

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'blocked', 'timed-out'])

const getTaskStatusClass = (status?: string | null) => {
  if (status === 'succeeded') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
  if (status === 'failed' || status === 'blocked') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (status === 'running') return 'border-blue-500/30 bg-blue-500/10 text-blue-700'
  if (status === 'waiting' || status === 'needs-approval') return 'border-amber-500/30 bg-amber-500/10 text-amber-700'
  return 'border-border bg-muted text-muted-foreground'
}

const safeJSON = (value: string) => {
  if (!value.trim()) return undefined
  return JSON.parse(value) as Record<string, unknown>
}

export function AgentPlanClient({ agents, description, payloadSites, title }: Props) {
  const [agentID, setAgentID] = useState(agents[0]?.slug ?? agents[0]?.id ?? '')
  const [siteID, setSiteID] = useState(payloadSites[0]?.slug ?? payloadSites[0]?.id ?? '')
  const selectedSite = useMemo(
    () => payloadSites.find((site) => site.slug === siteID || site.id === siteID),
    [payloadSites, siteID],
  )
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.slug === agentID || agent.id === agentID),
    [agentID, agents],
  )
  const [collection, setCollection] = useState(selectedSite?.allowedCollections[0] || 'pages')
  const [planTitle, setPlanTitle] = useState('Generate CMS draft')
  const [objective, setObjective] = useState('')
  const [taskTitle, setTaskTitle] = useState('Draft page')
  const [instructions, setInstructions] = useState('')
  const [allowedFields, setAllowedFields] = useState('title\nlayout\nlayout.*')
  const [allowedBlocks, setAllowedBlocks] = useState('')
  const [relationshipResolvers, setRelationshipResolvers] = useState('')
  const [demoApproval, setDemoApproval] = useState(false)
  const [plan, setPlan] = useState<PlanState | null>(null)
  const [tasks, setTasks] = useState<PlanTask[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [approvingTaskID, setApprovingTaskID] = useState<string | null>(null)
  const [resolvingApprovalID, setResolvingApprovalID] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (selectedSite?.allowedCollections[0] && !selectedSite.allowedCollections.includes(collection)) {
      setCollection(selectedSite.allowedCollections[0])
    }
  }, [collection, selectedSite])

  const loadTasks = useCallback(
    async (planID = plan?.id) => {
      if (!planID) return
      setIsPolling(true)
      try {
        const response = await fetch(`/api/agent-plans/${planID}/tasks`)
        const data = (await response.json()) as { docs?: PlanTask[]; error?: string }
        if (!response.ok) throw new Error(data.error || 'Could not load plan tasks.')
        setTasks(Array.isArray(data.docs) ? data.docs : [])
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load plan tasks.')
      } finally {
        setIsPolling(false)
      }
    },
    [plan?.id],
  )

  useEffect(() => {
    if (!plan?.id || (plan.status && terminalStatuses.has(plan.status))) return
    const interval = window.setInterval(() => {
      void loadTasks(plan.id)
    }, 2500)
    return () => window.clearInterval(interval)
  }, [loadTasks, plan])

  const postPlanAction = async (action: 'cancel' | 'pause' | 'resume') => {
    if (!plan?.id) return
    setError(null)
    const response = await fetch(`/api/agent-plans/${plan.id}/${action}`, { method: 'POST' })
    const data = (await response.json()) as { error?: string; plan?: PlanState }
    if (!response.ok) {
      setError(data.error || `Could not ${action} plan.`)
      return
    }
    if (data.plan) setPlan(data.plan)
    void loadTasks(plan.id)
  }

  const approveTask = async (task: PlanTask) => {
    if (!plan?.id) return
    const taskKey = task.taskID || task.id
    setApprovingTaskID(taskKey)
    setError(null)

    try {
      const response = await fetch(`/api/agent-plans/${plan.id}/tasks/${encodeURIComponent(taskKey)}/approve`, {
        method: 'POST',
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not approve task.')
      void loadTasks(plan.id)
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Could not approve task.')
    } finally {
      setApprovingTaskID(null)
    }
  }

  const resolveApproval = async (task: PlanTask, approved: boolean) => {
    const approvalID = task.pendingApproval?.id
    if (!approvalID || !plan?.id) return
    setResolvingApprovalID(approvalID)
    setError(null)

    try {
      const response = await fetch(`/api/agent-approvals/${approvalID}/resolve`, {
        body: JSON.stringify({ approved }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not resolve approval.')
      void loadTasks(plan.id)
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Could not resolve approval.')
    } finally {
      setResolvingApprovalID(null)
    }
  }

  const submitPlan = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      const fieldList = allowedFields
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
      const blockList = allowedBlocks
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
      const outputBinding = {
        allowedBlocks: blockList.length ? blockList : undefined,
        allowedFields: fieldList.length ? fieldList : undefined,
        collection,
        payloadSite: siteID,
        relationshipResolvers: safeJSON(relationshipResolvers)?.relationshipResolvers,
      }
      const body = {
        agent: agentID,
        approvalPolicy: {
          requireBeforeWrite: true,
          requireOnRisk: true,
        },
        mode: 'dependency',
        objective,
        outputBinding,
        tasks: [
          {
            expectedOutput: { type: 'cms-draft' },
            id: 'draft',
            input: demoApproval ? { demoApproval: true } : undefined,
            instructions,
            outputBinding,
            riskLevel: 'high',
            title: taskTitle,
          },
        ],
        title: planTitle,
      }

      const response = await fetch('/api/agent-plans/start', {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const data = (await response.json()) as {
        error?: string
        errors?: string[]
        plan?: PlanState
        tasks?: PlanTask[]
      }
      if (!response.ok) {
        throw new Error(data.error || data.errors?.join(' ') || 'Could not start plan.')
      }
      if (data.plan) setPlan(data.plan)
      setTasks(Array.isArray(data.tasks) ? data.tasks : [])
      if (data.plan?.id) void loadTasks(data.plan.id)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not start plan.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const outputPreview = [...tasks].reverse().find((task) => task.outputPreview)?.outputPreview

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{title || 'Agent plan'}</CardTitle>
            {description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {plan ? (
            <div className="rounded-lg border bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Status</span>{' '}
              <span className="font-medium">{plan.status || 'queued'}</span>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4 md:p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-plan-agent">Agent</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              id="agent-plan-agent"
              onChange={(event) => setAgentID(event.target.value)}
              value={agentID}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.slug || agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-plan-site">Payload Site</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              id="agent-plan-site"
              onChange={(event) => setSiteID(event.target.value)}
              value={siteID}
            >
              {payloadSites.map((site) => (
                <option key={site.id} value={site.slug || site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <Label htmlFor="agent-plan-title">Plan title</Label>
            <Input id="agent-plan-title" onChange={(event) => setPlanTitle(event.target.value)} value={planTitle} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-plan-collection">Collection</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              id="agent-plan-collection"
              onChange={(event) => setCollection(event.target.value)}
              value={collection}
            >
              {(selectedSite?.allowedCollections.length ? selectedSite.allowedCollections : ['pages']).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-plan-objective">Objective</Label>
          <Textarea
            id="agent-plan-objective"
            onChange={(event) => setObjective(event.target.value)}
            rows={3}
            value={objective}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-plan-task-title">Task title</Label>
            <Input id="agent-plan-task-title" onChange={(event) => setTaskTitle(event.target.value)} value={taskTitle} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-plan-fields">Allowed fields</Label>
            <Textarea
              id="agent-plan-fields"
              onChange={(event) => setAllowedFields(event.target.value)}
              rows={3}
              value={allowedFields}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-plan-instructions">Instructions</Label>
            <Textarea
              id="agent-plan-instructions"
              onChange={(event) => setInstructions(event.target.value)}
              rows={6}
              value={instructions}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-plan-resolvers">Relationship resolvers JSON</Label>
            <Textarea
              id="agent-plan-resolvers"
              onChange={(event) => setRelationshipResolvers(event.target.value)}
              placeholder='{"relationshipResolvers":[{"targetPath":"category","collection":"categories","matchField":"slug"}]}'
              rows={6}
              value={relationshipResolvers}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-plan-blocks">Allowed blocks</Label>
          <Input
            id="agent-plan-blocks"
            onChange={(event) => setAllowedBlocks(event.target.value)}
            placeholder="hero, content"
            value={allowedBlocks}
          />
        </div>

        <label className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <input
            checked={demoApproval}
            className="h-4 w-4"
            onChange={(event) => setDemoApproval(event.target.checked)}
            type="checkbox"
          />
          <span>Request n8n HITL-style approval through Payload when the workflow provides a resume URL.</span>
        </label>

        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!selectedAgent || !selectedSite || isSubmitting} onClick={submitPlan} type="button">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Start plan
          </Button>
          <Button disabled={!plan?.id || isPolling} onClick={() => loadTasks()} type="button" variant="secondary">
            <RefreshCcw className={cn('mr-2 h-4 w-4', isPolling && 'animate-spin')} />
            Refresh
          </Button>
          <Button disabled={!plan?.id} onClick={() => postPlanAction('pause')} type="button" variant="outline">
            <Pause className="mr-2 h-4 w-4" />
            Pause
          </Button>
          <Button disabled={!plan?.id} onClick={() => postPlanAction('resume')} type="button" variant="outline">
            <Play className="mr-2 h-4 w-4" />
            Resume
          </Button>
          <Button disabled={!plan?.id} onClick={() => postPlanAction('cancel')} type="button" variant="destructive">
            <Square className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[130px_1fr_170px] border-b bg-muted px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            <span>Task</span>
            <span>Title</span>
            <span>Status</span>
          </div>
          {tasks.length ? (
            tasks.map((task) => (
              <div key={task.id} className="grid grid-cols-[130px_1fr_170px] items-start gap-3 border-b px-3 py-3 last:border-b-0">
                <span className="truncate text-sm text-muted-foreground">{task.taskID || task.id}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{task.title || 'Untitled task'}</div>
                  {task.pendingApproval?.prompt ? (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {task.pendingApproval.prompt}
                    </div>
                  ) : null}
                  {task.errorMessage ? <div className="mt-1 text-xs text-destructive">{task.errorMessage}</div> : null}
                </div>
                <div className="flex flex-col items-stretch gap-2">
                  <span className={cn('rounded-full border px-2 py-1 text-center text-xs font-medium', getTaskStatusClass(task.status))}>
                    {task.status || 'pending'}
                  </span>
                  {task.status === 'needs-approval' ? (
                    <Button
                      disabled={approvingTaskID === (task.taskID || task.id)}
                      onClick={() => approveTask(task)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {approvingTaskID === (task.taskID || task.id) ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-3.5 w-3.5" />
                      )}
                      Approve
                    </Button>
                  ) : null}
                  {task.pendingApproval ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={resolvingApprovalID === task.pendingApproval.id}
                        onClick={() => resolveApproval(task, true)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {resolvingApprovalID === task.pendingApproval.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-3.5 w-3.5" />
                        )}
                        Yes
                      </Button>
                      <Button
                        disabled={resolvingApprovalID === task.pendingApproval.id}
                        onClick={() => resolveApproval(task, false)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        No
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4" />
              No plan tasks yet.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Latest output preview</Label>
          <pre className="max-h-80 overflow-auto rounded-lg border bg-muted p-3 text-xs text-muted-foreground">
            {outputPreview || 'No output yet.'}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
