import type { Payload } from 'payload'

type Severity = 'critical' | 'warning' | 'info'
type Channel = 'email' | 'ntfy'

type EmailSettings = {
  enabled?: boolean | null
  fromName?: string | null
  fromEmail?: string | null
  replyTo?: string | null
  recipients?: { email?: string | null }[] | null
}

type Alert = {
  fingerprint: string
  source: string
  severity?: Severity
  summary: string
  metadata?: Record<string, unknown>
}

const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const getSettings = async (payload: Payload) => {
  const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
  return {
    enabled: settings.enabled === true,
    email: settings.email || {},
    ntfyEnabled: settings.ntfyEnabled === true,
    threshold: settings.failureThreshold || envNumber('NOTIFICATION_FAILURE_THRESHOLD', 3),
    reminderMinutes: settings.reminderMinutes || envNumber('NOTIFICATION_REMINDER_MINUTES', 60),
    topic: settings.ntfyTopic || process.env.NTFY_TOPIC,
  }
}

const redact = (value: string) => value.replace(/(token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,]+/gi, '$1=[redacted]')
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const recordDelivery = async ({
  payload,
  incidentID,
  channel,
  status,
  error,
}: {
  payload: Payload
  incidentID: string
  channel: Channel
  status: 'sent' | 'failed'
  error?: string
}) => {
  try {
    await payload.create({
      collection: 'notification-deliveries',
      overrideAccess: true,
      data: { incident: incidentID, channel, status, ...(error ? { error } : {}) },
    })
  } catch (deliveryRecordError) {
    payload.logger.error({ err: deliveryRecordError, incidentID, channel }, 'failed to record notification delivery')
  }
}

const deliver = async ({ payload, incident, alert, channels, email, topic }: {
  payload: Payload
  incident: { id: string }
  alert: Alert
  channels: Channel[]
  email: EmailSettings
  topic?: string
}): Promise<boolean> => {
  const body = `${alert.source}: ${alert.summary}`
  let sent = false
  for (const channel of channels) {
    try {
      if (channel === 'ntfy') {
        if (!topic || !process.env.NTFY_BASE_URL) throw new Error('ntfy is not configured')
        const response = await fetch(`${process.env.NTFY_BASE_URL.replace(/\/$/, '')}/${encodeURIComponent(topic)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
          body,
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}`)
      } else {
        const recipients = (email.recipients || []).map((entry) => entry.email).filter(Boolean) as string[]
        if (!email.fromEmail || recipients.length === 0) throw new Error('email is not configured')
        const from = email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail
        await payload.sendEmail({
          to: recipients,
          from,
          replyTo: email.replyTo || undefined,
          subject: `[${alert.severity || 'warning'}] ${alert.source}`,
          text: body,
          html: `<p><strong>${escapeHtml(alert.source)}</strong></p><p>${escapeHtml(alert.summary)}</p>`,
        })
      }
      sent = true
      await recordDelivery({ payload, incidentID: incident.id, channel, status: 'sent' })
    } catch (error) {
      await recordDelivery({ payload, incidentID: incident.id, channel, status: 'failed', error: redact(error instanceof Error ? error.message : 'Unknown delivery error') })
    }
  }
  return sent
}

export const observeFailure = async (payload: Payload, alert: Alert) => {
  const settings = await getSettings(payload)
  const now = new Date().toISOString()
  const existing = await payload.find({ collection: 'notification-incidents', limit: 1, overrideAccess: true, where: { fingerprint: { equals: alert.fingerprint } } })
  const current = existing.docs[0]
  const count = (current?.count || 0) + 1
  const incident = current
    ? await payload.update({ collection: 'notification-incidents', id: current.id, overrideAccess: true, data: { count, lastSeenAt: now, status: 'open', summary: redact(alert.summary), metadata: alert.metadata } })
    : await payload.create({ collection: 'notification-incidents', overrideAccess: true, data: { ...alert, severity: alert.severity || 'warning', status: 'open', count, firstSeenAt: now, lastSeenAt: now, summary: redact(alert.summary) } })

  const lastAlerted = current?.lastAlertedAt ? new Date(current.lastAlertedAt).getTime() : 0
  const dueReminder = !lastAlerted || Date.now() - lastAlerted >= settings.reminderMinutes * 60_000
  if (!settings.enabled || count < settings.threshold || !dueReminder) return incident

  const channels: Channel[] = []
  if (settings.email.enabled === true) channels.push('email')
  if (settings.ntfyEnabled) channels.push('ntfy')
  if (channels.length) {
    const sent = await deliver({ payload, incident, alert, channels, email: settings.email, topic: settings.topic })
    if (sent) await payload.update({ collection: 'notification-incidents', id: incident.id, overrideAccess: true, data: { lastAlertedAt: now } })
  }
  return incident
}

export const resolveIncident = async (payload: Payload, fingerprint: string) => {
  const result = await payload.find({ collection: 'notification-incidents', limit: 1, overrideAccess: true, where: { and: [{ fingerprint: { equals: fingerprint } }, { status: { equals: 'open' } }] } })
  if (result.docs[0]) await payload.update({ collection: 'notification-incidents', id: result.docs[0].id, overrideAccess: true, data: { status: 'resolved', count: 0, lastAlertedAt: null } })
}
