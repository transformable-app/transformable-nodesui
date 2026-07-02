import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PayloadSite } from '@/payload-types'
import { uploadMediaDocument, writeDraftDocument } from '@/payloadSites/client'

import { writeCMSDraftFromTaskOutput } from '@/n8n/agents/plans/cmsDraftWriter'

vi.mock('@/payloadSites/client', () => ({
  uploadMediaDocument: vi.fn(),
  writeDraftDocument: vi.fn(),
}))

const mockedUploadMediaDocument = vi.mocked(uploadMediaDocument)
const mockedWriteDraftDocument = vi.mocked(writeDraftDocument)

const makeSite = (overrides: Partial<PayloadSite> = {}): PayloadSite =>
  ({
    id: 'site-1',
    adminURL: 'https://target.test/admin',
    allowedCollections: ['pages', 'media'],
    apiKeyAuthCollection: 'users',
    apiKeySecretReference: 'secret-ref',
    baseURL: 'https://target.test',
    companionPluginStatus: 'connected',
    enabled: true,
    fieldAllowlists: [
      {
        collection: 'pages',
        paths: ['title', 'hero', 'hero.image', 'layout', 'layout.*', 'layout.*.blockType', 'layout.*.heading'],
      },
    ],
    schemaProfile: {
      collections: [
        {
          blocks: [{ slug: 'content' }],
          fields: [],
          slug: 'pages',
        },
      ],
      plugin: { name: 'nodesui-companion', version: '0.1.0' },
      urlTemplates: {
        admin: '/admin/collections/{collection}/{id}?version={versionID}',
        preview: '/preview/{collection}/{id}?locale={locale}&tenant={tenant}',
      },
    },
    schemaProfileStatus: 'synced',
    slug: 'primary',
    writeBackEnabled: true,
    ...overrides,
  }) as PayloadSite

const makeReq = (site: PayloadSite) => {
  const updates: Array<Record<string, unknown>> = []
  return {
    payload: {
      find: vi.fn(async () => ({ docs: [site] })),
      findByID: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'payload-sites') return site
        throw new Error('not found')
      }),
      update: vi.fn(async (args: Record<string, unknown>) => {
        updates.push(args)
        return args.data
      }),
      create: vi.fn(async (args: Record<string, unknown>) => args.data),
    },
    updates,
  }
}

const output = (overrides: Record<string, unknown> = {}) => ({
  document: {
    layout: [{ blockType: 'content', heading: 'Draft heading' }],
    title: 'Draft page',
  },
  target: {
    collection: 'pages',
    locale: 'en',
    operation: 'create',
    payloadSite: 'primary',
    tenant: 'default',
  },
  ...overrides,
})

const outputBinding = {
  allowedBlocks: ['content'],
  allowedFields: ['title', 'hero', 'hero.image', 'layout', 'layout.*', 'layout.*.blockType', 'layout.*.heading'],
  collection: 'pages',
  payloadSite: 'primary',
}

const targetOnlyOutputBinding = {
  collection: 'pages',
  payloadSite: 'primary',
}

describe('cms-draft remote writer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mockedWriteDraftDocument.mockResolvedValue({
      id: 'remote-doc-1',
      version: { id: 'version-1' },
    })
    mockedUploadMediaDocument.mockResolvedValue({
      id: 'media-1',
      mimeType: 'image/png',
      response: { id: 'media-1' },
    })
  })

  it('writes a remote draft and records reviewable admin and preview URLs', async () => {
    const req = makeReq(makeSite())

    const remoteDraft = await writeCMSDraftFromTaskOutput({
      outputBinding,
      output: output(),
      req: req as never,
      runID: 'run-1',
    })

    expect(mockedWriteDraftDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        operation: 'create',
        site: expect.objectContaining({ id: 'site-1' }),
      }),
    )
    expect(remoteDraft).toEqual(
      expect.objectContaining({
        adminURL: 'https://target.test/admin/collections/pages/remote-doc-1?version=version-1',
        documentID: 'remote-doc-1',
        previewURL: 'https://target.test/preview/pages/remote-doc-1?locale=en&tenant=default',
        status: 'created',
        versionID: 'version-1',
      }),
    )
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'agent-runs',
        data: { remoteDraft },
        id: 'run-1',
      }),
    )
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'remote-draft-audits',
        data: expect.objectContaining({
          collection: 'pages',
          payloadSite: 'site-1',
          remoteDocumentID: 'remote-doc-1',
          run: 'run-1',
          status: 'succeeded',
        }),
      }),
    )
  })

  it('fetches allowed media URLs, uploads media, and writes the uploaded media id into the document', async () => {
    const req = makeReq(makeSite())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image'], { type: 'image/png' }), {
        headers: { 'content-length': '5', 'content-type': 'image/png' },
        status: 200,
      })),
    )

    await writeCMSDraftFromTaskOutput({
      outputBinding,
      output: output({
        document: {
          hero: {},
          layout: [{ blockType: 'content', heading: 'Draft heading' }],
          title: 'Draft page',
        },
        mediaRequests: [
          {
            alt: 'Hero image',
            id: 'hero',
            purpose: 'block-asset',
            sourceURL: 'https://assets.test/hero.png',
            targetFieldPath: 'hero.image',
          },
        ],
      }),
      req: req as never,
      runID: 'run-1',
    })

    expect(mockedUploadMediaDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        alt: 'Hero image',
        collection: 'media',
        filename: 'hero.png',
        mimeType: 'image/png',
      }),
    )
    expect(mockedWriteDraftDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hero: { image: 'media-1' },
        }),
      }),
    )
  })

  it('rejects media source URLs that violate URL policy', async () => {
    const req = makeReq(makeSite())

    await expect(
      writeCMSDraftFromTaskOutput({
        outputBinding: targetOnlyOutputBinding,
        output: output({
          document: {
            hero: {},
            layout: [{ blockType: 'content', heading: 'Draft heading' }],
            title: 'Draft page',
          },
          mediaRequests: [
            {
              alt: 'Hero image',
              id: 'hero',
              purpose: 'block-asset',
              sourceURL: 'ftp://assets.test/hero.png',
              targetFieldPath: 'hero.image',
            },
          ],
        }),
        req: req as never,
        runID: 'run-1',
      }),
    ).rejects.toThrow('Media source URL must use HTTP or HTTPS.')

    expect(mockedUploadMediaDocument).not.toHaveBeenCalled()
    expect(mockedWriteDraftDocument).not.toHaveBeenCalled()
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'remote-draft-audits',
        data: expect.objectContaining({
          error: 'Media source URL must use HTTP or HTTPS.',
          payloadSite: 'site-1',
          run: 'run-1',
          status: 'failed',
        }),
      }),
    )
  })

  it('rejects generated fields outside the site field allowlist', async () => {
    const req = makeReq(makeSite())

    await expect(
      writeCMSDraftFromTaskOutput({
        outputBinding: targetOnlyOutputBinding,
        output: output({
          document: {
            layout: [{ blockType: 'content', heading: 'Draft heading' }],
            secretField: 'not allowed',
            title: 'Draft page',
          },
        }),
        req: req as never,
        runID: 'run-1',
      }),
    ).rejects.toThrow('Generated document field "secretField" is not allowlisted.')

    expect(mockedWriteDraftDocument).not.toHaveBeenCalled()
  })

  it('rejects generated blocks outside the site block allowlist', async () => {
    const req = makeReq(makeSite())

    await expect(
      writeCMSDraftFromTaskOutput({
        outputBinding: targetOnlyOutputBinding,
        output: output({
          document: {
            layout: [{ blockType: 'hero', heading: 'Blocked' }],
            title: 'Draft page',
          },
        }),
        req: req as never,
        runID: 'run-1',
      }),
    ).rejects.toThrow('Block type "hero" is not allowed for this site.')

    expect(mockedWriteDraftDocument).not.toHaveBeenCalled()
  })

  it('rejects missing or mismatched cms-draft output bindings before remote writes', async () => {
    const req = makeReq(makeSite())

    await expect(
      writeCMSDraftFromTaskOutput({
        output: output(),
        req: req as never,
        runID: 'run-1',
      }),
    ).rejects.toThrow('CMS draft output binding is required.')

    await expect(
      writeCMSDraftFromTaskOutput({
        outputBinding: { collection: 'posts', payloadSite: 'primary' },
        output: output(),
        req: req as never,
        runID: 'run-1',
      }),
    ).rejects.toThrow('CMS draft target collection does not match the output binding.')

    expect(mockedWriteDraftDocument).not.toHaveBeenCalled()
  })
})
