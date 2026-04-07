const formatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export const formatDateTime = (value?: string | null) => {
  if (!value) return 'Never'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return formatter.format(date)
}

export const formatDuration = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A'
  if (value < 1000) return `${value} ms`

  const seconds = Math.round(value / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
