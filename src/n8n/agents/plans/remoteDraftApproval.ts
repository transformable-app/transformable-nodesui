import { APIError, type PayloadRequest } from 'payload'

import type { AgentApproval, AgentRun } from '@/payload-types'
import { publishDraftDocument } from '@/payloadSites/client'

import { createRemoteDraftAudit } from './remoteDraftAudit'

const getRelationshipID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }

  return null
}

const getRemoteDraft = (run: AgentRun) =>
  run.remoteDraft && typeof run.remoteDraft === 'object' ? run.remoteDraft : null

const refreshPlanStatusAfterApproval = async ({
  planID,
  req,
}: {
  planID: string
  req: PayloadRequest
}) => {
  const tasks = await req.payload.find({
    collection: 'agent-plan-tasks',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    req,
    where: { plan: { equals: planID } },
  })
  const docs = tasks.docs
  const status = docs.some((task) => task.status === 'running')
    ? 'running'
    : docs.some((task) => task.status === 'waiting' || task.status === 'needs-approval')
      ? 'waiting'
      : docs.some((task) => task.status === 'failed' || task.status === 'blocked')
        ? 'failed'
        : docs.some((task) => task.status === 'cancelled')
          ? 'cancelled'
          : docs.every((task) => ['succeeded', 'skipped'].includes(String(task.status)))
            ? 'succeeded'
            : 'queued'

  await req.payload.update({
    collection: 'agent-plans',
    data: {
      finishedAt: ['succeeded', 'failed', 'cancelled'].includes(status)
        ? new Date().toISOString()
        : undefined,
      status,
    },
    id: planID,
    overrideAccess: true,
    req,
  })
}

export const createRemoteDraftPublishApproval = async ({
  req,
  runID,
}: {
  req: PayloadRequest
  runID: string
}) => {
  const run = await req.payload.findByID({
    collection: 'agent-runs',
    depth: 0,
    id: runID,
    overrideAccess: true,
    req,
  })
  const remoteDraft = getRemoteDraft(run)
  if (!remoteDraft || remoteDraft.status !== 'created') return null

  const agentID = getRelationshipID(run.agent)
  const sessionID = getRelationshipID(run.session)
  const userID = getRelationshipID(run.user)
  if (!agentID || !sessionID || !userID) return null

  const existingApproval = await req.payload.find({
    collection: 'agent-approvals',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      and: [
        { run: { equals: runID } },
        { approvalType: { equals: 'remote-draft-publish' } },
        { status: { in: ['pending', 'consuming'] } },
      ],
    },
  })
  if (existingApproval.docs[0]) return existingApproval.docs[0]

  const reviewURL =
    typeof remoteDraft.previewURL === 'string' && remoteDraft.previewURL
      ? remoteDraft.previewURL
      : typeof remoteDraft.adminURL === 'string' && remoteDraft.adminURL
        ? remoteDraft.adminURL
        : undefined

  return req.payload.create({
    collection: 'agent-approvals',
    data: {
      agent: agentID,
      approvalType: 'remote-draft-publish',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      prompt: `Review and publish the generated ${remoteDraft.collection || 'document'} draft${
        reviewURL ? `: ${reviewURL}` : '.'
      }`,
      run: runID,
      session: sessionID,
      status: 'pending',
      title: 'Publish remote draft',
      user: userID,
    },
    overrideAccess: true,
    req,
  })
}

export const resolveRemoteDraftPublishApproval = async ({
  approval,
  approved,
  req,
}: {
  approval: AgentApproval
  approved: boolean
  req: PayloadRequest
}) => {
  const runID = getRelationshipID(approval.run)
  if (!runID) throw new APIError('Approval run is not configured.', 500)

  const run = await req.payload.findByID({
    collection: 'agent-runs',
    depth: 0,
    id: runID,
    overrideAccess: true,
    req,
  })
  const remoteDraft = getRemoteDraft(run)
  const taskID = getRelationshipID(run.planTask)
  const planID = getRelationshipID(run.plan)
  const now = new Date().toISOString()

  if (!approved) {
    if (taskID) {
      await req.payload.update({
        collection: 'agent-plan-tasks',
        data: {
          errorCode: 'approval-rejected',
          errorMessage: 'Remote draft publish was rejected.',
          finishedAt: now,
          status: 'blocked',
        },
        id: taskID,
        overrideAccess: true,
        req,
      })
    }
    if (planID) await refreshPlanStatusAfterApproval({ planID, req })
    return
  }

  if (!remoteDraft || remoteDraft.status !== 'created') {
    throw new APIError('Remote draft is not ready to publish.', 400)
  }
  const payloadSiteID = getRelationshipID(remoteDraft.payloadSite)
  if (!payloadSiteID) throw new APIError('Remote draft is missing its target Payload site.', 400)
  if (typeof remoteDraft.collection !== 'string' || !remoteDraft.collection) {
    throw new APIError('Remote draft is missing its target collection.', 400)
  }
  if (typeof remoteDraft.documentID !== 'string' || !remoteDraft.documentID) {
    throw new APIError('Remote draft is missing its target document.', 400)
  }

  const payloadSite = await req.payload.findByID({
    collection: 'payload-sites',
    depth: 0,
    id: payloadSiteID,
    overrideAccess: true,
    req,
  })
  const attemptedAt = new Date().toISOString()

  try {
    const publishResponse = await publishDraftDocument({
      collection: remoteDraft.collection,
      id: remoteDraft.documentID,
      site: payloadSite,
    })

    await req.payload.update({
      collection: 'agent-runs',
      data: {
        remoteDraft: {
          ...remoteDraft,
          lastSyncedAt: new Date().toISOString(),
          response: publishResponse,
          status: 'published',
        },
      },
      id: runID,
      overrideAccess: true,
      req,
    })

    if (taskID) {
      await req.payload.update({
        collection: 'agent-plan-tasks',
        data: {
          finishedAt: new Date().toISOString(),
          status: 'succeeded',
        },
        id: taskID,
        overrideAccess: true,
        req,
      })
    }
    if (planID) await refreshPlanStatusAfterApproval({ planID, req })

    await createRemoteDraftAudit({
      audit: {
        adminURL: remoteDraft.adminURL,
        attemptedAt,
        collection: remoteDraft.collection,
        completedAt: new Date().toISOString(),
        mediaIDs: remoteDraft.mediaIDs,
        operation: 'publish',
        payloadSite: payloadSiteID,
        previewURL: remoteDraft.previewURL,
        remoteDocumentID: remoteDraft.documentID,
        remoteVersionID: remoteDraft.versionID,
        response: publishResponse,
        run: runID,
        status: 'succeeded',
      },
      req,
    })
  } catch (error) {
    await createRemoteDraftAudit({
      audit: {
        adminURL: remoteDraft.adminURL,
        attemptedAt,
        collection: remoteDraft.collection,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Remote draft publish failed.',
        operation: 'publish',
        payloadSite: payloadSiteID,
        previewURL: remoteDraft.previewURL,
        remoteDocumentID: remoteDraft.documentID,
        remoteVersionID: remoteDraft.versionID,
        run: runID,
        status: 'failed',
      },
      req,
    })
    throw error
  }
}
