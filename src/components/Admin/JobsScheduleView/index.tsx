import React from 'react'
import { Gutter } from '@payloadcms/ui/elements/Gutter'

import { tasks } from '@/jobs'
import JobsResetButton from '@/components/Admin/JobsResetButton'

import './index.scss'

const JobsScheduleView: React.FC = () => {
  const scheduledTasks = tasks.filter((task) => (task.schedule ?? []).length > 0)

  return (
    <div className="payload__container jobs-schedule-view">
      <Gutter>
        <div className="payload__flex">
          <div className="payload__flex__content">
            <h1>Jobs Schedule</h1>
            <p className="description">
              Background tasks configured for n8n API sync and their schedules.
            </p>
            <div className="jobs-schedule-view__note">
              <p>
                <strong>n8n sync timing:</strong> the <code>n8n-sync</code> job defaults to every 15 minutes.
              </p>
              <p>
                Override the task schedule with <code>N8N_SYNC_CRON</code>. Enable in-process job running with{' '}
                <code>PAYLOAD_JOBS_AUTORUN=true</code>.
              </p>
            </div>
            <JobsResetButton />

            <div className="table jobs-schedule-view__table">
              <table>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Slug</th>
                    <th>Schedule</th>
                    <th>Frequency</th>
                    <th>Queue</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledTasks.map((task) => {
                    const scheduleEntries = task.schedule ?? []

                    return scheduleEntries.map((entry, index) => (
                      <tr key={`${task.slug}-${entry.cron}-${index}`}>
                        <td>{task.label || task.slug}</td>
                        <td>{task.slug}</td>
                        <td>
                          <code>{entry.cron}</code>
                        </td>
                        <td>{describeCron(entry.cron)}</td>
                        <td>{entry.queue || 'default'}</td>
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Gutter>
    </div>
  )
}

export default JobsScheduleView

const describeCron = (cron: string): string => {
  const parts = cron.trim().split(/\s+/)
  if (parts.length === 6) {
    const [sec, min, hour, dom, mon, dow] = parts
    if (sec === '0' && min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 'Every minute'
    }
    if (sec === '0' && min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${min.slice(2)} minutes`
    }
    if (sec === '0' && min !== '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every hour at :${min.padStart(2, '0')}`
    }
  }

  if (parts.length === 5) {
    const [min, hour, dom, mon, dow] = parts
    if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 'Every minute'
    }
    if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${min.slice(2)} minutes`
    }
    if (min !== '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every hour at :${min.padStart(2, '0')}`
    }
  }

  return cron === 'Not scheduled' ? 'Not scheduled' : 'Custom schedule'
}
