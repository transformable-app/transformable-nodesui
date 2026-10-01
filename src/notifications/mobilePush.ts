import type { Payload } from 'payload'

import type { Execution, MobileDevice } from '@/payload-types'

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

const MAX_ATTEMPTS = 5
const PAGE_SIZE = 100
const sanitizeMessage = (value: string | null | undefined) =>
  (value ?? 'Execution failed.')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(password|token|api[_ -]?key|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 180)

const safeName = (value: string | null | undefined, fallback: string) =>
  sanitizeMessage((value || fallback).replace(/[\r\n\t]+/g, ' ')).slice(0, 100)
const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id
const retryAt = (attempt: number) =>
  new Date(Date.now() + Math.min(60 * 60_000, 5_000 * 2 ** attempt)).toISOString()

/** Persist each authorized recipient/device before attempting Expo delivery. */
export async function sendWorkflowFailurePush(payload: Payload, input: PushInput) {
  const devices = await payload.find({
    collection: 'mobile-devices',
    depth: 0,
    limit: PAGE_SIZE,
    page: 1,
    overrideAccess: true,
    where: { workflowFailuresEnabled: { equals: true } },
  })
  const eventKey = `${input.serverID}:${input.executionID}`
  const execution = (await payload.findByID({
    collection: 'executions',
    id: input.executionDocID,
    depth: 0,
    overrideAccess: true,
  })) as Execution
  const workflowID = input.workflowID || idOf(execution.workflow as string | { id: string })
  const deploymentOrigin = process.env.NEXT_PUBLIC_SERVER_URL || ''

  for (let page = 1; page <= devices.totalPages; page += 1) {
    const current =
      page === 1
        ? devices
        : await payload.find({
            collection: 'mobile-devices',
            depth: 0,
            limit: PAGE_SIZE,
            page,
            overrideAccess: true,
            where: { workflowFailuresEnabled: { equals: true } },
          })
    for (const device of current.docs as MobileDevice[]) {
      const recipientID = idOf(device.user as string | { id: string })
      if (!recipientID) continue
      const denied = Boolean(
        workflowID &&
        (device.mutedWorkflows ?? []).some(
          (item) => idOf(item as string | { id: string }) === workflowID,
        ),
      )
      if (denied) continue
      // Resolve the execution through the recipient's effective collection access before delivery.
      const recipient = await payload
        .findByID({ collection: 'users', id: recipientID, depth: 1, overrideAccess: true })
        .catch(() => null)
      if (!recipient) continue
      const authorized = await payload
        .find({
          collection: 'executions',
          depth: 0,
          limit: 1,
          overrideAccess: false,
          user: recipient as never,
          where: {
            and: [{ id: { equals: execution.id } }, { server: { equals: input.serverID } }],
          },
        })
        .catch(() => null)
      if (!authorized?.docs.length) continue

      const notification = {
        type: 'workflow-execution-failed',
        executionID: execution.id,
        deploymentOrigin,
        accountID: recipientID,
      }
      await payload
        .create({
          collection: 'mobile-push-deliveries',
          overrideAccess: true,
          data: {
            eventKey: `${eventKey}:${recipientID}:${device.id}`,
            server: input.serverID,
            execution: execution.id,
            device: device.id,
            recipient: recipientID,
            groupKey: `${input.serverID}:${workflowID || 'unknown'}`,
            notification,
            display: {
              workflowName: safeName(input.workflowName, 'Unknown workflow'),
              serverName: safeName(input.serverName, 'n8n'),
              startedAt: input.startedAt,
              errorMessage: sanitizeMessage(input.errorMessage),
            },
            status: 'pending',
            attempts: 0,
            nextAttemptAt: new Date().toISOString(),
          },
        })
        .catch((error: unknown) => {
          // The unique event key makes a repeated sync safe; other failures remain visible for retry.
          if (!(error instanceof Error && /duplicate|unique/i.test(error.message))) {
            payload.logger.warn({ msg: 'nodesui push ledger insert failed', eventKey })
            throw error
          }
        })
    }
  }
}

/** Send due rows and consume Expo tickets/receipts. The ledger remains retryable across syncs. */
export async function processMobilePushDeliveries(payload: Payload) {
  const now = new Date().toISOString()
  const due = await payload.find({
    collection: 'mobile-push-deliveries',
    depth: 1,
    limit: PAGE_SIZE,
    page: 1,
    sort: 'createdAt',
    overrideAccess: true,
    where: {
      and: [
        { status: { in: ['pending', 'ticketed'] } },
        { nextAttemptAt: { less_than_equal: now } },
      ],
    },
  })
  const rows = due.docs as Array<{
    id: string
    eventKey: string
    status: string
    attempts: number
    ticketID?: string | null
    device:
      | string
      | {
          id: string
          token?: string
          workflowFailuresEnabled?: boolean
          mutedWorkflows?: unknown[] | null
        }
    recipient: string | { id: string }
    notification: Record<string, unknown>
    display: {
      workflowName?: string
      serverName?: string
      startedAt?: string
      errorMessage?: string
    }
    execution: string | { id: string }
    server: string | { id: string }
    groupKey: string
    createdAt?: string
  }>
  const ticketed = rows.filter((row) => row.status === 'ticketed' && row.ticketID)
  if (ticketed.length) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ticketed.map((row) => row.ticketID) }),
        signal: AbortSignal.timeout(8_000),
      })
      if (response.ok) {
        const body = (await response.json()) as {
          data?: Record<string, { status?: string; message?: string; details?: { error?: string } }>
        }
        for (const row of ticketed) {
          const receipt = body.data?.[row.ticketID!]
          if (!receipt) {
            await payload.update({
              collection: 'mobile-push-deliveries',
              id: row.id,
              overrideAccess: true,
              data: { nextAttemptAt: retryAt(row.attempts) },
            })
            continue
          }
          if (receipt.status === 'ok')
            await payload.update({
              collection: 'mobile-push-deliveries',
              id: row.id,
              overrideAccess: true,
              data: { status: 'sent', receiptStatus: 'ok', error: null },
            })
          else if (receipt.details?.error === 'DeviceNotRegistered') {
            await payload
              .delete({
                collection: 'mobile-devices',
                id: idOf(row.device as string | { id: string })!,
                overrideAccess: true,
              })
              .catch(() => undefined)
            await payload.update({
              collection: 'mobile-push-deliveries',
              id: row.id,
              overrideAccess: true,
              data: {
                status: 'failed',
                receiptStatus: receipt.details.error,
                error: 'Device is no longer registered.',
              },
            })
          } else
            await scheduleRetry(
              payload,
              row,
              receipt.message || receipt.details?.error || 'Expo receipt failed.',
            )
        }
      }
    } catch {
      payload.logger.warn({ msg: 'nodesui push receipt lookup failed' })
    }
  }

  const pending: typeof rows = []
  for (const row of rows.filter((item) => item.status === 'pending')) {
    const deploymentOrigin = process.env.NEXT_PUBLIC_SERVER_URL || ''
    if (!deploymentOrigin) {
      payload.logger.warn({
        msg: 'nodesui push delivery deferred: NEXT_PUBLIC_SERVER_URL is not configured',
      })
      await payload.update({
        collection: 'mobile-push-deliveries',
        id: row.id,
        overrideAccess: true,
        data: { nextAttemptAt: retryAt(row.attempts) },
      })
      continue
    }
    const recipientID = idOf(row.recipient as string | { id: string })
    const recipient = recipientID
      ? await payload
          .findByID({ collection: 'users', id: recipientID, depth: 1, overrideAccess: true })
          .catch(() => null)
      : null
    const executionID = idOf(row.execution as string | { id: string })
    const deviceID = idOf(row.device as string | { id: string })
    const device =
      typeof row.device === 'object'
        ? row.device
        : deviceID
          ? await payload
              .findByID({
                collection: 'mobile-devices',
                id: deviceID,
                depth: 1,
                overrideAccess: true,
              })
              .catch(() => null)
          : null
    const allowed =
      recipient && executionID && device && device.workflowFailuresEnabled
        ? await payload
            .find({
              collection: 'executions',
              depth: 1,
              limit: 1,
              overrideAccess: false,
              user: recipient as never,
              where: {
                and: [
                  { id: { equals: executionID } },
                  { server: { equals: idOf(row.server as string | { id: string }) } },
                ],
              },
            })
            .catch(() => null)
        : null
    const executionWorkflowID = allowed?.docs[0]
      ? idOf(allowed.docs[0].workflow as string | { id: string })
      : undefined
    const muted = Boolean(
      executionWorkflowID &&
      device &&
      (device.mutedWorkflows ?? []).some(
        (workflow) => idOf(workflow as string | { id: string }) === executionWorkflowID,
      ),
    )
    if (!allowed?.docs.length || muted || !device) {
      await payload.update({
        collection: 'mobile-push-deliveries',
        id: row.id,
        overrideAccess: true,
        data: {
          status: 'failed',
          error: muted ? 'Muted by recipient preferences.' : 'Recipient is no longer authorized.',
        },
      })
      continue
    }
    const notification = { ...row.notification, deploymentOrigin }
    await payload.update({
      collection: 'mobile-push-deliveries',
      id: row.id,
      overrideAccess: true,
      data: { notification },
    })
    pending.push({
      ...row,
      device,
      notification,
    })
  }
  const windowMs = Math.max(0, Number(process.env.MOBILE_PUSH_GROUP_WINDOW_SECONDS ?? 30)) * 1000
  const grouped = new Map<string, typeof pending>()
  for (const row of pending) {
    const timestamp = row.createdAt ? new Date(row.createdAt).getTime() : Date.now()
    const window = windowMs ? Math.floor(timestamp / windowMs) : timestamp
    const key = `${row.groupKey}:${idOf(row.device as string | { id: string })}:${idOf(row.recipient as string | { id: string })}:${window}`
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }
  const deliveryGroups = [...grouped.values()]
  for (let offset = 0; offset < deliveryGroups.length; offset += PAGE_SIZE) {
    const chunk = deliveryGroups.slice(offset, offset + PAGE_SIZE)
    const representatives = chunk.map((group) => group[group.length - 1])
    const messages = representatives.map((row, index) => {
      const device = row.device as { token?: string }
      const startedAt = row.display.startedAt ? new Date(row.display.startedAt) : null
      const timeLabel =
        startedAt && !Number.isNaN(startedAt.getTime())
          ? `${startedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
          : 'Time unavailable'
      return {
        to: device.token,
        title: `Workflow failed: ${safeName(row.display.workflowName, 'Unknown workflow')}`,
        body: `${chunk[index].length > 1 ? `${chunk[index].length} executions failed · ` : ''}${safeName(row.display.serverName, 'n8n')} · ${timeLabel} · ${sanitizeMessage(row.display.errorMessage)}`,
        sound: 'default',
        data: row.notification,
      }
    })
    const attemptedAt = new Date().toISOString()
    await Promise.all(
      chunk.flat().map((row) =>
        payload.update({
          collection: 'mobile-push-deliveries',
          id: row.id,
          overrideAccess: true,
          data: { attempts: row.attempts + 1, lastAttemptAt: attemptedAt },
        }),
      ),
    )
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error(`Expo HTTP ${response.status}`)
      const result = (await response.json()) as {
        data?: Array<{
          status?: string
          id?: string
          message?: string
          details?: { error?: string }
        }>
      }
      await Promise.all(
        chunk.map(async (group, index) => {
          const row = group[group.length - 1]
          const ticket = result.data?.[index]
          if (ticket?.status === 'ok' && ticket.id) {
            await Promise.all(
              group.map((entry) =>
                payload.update({
                  collection: 'mobile-push-deliveries',
                  id: entry.id,
                  overrideAccess: true,
                  data: {
                    status: 'ticketed',
                    ticketID: ticket.id,
                    nextAttemptAt: retryAt(0),
                    error: null,
                  },
                }),
              ),
            )
          } else if (ticket?.details?.error === 'DeviceNotRegistered') {
            await payload
              .delete({
                collection: 'mobile-devices',
                id: idOf(row.device as string | { id: string })!,
                overrideAccess: true,
              })
              .catch(() => undefined)
            await Promise.all(
              group.map((entry) =>
                payload.update({
                  collection: 'mobile-push-deliveries',
                  id: entry.id,
                  overrideAccess: true,
                  data: { status: 'failed', error: 'Device is no longer registered.' },
                }),
              ),
            )
          } else
            await Promise.all(
              group.map((entry) =>
                scheduleRetry(
                  payload,
                  entry,
                  ticket?.message || ticket?.details?.error || 'Expo ticket failed.',
                ),
              ),
            )
        }),
      )
    } catch (error) {
      await Promise.all(
        chunk
          .flat()
          .map((row) =>
            scheduleRetry(
              payload,
              row,
              error instanceof Error ? error.message : 'Expo request failed.',
            ),
          ),
      )
    }
  }
}

async function scheduleRetry(
  payload: Payload,
  row: { id: string; attempts: number },
  message: string,
) {
  if (row.attempts + 1 >= MAX_ATTEMPTS) {
    await payload.update({
      collection: 'mobile-push-deliveries',
      id: row.id,
      overrideAccess: true,
      data: { status: 'failed', error: message.slice(0, 500), nextAttemptAt: null },
    })
    return
  }
  await payload.update({
    collection: 'mobile-push-deliveries',
    id: row.id,
    overrideAccess: true,
    data: { status: 'pending', error: message.slice(0, 500), nextAttemptAt: retryAt(row.attempts) },
  })
}
