import { APIError } from 'payload'

import { fetchSchemaProfile } from './client'
import type { CompanionPluginCheckResult, PayloadSiteConfig } from './types'

export const checkCompanionPlugin = async (
  site: PayloadSiteConfig,
): Promise<CompanionPluginCheckResult> => {
  try {
    const profile = await fetchSchemaProfile(site)
    const plugin = profile.normalizedProfile.plugin
    const capabilities =
      profile.normalizedProfile.capabilities &&
      typeof profile.normalizedProfile.capabilities === 'object' &&
      !Array.isArray(profile.normalizedProfile.capabilities)
        ? (profile.normalizedProfile.capabilities as Record<string, unknown>)
        : undefined

    return {
      capabilities,
      companionPluginStatus:
        plugin && typeof plugin === 'object' && 'compatible' in plugin && plugin.compatible === false
          ? 'stale'
          : 'connected',
      ok: true,
      profileHash: profile.profileHash,
      schemaProfile: profile.normalizedProfile,
      schemaProfileStatus: 'synced',
    }
  } catch (error) {
    const message = error instanceof APIError ? error.message : 'Companion plugin check failed.'
    return {
      companionPluginStatus: 'error',
      error: message,
      ok: false,
      schemaProfileStatus: 'error',
    }
  }
}
