import { useCallback, useEffect, useRef, useState } from 'react'
import { getAgentApi } from '../agent/agent-client'
import {
  isTerminal,
  mergeRun,
  pickActiveRun,
  shouldPoll,
  upsertMessages,
} from '../agent/agent-state'
import type { AgentMessage, AgentRun } from '../agent/agent.types'
import { useAgentRealtime } from './use-agent-realtime'

export interface AgentConversationState {
  threadId: string | null
  runId: string | null
  run: AgentRun | null
  messages: AgentMessage[]
  loading: boolean
  error: string | null
}

export interface UseAgentConversationOptions {
  threadId: string | null
  runId: string | null
  userId: string | null
  pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL = 1000
const MAX_POLL_INTERVAL = 5000

export function useAgentConversation({ threadId, runId, userId, pollIntervalMs = DEFAULT_POLL_INTERVAL }: UseAgentConversationOptions) {
  const [state, setState] = useState<AgentConversationState>({
    threadId,
    runId,
    run: null,
    messages: [],
    loading: false,
    error: null,
  })
  const pollingRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; interval: number }>({ timer: null, interval: pollIntervalMs })
  const runIdRef = useRef<string | null>(runId)
  const runRef = useRef<AgentRun | null>(null)
  const needsPollRef = useRef<boolean>(false)
  const channelErrorCountRef = useRef<number>(0)

  const stopPolling = useCallback(() => {
    if (pollingRef.current.timer) {
      clearTimeout(pollingRef.current.timer)
      pollingRef.current.timer = null
    }
  }, [])

  const startPolling = useCallback(() => {
    if (!threadId) return
    if (pollingRef.current.timer) return
    const tick = async () => {
      let latestRun = runRef.current
      try {
        const api = getAgentApi()
        if (runIdRef.current) {
          const run = await api.getRun(runIdRef.current)
          latestRun = run
          runRef.current = run
          setState((prev) => ({ ...prev, run: mergeRun(prev.run, run) }))
          if (isTerminal(run)) {
            stopPolling()
            return
          }
        }
        const page = await api.listMessages(threadId, null, 50)
        setState((prev) => ({ ...prev, messages: upsertMessages(prev.messages, page.items) }))
        pollingRef.current.interval = Math.min(MAX_POLL_INTERVAL, pollingRef.current.interval + 1000)
      } catch (cause) {
        setState((prev) => ({ ...prev, error: cause instanceof Error ? cause.message : '加载失败' }))
        pollingRef.current.interval = Math.min(MAX_POLL_INTERVAL, pollingRef.current.interval + 1000)
      }
      if (needsPollRef.current || shouldPoll(latestRun)) {
        pollingRef.current.timer = setTimeout(tick, pollingRef.current.interval)
      }
    }
    pollingRef.current.timer = setTimeout(tick, pollingRef.current.interval)
  }, [stopPolling, threadId])

  const handleChannelState = useCallback(
    (next: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => {
      if (next === 'SUBSCRIBED') {
        needsPollRef.current = false
        stopPolling()
        channelErrorCountRef.current = 0
        return
      }
      channelErrorCountRef.current += 1
      needsPollRef.current = true
      pollingRef.current.interval = pollIntervalMs
      startPolling()
    },
    [pollIntervalMs, startPolling, stopPolling],
  )

  useAgentRealtime({
    threadId,
    runId,
    userId,
    onEvent: (event) => {
      if (event.kind === 'message') {
        setState((prev) => ({ ...prev, messages: upsertMessages(prev.messages, [event.payload as AgentMessage]) }))
        return
      }
      setState((prev) => ({ ...prev, run: mergeRun(prev.run, event.payload as AgentRun) }))
      runRef.current = event.payload as AgentRun
    },
    onChannelState: handleChannelState,
  })

  useEffect(() => {
    if (!threadId) return
    runIdRef.current = runId
    setState((prev) => ({ ...prev, threadId, runId, loading: true, error: null }))
    const api = getAgentApi()
    Promise.all([
      runId ? api.getRun(runId).catch(() => null) : Promise.resolve(null),
      api.listMessages(threadId, null, 50),
    ])
      .then(([run, page]) => {
        const runs = run ? [run] : []
        const activeRun = pickActiveRun(runs)
        runRef.current = activeRun
        setState((prev) => ({
          ...prev,
          loading: false,
          run: activeRun,
          messages: upsertMessages(prev.messages, page.items),
          error: null,
        }))
        if (shouldPoll(activeRun) && needsPollRef.current) {
          startPolling()
        }
      })
      .catch((cause) => {
        setState((prev) => ({ ...prev, loading: false, error: cause instanceof Error ? cause.message : '加载失败' }))
      })
    return () => {
      stopPolling()
    }
  }, [runId, startPolling, stopPolling, threadId])

  return {
    state,
    stopPolling,
    startPolling,
  }
}
