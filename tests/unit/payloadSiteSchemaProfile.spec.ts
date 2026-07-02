import { describe, expect, it } from 'vitest'

import { hashSchemaProfile, validateSchemaProfile } from '@/payloadSites/schemaProfile'

describe('Payload site schema profile validation', () => {
  it('accepts a companion plugin profile and hashes it stably', () => {
    const profile = {
      collections: [
        {
          blocks: [{ slug: 'hero' }],
          fields: [{ name: 'title', type: 'text' }],
          slug: 'pages',
        },
      ],
      plugin: {
        compatible: true,
        name: 'nodesui-companion',
        version: '0.1.0',
      },
    }

    const result = validateSchemaProfile(profile)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.profileHash).toBe(hashSchemaProfile({ collections: profile.collections, plugin: profile.plugin }))
      expect(result.normalizedProfile).toEqual(profile)
    }
  })

  it('rejects profiles without plugin metadata or collections', () => {
    const result = validateSchemaProfile({ plugin: {} })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('Schema profile plugin.version is required.')
      expect(result.errors).toContain('Schema profile collections must be an array.')
    }
  })
})
