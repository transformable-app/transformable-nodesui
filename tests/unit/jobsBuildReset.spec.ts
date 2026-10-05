import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { Payload, PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentJobsBuildID, resetAllJobs, resetJobsForNewBuild } from '@/jobs/resetJobs'

vi.mock('node:fs', () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }))

const buildEnvKeys = [
  'PAYLOAD_JOBS_BUILD_ID',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_URL',
  'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA',
  'NEXT_PHASE',
  'npm_lifecycle_event',
] as const

beforeEach(() => {
  vi.resetAllMocks()
  for (const key of buildEnvKeys) vi.stubEnv(key, '')
  vi.mocked(existsSync).mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function mockPayload(initialStats: unknown = {}) {
  let stats = initialStats
  const findGlobal = vi.fn(async () => ({ stats }))
  const deleteJobs = vi.fn().mockResolvedValue({ docs: [], errors: [] })
  const updateGlobal = vi.fn(async ({ data }: { data: { stats: unknown } }) => {
    stats = data.stats
    return { stats }
  })
  const payload = { findGlobal, delete: deleteJobs, updateGlobal } as unknown as Payload
  return { payload, findGlobal, deleteJobs, updateGlobal }
}

describe('deployment job reset', () => {
  it('clears all jobs and schedule stats once when the deployment changes', async () => {
    vi.stubEnv('PAYLOAD_JOBS_BUILD_ID', ' new-build ')
    const { payload, deleteJobs, updateGlobal } = mockPayload({
      buildReset: { buildID: 'old-build' },
      scheduledRuns: { queues: { n8n: {} } },
    })
    expect(await resetJobsForNewBuild({ payload })).toEqual({
      buildID: 'new-build',
      previousBuildID: 'old-build',
      reset: true,
      reason: 'build-changed',
    })
    expect(deleteJobs).toHaveBeenCalledWith({
      collection: 'payload-jobs',
      where: { id: { exists: true } },
      overrideAccess: true,
    })
    expect(updateGlobal).toHaveBeenCalledWith({
      slug: 'payload-jobs-stats',
      overrideAccess: true,
      data: {
        stats: {
          buildReset: { buildID: 'new-build', reason: 'new-build', resetAt: expect.any(String) },
        },
      },
    })
    expect(deleteJobs.mock.invocationCallOrder[0]).toBeLessThan(
      updateGlobal.mock.invocationCallOrder[0],
    )
    expect(await resetJobsForNewBuild({ payload })).toEqual({
      buildID: 'new-build',
      previousBuildID: 'new-build',
      reset: false,
      reason: 'same-build',
    })
    expect(deleteJobs).toHaveBeenCalledOnce()
  })

  it('resets on first deployment when no marker exists', async () => {
    vi.stubEnv('PAYLOAD_JOBS_BUILD_ID', 'first-build')
    const { payload, updateGlobal } = mockPayload()
    expect((await resetJobsForNewBuild({ payload })).reset).toBe(true)
    expect(updateGlobal.mock.calls[0][0].data.stats).toEqual({
      buildReset: {
        buildID: 'first-build',
        reason: 'initial-build-marker',
        resetAt: expect.any(String),
      },
    })
  })

  it('skips when no build ID is available', async () => {
    const { payload, findGlobal, deleteJobs } = mockPayload()
    expect(await resetJobsForNewBuild({ payload })).toEqual({
      reset: false,
      reason: 'missing-build-id',
    })
    expect(findGlobal).not.toHaveBeenCalled()
    expect(deleteJobs).not.toHaveBeenCalled()
  })

  it.each([
    ['NEXT_PHASE', 'phase-production-build'],
    ['npm_lifecycle_event', 'build'],
  ])('does not change the database during builds (%s)', async (key, value) => {
    vi.stubEnv('PAYLOAD_JOBS_BUILD_ID', 'new-build')
    vi.stubEnv(key, value)
    const { payload, findGlobal, deleteJobs } = mockPayload()
    expect(await resetJobsForNewBuild({ payload })).toEqual({ reset: false, reason: 'build-phase' })
    expect(findGlobal).not.toHaveBeenCalled()
    expect(deleteJobs).not.toHaveBeenCalled()
  })

  it('does not record the new build if clearing jobs fails', async () => {
    vi.stubEnv('PAYLOAD_JOBS_BUILD_ID', 'new-build')
    const { payload, deleteJobs, updateGlobal } = mockPayload()
    deleteJobs.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(resetJobsForNewBuild({ payload })).rejects.toThrow('Database unavailable')
    expect(updateGlobal).not.toHaveBeenCalled()
  })

  it('preserves request and access enforcement for manual resets', async () => {
    const { payload, deleteJobs, updateGlobal } = mockPayload()
    const req = { payload } as PayloadRequest
    await resetAllJobs({
      payload,
      req,
      overrideAccess: false,
      buildID: 'current-build',
      reason: 'manual-reset',
    })
    expect(deleteJobs).toHaveBeenCalledWith(expect.objectContaining({ req, overrideAccess: false }))
    expect(updateGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ req, overrideAccess: false }),
    )
    vi.stubEnv('PAYLOAD_JOBS_BUILD_ID', 'current-build')
    expect((await resetJobsForNewBuild({ payload })).reason).toBe('same-build')
  })

  it('prefers the explicit build ID over deployment variables', () => {
    vi.stubEnv('PAYLOAD_JOBS_BUILD_ID', 'explicit')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'commit')
    expect(getCurrentJobsBuildID()).toBe('explicit')
  })

  it('uses Vercel commit identity when no explicit ID is set', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'commit')
    expect(getCurrentJobsBuildID()).toBe('commit')
  })

  it.each(['.next/BUILD_ID', '.next/standalone/.next/BUILD_ID'])(
    'reads Docker/Next.js build identity from %s',
    (file) => {
      const buildPath = path.resolve(process.cwd(), file)
      vi.mocked(existsSync).mockImplementation((candidate) => candidate === buildPath)
      vi.mocked(readFileSync).mockReturnValue('docker-build\n')
      expect(getCurrentJobsBuildID()).toBe('docker-build')
      expect(readFileSync).toHaveBeenCalledWith(buildPath, 'utf8')
    },
  )
})
