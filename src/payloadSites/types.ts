export const companionPluginStatuses = ['missing', 'connected', 'stale', 'error'] as const
export const schemaProfileStatuses = ['missing', 'synced', 'stale', 'error'] as const

export type CompanionPluginStatus = (typeof companionPluginStatuses)[number]
export type SchemaProfileStatus = (typeof schemaProfileStatuses)[number]

export type PayloadSiteConfig = {
  apiKeyAuthCollection?: string | null
  apiKeySecretReference?: string | null
  baseURL?: string | null
  n8nReadAPIKeySecretReference?: string | null
  readableCollections?: string[] | null
  schemaProfileEndpoint?: string | null
}

export type SchemaProfileValidationResult =
  | {
      errors: string[]
      ok: false
    }
  | {
      normalizedProfile: Record<string, unknown>
      ok: true
      profileHash: string
    }

export type CompanionPluginCheckResult = {
  capabilities?: Record<string, unknown>
  companionPluginStatus: CompanionPluginStatus
  error?: string
  ok: boolean
  profileHash?: string
  schemaProfile?: Record<string, unknown>
  schemaProfileStatus: SchemaProfileStatus
}
