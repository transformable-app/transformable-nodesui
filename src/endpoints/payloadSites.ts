import { APIError, type Endpoint } from 'payload'

import { checkRole } from '@/access/utilities'
import { checkCompanionPlugin } from '@/payloadSites/companionPlugin'

type PayloadSiteEndpointRequest = Parameters<Endpoint['handler']>[0]

const requireAdmin = (req: PayloadSiteEndpointRequest) => {
  if (!req.user || !checkRole(['Admin'], req.user)) {
    throw new APIError('Unauthorized', 401)
  }
}

const getSite = async (req: PayloadSiteEndpointRequest) => {
  const id = String(req.routeParams?.id ?? '')
  if (!id) throw new APIError('Payload site id is required.', 400)

  return req.payload.findByID({
    collection: 'payload-sites',
    depth: 0,
    id,
    overrideAccess: true,
    req,
  })
}

const getCheckData = async (req: PayloadSiteEndpointRequest) => {
  requireAdmin(req)
  const site = await getSite(req)
  const result = await checkCompanionPlugin({
    apiKeyAuthCollection: site.apiKeyAuthCollection,
    apiKeySecretReference: site.apiKeySecretReference,
    baseURL: site.baseURL,
    schemaProfileEndpoint: site.schemaProfileEndpoint,
  })

  return { result, site }
}

export const payloadSiteCollectionEndpoints: Endpoint[] = [
  {
    path: '/:id/check-companion-plugin',
    method: 'post',
    handler: async (req) => {
      const { result, site } = await getCheckData(req)
      await req.payload.update({
        collection: 'payload-sites',
        data: {
          companionPluginError: result.error,
          companionPluginLastCheckedAt: new Date().toISOString(),
          companionPluginStatus: result.companionPluginStatus,
          schemaProfileStatus: result.schemaProfileStatus,
        },
        id: site.id,
        overrideAccess: true,
        req,
      })

      return Response.json(result, { status: result.ok ? 200 : 502 })
    },
  },
  {
    path: '/:id/sync-schema-profile',
    method: 'post',
    handler: async (req) => {
      const { result, site } = await getCheckData(req)
      if (!result.ok || !result.schemaProfile || !result.profileHash) {
        await req.payload.update({
          collection: 'payload-sites',
          data: {
            companionPluginError: result.error,
            companionPluginLastCheckedAt: new Date().toISOString(),
            companionPluginStatus: result.companionPluginStatus,
            schemaProfileStatus: result.schemaProfileStatus,
          },
          id: site.id,
          overrideAccess: true,
          req,
        })

        return Response.json(result, { status: 502 })
      }

      const previousHash = typeof site.schemaProfileHash === 'string' ? site.schemaProfileHash : undefined
      const schemaProfileStatus = previousHash && previousHash !== result.profileHash ? 'stale' : 'synced'

      const updatedSite = await req.payload.update({
        collection: 'payload-sites',
        data: {
          capabilities: result.capabilities,
          companionPluginError: undefined,
          companionPluginLastCheckedAt: new Date().toISOString(),
          companionPluginStatus: result.companionPluginStatus,
          schemaProfile: result.schemaProfile,
          schemaProfileHash: result.profileHash,
          schemaProfileStatus,
          schemaProfileSyncedAt: new Date().toISOString(),
          writeBackEnabled: schemaProfileStatus === 'synced' ? site.writeBackEnabled : false,
        },
        id: site.id,
        overrideAccess: true,
        req,
      })

      return Response.json({ ok: true, payloadSite: updatedSite, schemaProfileStatus })
    },
  },
  {
    path: '/:id/schema-profile',
    method: 'get',
    handler: async (req) => {
      requireAdmin(req)
      const site = await getSite(req)

      return Response.json({
        schemaProfile: site.schemaProfile,
        schemaProfileHash: site.schemaProfileHash,
        schemaProfileStatus: site.schemaProfileStatus,
        schemaProfileSyncedAt: site.schemaProfileSyncedAt,
      })
    },
  },
]
