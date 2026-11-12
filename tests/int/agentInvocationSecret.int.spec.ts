import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { BasePayload, buildConfig, createLocalReq } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Agents } from '@/collections/Agents'
import { getAgentInvocationSecret } from '@/n8n/agents/invocationSecret'
import type { User } from '@/payload-types'

describe('agent invocation secret', () => {
  it('stores ciphertext, hides it from reads, and preserves it on blank edits', async () => {
    const payload = await new BasePayload().init({
      config: buildConfig({
        collections: [
          {
            ...Agents,
            admin: undefined,
            endpoints: [],
            lockDocuments: false,
            fields: Agents.fields.filter(
              (field) =>
                'name' in field &&
                ['invocationSecret', 'encryptedInvocationSecret', 'secretReference'].includes(
                  field.name,
                ),
            ),
            defaultPopulate: undefined,
            versions: false,
          },
          { slug: 'users', auth: true, fields: [] },
        ],
        db: mongooseAdapter({ transactionOptions: false, url: '' }),
        secret: 'agent-invocation-secret-test',
      }),
      disableDBConnect: true,
    })

    const admin = { id: 'admin', collection: 'users', roleNames: ['Admin'] } as User
    const id = '675af8602e3984f9a487f0f2'
    let stored: Record<string, unknown> = { id, secretReference: 'LEGACY_AGENT_TOKEN' }
    payload.db.findOne = vi.fn(async () => ({ ...stored })) as typeof payload.db.findOne
    vi.spyOn(payload.db, 'updateOne').mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data }
      return { ...stored } as unknown as Awaited<ReturnType<typeof payload.db.updateOne>>
    })

    const save = (invocationSecret: string) =>
      payload.update({
        collection: 'agents',
        data: { invocationSecret },
        id,
        overrideAccess: false,
        user: admin,
      })

    const req = await createLocalReq({ user: admin }, payload)
    vi.stubEnv('LEGACY_AGENT_TOKEN', 'old-token')
    try {
      await expect(getAgentInvocationSecret(req, id)).resolves.toBe('old-token')
    } finally {
      vi.unstubAllEnvs()
    }

    const updated = await save('test-bearer-token')
    const ciphertext = stored.encryptedInvocationSecret
    expect(ciphertext).toEqual(expect.any(String))
    expect(ciphertext).not.toContain('test-bearer-token')
    expect(stored.invocationSecret).toBeUndefined()
    expect(stored.secretReference).toBeNull()
    expect(updated.encryptedInvocationSecret).toBeUndefined()
    expect(updated.invocationSecret).toBeUndefined()

    await save('')
    await payload.update({
      collection: 'agents',
      data: {
        encryptedInvocationSecret: 'injected-ciphertext',
        invocationSecret: 'unauthorized-replacement',
        secretReference: 'UNAUTHORIZED_REFERENCE',
      },
      id,
      overrideAccess: false,
      user: { ...admin, roleNames: ['User'] },
    })
    expect(stored.encryptedInvocationSecret).toBe(ciphertext)
    expect(stored.secretReference).toBeNull()
    await expect(getAgentInvocationSecret(req, id)).resolves.toBe('test-bearer-token')
  })
})
