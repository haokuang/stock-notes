import { useEffect } from 'react'
import { getSupabase } from '../lib/supabase'
import type { AgentMessage, AgentRun } from '../agent/agent.types'

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
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: AgentMessage; old: AgentMessage | null }) => {
          if (payload.eventType === 'DELETE') return
          const message = payload.new
          if (!message?.id || message.thread_id !== threadId) return
          if (userId && message.user_id && message.user_id !== userId) return
          onEvent({ kind: 'message', payload: message })
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
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: AgentRun; old: AgentRun | null }) => {
          if (payload.eventType === 'DELETE') return
          const run = payload.new
          if (!run?.id) return
          if (runId && run.id !== runId) return
          if (run.thread_id !== threadId) return
          if (userId && run.user_id && run.user_id !== userId) return
          onEvent({ kind: 'run', payload: run })
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