'use client'

import {
  Check,
  ChevronLeft,
  Eraser,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  Star,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

type AgentSummary = {
  adminWorkflowURL?: string | null
  name: string
  placeholder?: string | null
  slug: string
  streamingEnabled: boolean
  welcomeMessage?: string | null
}

type AgentMessage = {
  content: string
  id?: string
  role: 'assistant' | 'system' | 'tool' | 'user'
  status?: string
}

type RunState = {
  id?: string
  requestID?: string
  status?: string
}

type AgentSession = {
  id: string
  lastMessageAt?: string | null
  status?: string | null
  title?: string | null
}

type AgentApproval = {
  expiresAt?: string | null
  id: string
  prompt?: string | null
  status?: string | null
  title?: string | null
}

type Props = {
  agent: AgentSummary
  description?: string | null
  title?: string | null
}

const parseSSEFrame = (frame: string) => {
  const event = frame
    .split(/\r?\n/)
    .find((line) => line.startsWith('event:'))
    ?.slice(6)
    .trim()
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')

  if (!event || !data) return null

  try {
    return { data: JSON.parse(data) as Record<string, unknown>, event }
  } catch {
    return null
  }
}

const initialMessages = (agent: AgentSummary): AgentMessage[] =>
  agent.welcomeMessage
    ? [{ content: agent.welcomeMessage, role: 'assistant', status: 'complete' }]
    : []

export function AgentChatClient({ agent, description, title }: Props) {
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [isDraftSession, setIsDraftSession] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>(() => initialMessages(agent))
  const [messagePage, setMessagePage] = useState(1)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [approvals, setApprovals] = useState<AgentApproval[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<RunState | null>(null)
  const [deletingSessionID, setDeletingSessionID] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastPromptRef = useRef('')

  const placeholder = agent.placeholder || 'Send a message'

  const ensureSession = useCallback(async () => {
    if (sessionID) return sessionID

    const response = await fetch(`/api/agents/${agent.slug}/sessions`, {
      body: JSON.stringify({ title: agent.name }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Could not start an agent session.')
    }

    const data = (await response.json()) as { session?: { id?: string } }
    if (!data.session?.id) throw new Error('Agent session response was invalid.')

    setSessionID(data.session.id)
    setIsDraftSession(false)
    setSessions((current) => [data.session as AgentSession, ...current])
    return data.session.id
  }, [agent.name, agent.slug, sessionID])

  const loadSessions = useCallback(async () => {
    const response = await fetch(`/api/agents/${agent.slug}/sessions`)
    if (!response.ok) return

    const data = (await response.json()) as { docs?: AgentSession[] }
    if (Array.isArray(data.docs)) {
      setSessions(data.docs)
      if (!sessionID && !isDraftSession && data.docs[0]?.id) {
        setSessionID(data.docs[0].id)
      }
    }
  }, [agent.slug, isDraftSession, sessionID])

  const loadHistory = useCallback(
    async (id: string, page = 1) => {
      const response = await fetch(`/api/agent-sessions/${id}/messages?page=${page}`)
      if (!response.ok) return

      const data = (await response.json()) as {
        docs?: AgentMessage[]
        hasNextPage?: boolean
        nextPage?: number | null
        page?: number
      }
      if (Array.isArray(data.docs)) {
        setMessagePage(data.page || page)
        setHasOlderMessages(Boolean(data.hasNextPage && data.nextPage))
        setMessages((current) => {
          if (page > 1) return [...data.docs!, ...current]
          return data.docs!.length > 0 ? data.docs! : initialMessages(agent)
        })
      }
    },
    [agent],
  )

  const loadApprovals = useCallback(async (id: string) => {
    const response = await fetch(`/api/agent-sessions/${id}/approvals`)
    if (!response.ok) return

    const data = (await response.json()) as { docs?: AgentApproval[] }
    setApprovals(Array.isArray(data.docs) ? data.docs : [])
  }, [])

  useEffect(() => {
    if (!sessionID) {
      setApprovals([])
      return
    }
    setMessagePage(1)
    void loadHistory(sessionID)
    void loadApprovals(sessionID)
  }, [loadApprovals, loadHistory, sessionID])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const appendToken = (content: string) => {
    setMessages((current) => {
      const next = [...current]
      const last = next[next.length - 1]

      if (last?.role === 'assistant' && last.status === 'streaming') {
        next[next.length - 1] = { ...last, content: `${last.content}${content}` }
        return next
      }

      return [...next, { content, role: 'assistant', status: 'streaming' }]
    })
  }

  const finalizeAssistant = (status: 'complete' | 'failed') => {
    setMessages((current) => {
      const next = [...current]
      const last = next[next.length - 1]

      if (last?.role === 'assistant' && last.status === 'streaming') {
        next[next.length - 1] = { ...last, status }
      }

      return next
    })
  }

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isSending) return

      setError(null)
      setIsSending(true)
      lastPromptRef.current = trimmed
      setInput('')
      setMessages((current) => [...current, { content: trimmed, role: 'user', status: 'complete' }])

      try {
        const id = await ensureSession()
        const idempotencyKey = crypto.randomUUID()

        if (!agent.streamingEnabled) {
          const response = await fetch(`/api/agent-sessions/${id}/messages`, {
            body: JSON.stringify({ idempotencyKey, text: trimmed }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          })
          const data = await response.json()

          if (!response.ok) throw new Error(data.error || 'The agent request failed.')

          if (data.run?.id) setActiveRun({ id: data.run.id, status: data.run.status })
          if (data.run?.status === 'waiting') void loadApprovals(id)
          if (data.assistantMessage?.content) {
            setMessages((current) => [
              ...current,
              {
                content: data.assistantMessage.content,
                id: data.assistantMessage.id,
                role: 'assistant',
                status: data.assistantMessage.status,
              },
            ])
          } else if (data.error) {
            setError(data.error)
          }

          return
        }

        const abortController = new AbortController()
        abortRef.current = abortController

        const response = await fetch(`/api/agent-sessions/${id}/messages`, {
          body: JSON.stringify({ idempotencyKey, text: trimmed }),
          headers: {
            accept: 'text/event-stream',
            'content-type': 'application/json',
          },
          method: 'POST',
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error('The agent stream could not be opened.')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split(/\n\n|\r\n\r\n/)
          buffer = frames.pop() ?? ''

          for (const frame of frames) {
            const parsed = parseSSEFrame(frame)
            if (!parsed) continue

            if (parsed.event === 'run') {
              setActiveRun({
                id: typeof parsed.data.runID === 'string' ? parsed.data.runID : undefined,
                requestID:
                  typeof parsed.data.requestID === 'string' ? parsed.data.requestID : undefined,
                status: typeof parsed.data.status === 'string' ? parsed.data.status : undefined,
              })
            }

            if (parsed.event === 'token' && typeof parsed.data.content === 'string') {
              appendToken(parsed.data.content)
            }

            if (parsed.event === 'message') {
              finalizeAssistant(parsed.data.status === 'failed' ? 'failed' : 'complete')
            }

            if (parsed.event === 'error') {
              setError(
                typeof parsed.data.message === 'string' ? parsed.data.message : 'Agent error',
              )
              finalizeAssistant('failed')
            }

            if (parsed.event === 'done') {
              setActiveRun((current) => ({
                ...current,
                status:
                  typeof parsed.data.status === 'string' ? parsed.data.status : current?.status,
              }))
              if (parsed.data.status === 'waiting') void loadApprovals(id)
            }
          }
        }
      } catch (sendError) {
        if (sendError instanceof Error && sendError.name === 'AbortError') {
          setError('The agent request was cancelled.')
        } else {
          setError(sendError instanceof Error ? sendError.message : 'The agent request failed.')
        }
        finalizeAssistant('failed')
      } finally {
        abortRef.current = null
        setIsSending(false)
      }
    },
    [agent.streamingEnabled, ensureSession, isSending],
  )

  const stopRun = async () => {
    abortRef.current?.abort()

    if (activeRun?.id) {
      await fetch(`/api/agent-runs/${activeRun.id}/cancel`, { method: 'POST' }).catch(() => null)
      setActiveRun((current) => ({ ...current, status: 'cancelled' }))
    }
  }

  const submitFeedback = async (rating: number) => {
    if (!activeRun?.id) return
    await fetch(`/api/agent-runs/${activeRun.id}/feedback`, {
      body: JSON.stringify({ rating }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).catch(() => null)
  }

  const resolveApproval = async (approvalID: string, approved: boolean) => {
    setError(null)
    const response = await fetch(`/api/agent-approvals/${approvalID}/resolve`, {
      body: JSON.stringify({ approved }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    if (!response.ok) {
      setError(data.error || 'Could not resolve approval.')
      return
    }

    setApprovals((current) => current.filter((approval) => approval.id !== approvalID))
    if (sessionID) void loadHistory(sessionID)
  }

  const clearChat = () => {
    abortRef.current?.abort()
    setSessionID(null)
    setIsDraftSession(true)
    setMessages(initialMessages(agent))
    setMessagePage(1)
    setHasOlderMessages(false)
    setApprovals([])
    setInput('')
    setError(null)
    setActiveRun(null)
    lastPromptRef.current = ''
  }

  const deleteSession = async (id: string) => {
    const session = sessions.find((item) => item.id === id)
    const confirmed = window.confirm(`Delete "${session?.title || 'Session'}"?`)
    if (!confirmed) return

    setDeletingSessionID(id)
    setError(null)

    try {
      const response = await fetch(`/api/agent-sessions/${id}/delete`, { method: 'POST' })
      const data = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        setError(data.error || 'Could not delete chat.')
        return
      }

      setSessions((current) => current.filter((item) => item.id !== id))

      if (sessionID === id) {
        setSessionID(null)
        setIsDraftSession(true)
        setMessages(initialMessages(agent))
        setMessagePage(1)
        setHasOlderMessages(false)
        setApprovals([])
        setActiveRun(null)
        lastPromptRef.current = ''
      }
    } finally {
      setDeletingSessionID(null)
    }
  }

  const canRetry = useMemo(() => Boolean(lastPromptRef.current && !isSending), [isSending])

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <Card className="overflow-hidden bg-card">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-3 text-lg text-foreground">
              <MessageSquareText className="h-5 w-5 text-primary" />
              {agent.name}
            </CardTitle>
            {agent.adminWorkflowURL ? (
              <a
                className="text-sm text-primary underline-offset-4 hover:underline"
                href={agent.adminWorkflowURL}
                rel="noreferrer"
                target="_blank"
              >
                Open workflow
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {sessions.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sessions.map((session) => (
                <div className="flex shrink-0 items-center gap-1" key={session.id}>
                  <Button
                    className={
                      session.id === sessionID
                        ? 'bg-secondary text-background hover:bg-secondary/90 hover:text-background'
                        : 'text-foreground hover:text-foreground'
                    }
                    onClick={() => {
                      setIsDraftSession(false)
                      setSessionID(session.id)
                      setError(null)
                    }}
                    size="sm"
                    type="button"
                    variant={session.id === sessionID ? 'secondary' : 'outline'}
                  >
                    {session.title || 'Session'}
                  </Button>
                  <Button
                    aria-label={`Delete ${session.title || 'Session'}`}
                    disabled={deletingSessionID === session.id}
                    onClick={() => void deleteSession(session.id)}
                    size="icon"
                    title={`Delete ${session.title || 'Session'}`}
                    type="button"
                    variant="ghost"
                  >
                    {deletingSessionID === session.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex h-[28rem] flex-col gap-3 overflow-y-auto rounded-lg border bg-background p-3">
            {hasOlderMessages ? (
              <Button
                className="mx-auto"
                onClick={() => sessionID && void loadHistory(sessionID, messagePage + 1)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeft className="mr-2 h-4 w-4 rotate-90" />
                Older messages
              </Button>
            ) : null}
            {messages.map((message, index) => (
              <div
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[82%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'mr-auto max-w-[82%] rounded-lg border bg-card px-3 py-2 text-sm text-foreground'
                }
                key={`${message.id || message.role}-${index}`}
              >
                <p className="whitespace-pre-wrap leading-6">{message.content}</p>
              </div>
            ))}
            {isSending && messages[messages.length - 1]?.status !== 'streaming' ? (
              <div className="mr-auto flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting
              </div>
            ) : null}
          </div>

          {approvals.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
              {approvals.map((approval) => (
                <div
                  className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                  key={approval.id}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {approval.title || 'Approval required'}
                    </p>
                    {approval.prompt ? (
                      <p className="text-sm text-muted-foreground">{approval.prompt}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      onClick={() => void resolveApproval(approval.id, false)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => void resolveApproval(approval.id, true)}
                      size="sm"
                      type="button"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={isSending}
              onClick={clearChat}
              size="sm"
              type="button"
              variant="outline"
            >
              <Eraser className="mr-2 h-4 w-4" />
              New chat
            </Button>
            <Button
              disabled={!canRetry}
              onClick={() => void sendMessage(lastPromptRef.current)}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button
              disabled={!isSending && activeRun?.status !== 'running'}
              onClick={() => void stopRun()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
            <Button
              disabled={!activeRun?.id}
              onClick={() => void submitFeedback(5)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Star className="mr-2 h-4 w-4" />
              Good
            </Button>
          </div>

          <form
            className="flex flex-col gap-3 md:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage(input)
            }}
          >
            <Textarea
              className="min-h-24 flex-1 resize-none"
              disabled={isSending}
              onChange={(event) => setInput(event.target.value)}
              placeholder={placeholder}
              value={input}
            />
            <Button className="md:self-end" disabled={isSending || !input.trim()} type="submit">
              <Send className="mr-2 h-4 w-4" />
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
