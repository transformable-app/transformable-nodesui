import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import type { Endpoint } from 'payload'

import {
  SAMPLE_N8N_WORKFLOW_FILENAMES,
  SAMPLE_N8N_WORKFLOWS,
  getSampleWorkflowDownloadURL,
} from '@/n8n/agents/sampleWorkflows'

const docsWorkflowsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/n8n-workflows',
)

const getFilename = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  const filename = path.basename(value.trim())
  return SAMPLE_N8N_WORKFLOW_FILENAMES.has(filename) ? filename : null
}

export const sampleWorkflowEndpoints: Endpoint[] = [
  {
    handler: async () =>
      Response.json({
        docsPath: 'docs/n8n-workflows/README.md',
        workflows: SAMPLE_N8N_WORKFLOWS.map((workflow) => ({
          ...workflow,
          downloadURL: getSampleWorkflowDownloadURL(workflow.filename),
        })),
      }),
    method: 'get',
    path: '/n8n/sample-workflows',
  },
  {
    handler: async (req) => {
      const filename = getFilename(req.routeParams?.filename)
      if (!filename) {
        return Response.json({ error: 'Sample workflow not found.' }, { status: 404 })
      }

      try {
        const content = await readFile(path.join(docsWorkflowsDir, filename), 'utf8')

        return new Response(content, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
      } catch {
        return Response.json({ error: 'Sample workflow file is unavailable.' }, { status: 404 })
      }
    },
    method: 'get',
    path: '/n8n/sample-workflows/:filename',
  },
]
