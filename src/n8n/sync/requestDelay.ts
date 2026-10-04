type RequestSchedule = { lastStartedAt?: number; pending: Promise<void> }

const schedules = new Map<string, RequestSchedule>()

const getDelayMS = () => {
  const configured = process.env.N8N_API_REQUEST_DELAY_MS?.trim()
  if (!configured) return 500
  const delay = Number(configured)
  return Number.isFinite(delay) && delay >= 0 ? delay : 500
}

// Share pacing across manual and scheduled syncs in this process, per n8n origin.
export const waitForN8nRequest = async (url: URL): Promise<void> => {
  const delayMS = getDelayMS()
  if (delayMS === 0) return

  const schedule = schedules.get(url.origin) || { pending: Promise.resolve() }
  schedules.set(url.origin, schedule)
  const pending = schedule.pending.then(async () => {
    const waitMS =
      schedule.lastStartedAt === undefined
        ? 0
        : Math.max(0, schedule.lastStartedAt + delayMS - Date.now())
    if (waitMS > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMS))
    schedule.lastStartedAt = Date.now()
  })
  schedule.pending = pending
  await pending
}
