import type { Payload } from 'payload'

type PushInput = {
  executionID: string
  executionDocID: string
  startedAt: string
  errorMessage?: string | null
  serverID: string
  serverName: string
  workflowID?: string | null
  workflowName?: string | null
  n8nURL?: string | null
}

const sanitizeMessage = (value: string | null | undefined) =>
  (value ?? 'Execution failed.')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(password|token|api[_ -]?key|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 180)

export async function sendWorkflowFailurePush(payload: Payload, input: PushInput) {
  const devices = await payload.find({
    collection: 'mobile-devices',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where: { workflowFailuresEnabled: { equals: true } },
  }).catch(() => {
    payload.logger.warn({ msg: 'nodesui push device lookup failed' })
    return null
  })
  if (!devices) return

  const eligible = devices.docs.filter((device) => {
    const muted = device.mutedWorkflows ?? []
    return (
      !input.workflowID ||
      !muted.some(
        (workflow) =>
          String(typeof workflow === 'string' ? workflow : workflow.id) === input.workflowID,
      )
    )
  })
  if (eligible.length === 0) return

  const message = sanitizeMessage(input.errorMessage)
  const failureTime = Number.isNaN(new Date(input.startedAt).getTime())
    ? 'Time unavailable'
    : `${new Date(input.startedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`
  const messages = eligible.map((device) => ({
    to: device.token,
    title: `Workflow failed: ${input.workflowName || 'Unknown workflow'}`,
    body: `${input.serverName} · ${failureTime} · ${message}`,
    sound: 'default',
    data: {
      type: 'workflow-execution-failed',
      executionID: input.executionDocID,
      n8nExecutionID: input.executionID,
      startedAt: input.startedAt,
      workflowID: input.workflowID ?? null,
      serverID: input.serverID,
      ...(input.n8nURL ? { n8nURL: input.n8nURL } : {}),
    },
  }))

  for (let offset = 0; offset < messages.length; offset += 100) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(offset, offset + 100)),
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) {
        payload.logger.warn({
          msg: 'nodesui push delivery request failed',
          status: response.status,
        })
        continue
      }
      const result = (await response.json().catch(() => null)) as {
        data?: Array<{ status?: string; details?: { error?: string } }>
      } | null
      const tickets = result?.data ?? []
      await Promise.all(
        tickets.map(async (ticket, index) => {
          if (ticket.details?.error !== 'DeviceNotRegistered') return
          const device = eligible[offset + index]
          if (!device) return
          await payload
            .delete({
              collection: 'mobile-devices',
              id: device.id,
              overrideAccess: true,
            })
            .catch(() => undefined)
        }),
      )
    } catch {
      payload.logger.warn({ msg: 'nodesui push delivery request failed' })
    }
  }
}
