'use client'

import { Loader2, MessageSquareText, RotateCcw, Send, Star, Square } from 'lucide-react'
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
  const [messages, setMessages] = useState<AgentMessage[]>(() => initialMessages(agent))
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<RunState | null>(null)
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
    setSessions((current) => [data.session as AgentSession, ...current])
    return data.session.id
  }, [agent.name, agent.slug, sessionID])

  const loadSessions = useCallback(async () => {
    const response = await fetch(`/api/agents/${agent.slug}/sessions`)
    if (!response.ok) return

    const data = (await response.json()) as { docs?: AgentSession[] }
    if (Array.isArray(data.docs)) {
      setSessions(data.docs)
      if (!sessionID && data.docs[0]?.id) {
        setSessionID(data.docs[0].id)
      }
    }
  }, [agent.slug, sessionID])

  const loadHistory = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/agent-sessions/${id}/messages`)
      if (!response.ok) return

      const data = (await response.json()) as { docs?: AgentMessage[] }
      if (Array.isArray(data.docs)) {
        setMessages(data.docs.length > 0 ? data.docs : initialMessages(agent))
      }
    },
    [agent],
  )

  useEffect(() => {
    if (sessionID) void loadHistory(sessionID)
  }, [loadHistory, sessionID])

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
                <Button
                  key={session.id}
                  onClick={() => {
                    setSessionID(session.id)
                    setError(null)
                  }}
                  size="sm"
                  type="button"
                  variant={session.id === sessionID ? 'secondary' : 'outline'}
                >
                  {session.title || 'Session'}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="flex h-[28rem] flex-col gap-3 overflow-y-auto rounded-lg border bg-background p-3">
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

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
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
