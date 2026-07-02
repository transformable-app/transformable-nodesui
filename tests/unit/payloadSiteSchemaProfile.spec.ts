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

  it('accepts review URL templates and rejects invalid template values', () => {
    const valid = validateSchemaProfile({
      collections: [],
      plugin: { name: 'nodesui-companion', version: '0.1.0' },
      urlTemplates: {
        admin: '/admin/collections/{collection}/{id}',
        preview: '/preview/{collection}/{id}?version={versionID}',
      },
    })

    expect(valid.ok).toBe(true)

    const invalid = validateSchemaProfile({
      collections: [],
      plugin: { name: 'nodesui-companion', version: '0.1.0' },
      urlTemplates: {
        admin: 42,
      },
    })

    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.errors).toContain('Schema profile urlTemplates.admin must be a string when present.')
    }
  })
})
