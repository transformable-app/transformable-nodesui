import { describe, expect, it } from 'vitest'

import { buildChatTriggerBody, parseChatTriggerResponse } from '@/n8n/agents/chatTriggerAdapter'
import { assertSameServerURL, buildAgentEndpoint } from '@/n8n/agents/buildEndpoint'
import { buildWebhookBody, parseWebhookResponse } from '@/n8n/agents/webhookAdapter'
import type { AgentInvocation } from '@/n8n/agents/types'

const invocation: AgentInvocation = {
  actor: {
    id: 'user-1',
    roles: ['User'],
  },
  context: {
    dashboard: 'ops',
  },
  input: {
    text: 'Summarize failures',
  },
  requestID: 'request-1',
  sessionID: 'session-1',
}

describe('agent transport adapters', () => {
  it('maps harness invocations to n8n Chat Trigger metadata', () => {
    expect(buildChatTriggerBody(invocation)).toEqual({
      action: 'sendMessage',
      chatInput: 'Summarize failures',
      metadata: {
        actor: invocation.actor,
        context: invocation.context,
        requestID: 'request-1',
      },
      sessionId: 'session-1',
    })
  })

  it('keeps webhook invocations in the canonical harness envelope', () => {
    expect(buildWebhookBody(invocation)).toEqual(invocation)
  })

  it('normalizes Chat Trigger responses', () => {
    expect(
      parseChatTriggerResponse({
        n8nExecutionID: 'exec-1',
        response: 'Done',
        status: 'succeeded',
      }),
    ).toMatchObject({
      content: 'Done',
      n8nExecutionID: 'exec-1',
      status: 'succeeded',
    })
  })

  it('normalizes webhook waiting responses', () => {
    expect(
      parseWebhookResponse({
        content: 'Waiting for callback',
        status: 'waiting',
      }),
    ).toMatchObject({
      content: 'Waiting for callback',
      status: 'waiting',
    })
  })

  it('rejects n8n test webhook paths', () => {
    expect(() =>
      buildAgentEndpoint({
        baseURL: 'https://n8n.example.com',
        endpointPath: '/webhook-test/agent',
      }),
    ).toThrow('production trigger')
  })

  it('allows approval resume URLs on the configured n8n server', () => {
    expect(
      assertSameServerURL({
        baseURL: 'https://n8n.example.com',
        targetURL: 'https://n8n.example.com/webhook-waiting/resume/abc',
      }).href,
    ).toBe('https://n8n.example.com/webhook-waiting/resume/abc')
  })

  it('rejects approval resume URLs on another origin', () => {
    expect(() =>
      assertSameServerURL({
        baseURL: 'https://n8n.example.com',
        targetURL: 'https://attacker.example.com/webhook-waiting/resume/abc',
      }),
    ).toThrow('configured server')
  })
})
