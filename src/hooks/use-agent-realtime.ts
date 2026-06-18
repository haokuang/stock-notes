import { useEffect } from 'react'
import { getSupabase } from '../lib/supabase'
import type { AgentMessage, AgentRun } from '../agent/agent.types'

interface AgentMessageRawRow {
  id: string
  thread_id: string
  user_id: string
  role: string
  content: string
  provider: string | null
  model: string | null
  run_id: string | null
  citations: unknown
  metadata: unknown
  created_at: string
}

interface AgentRunRawRow {
  id: string
  thread_id: string
  user_id: string
  user_message_id: string
  client_request_id: string
  provider: string
  model: string
  credential_mode: string | null
  status: string
  stage: string
  attempt_count: number
  max_attempts: number
  locked_at: string | null
  locked_by: string | null
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
  retry_after: number | null
  created_at: string
  updated_at: string
}

function toAgentMessage(row: AgentMessageRawRow): AgentMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    role: row.role as AgentMessage['role'],
    content: row.content,
    provider: (row.provider ?? null) as AgentMessage['provider'],
    model: row.model,
    runId: row.run_id,
    citations: Array.isArray(row.citations) ? (row.citations as AgentMessage['citations']) : [],
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : {},
    createdAt: row.created_at,
  }
}

function toAgentRun(row: AgentRunRawRow): AgentRun {
  return {
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    userMessageId: row.user_message_id,
    clientRequestId: row.client_request_id,
    provider: row.provider as AgentRun['provider'],
    model: row.model,
    credentialMode: (row.credential_mode ?? null) as AgentRun['credentialMode'],
    status: row.status as AgentRun['status'],
    stage: row.stage as AgentRun['stage'],
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryAfter: row.retry_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface AgentRealtimeEvent {
  kind: 'message' | 'run'
  payload: AgentMessage | AgentRun
}

export interface UseAgentRealtimeOptions {
  threadId: string | null
  runId: string | null
  userId: string | null
  onEvent: (event: AgentRealtimeEvent) => void
  onChannelState?: (state: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => void
}

interface RealtimeChannel {
  on: (...args: unknown[]) => RealtimeChannel
  subscribe: (cb?: (status: string, error?: unknown) => void) => RealtimeChannel
}

interface SupabaseClient {
  channel: (name: string) => RealtimeChannel
  removeChannel: (channel: RealtimeChannel) => void
}

/**
 * Subscribe to agent_runs + agent_messages rows scoped by thread_id / run_id.
 * Filters at the database level are advisory; this hook also re-checks the
 * scoped identifiers in the callback to defend against cross-tenant leakage
 * if RLS is ever weakened.
 */
export function useAgentRealtime({ threadId, runId, userId, onEvent, onChannelState }: UseAgentRealtimeOptions) {
  useEffect(() => {
    if (!threadId) return
    const supabase = getSupabase() as unknown as SupabaseClient
    const channel = supabase
      .channel(`agent:${threadId}:${runId ?? 'none'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: AgentMessageRawRow; old: AgentMessageRawRow | null }) => {
          if (payload.eventType === 'DELETE') return
          const row = payload.new
          if (!row?.id || row.thread_id !== threadId) return
          if (userId && row.user_id && row.user_id !== userId) return
          onEvent({ kind: 'message', payload: toAgentMessage(row) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_runs',
          filter: runId ? `id=eq.${runId}` : `thread_id=eq.${threadId}`,
        },
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: AgentRunRawRow; old: AgentRunRawRow | null }) => {
          if (payload.eventType === 'DELETE') return
          const row = payload.new
          if (!row?.id) return
          if (runId && row.id !== runId) return
          if (row.thread_id !== threadId) return
          if (userId && row.user_id && row.user_id !== userId) return
          onEvent({ kind: 'run', payload: toAgentRun(row) })
        },
      )
      .subscribe((status) => {
        if (!onChannelState) return
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onChannelState(status)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [threadId, runId, userId])
}