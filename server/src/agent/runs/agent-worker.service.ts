import type { AgentOrchestrator, AgentOrchestratorResult } from '../agent-orchestrator'
import type { AgentCitation, AgentRun } from '../agent.types'
import type { AgentRunQueueRepository, ClaimedRun } from './run-queue.repository'

export interface AgentWorkerOptions {
  workerId: string
  concurrency?: number
  heartbeatIntervalMs?: number
  leaseMs?: number
  queue: AgentRunQueueRepository
  orchestrator: AgentOrchestrator
  onStage?: (runId: string, stage: AgentRun['stage']) => void | Promise<void>
  classifyError?: (error: Error) => WorkerClassification
}

const DEFAULT_CONCURRENCY = 2
const DEFAULT_HEARTBEAT_MS = 15_000
const DEFAULT_LEASE_MS = 45_000

const NON_RETRYABLE_CODES = new Set([
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_QUOTA_EXHAUSTED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_INVALID_REQUEST',
])

export interface WorkerClassification {
  retryable: boolean
  retryAfter: number | null
}

export function defaultClassify(error: Error): WorkerClassification {
  const message = error.message ?? ''
  for (const code of NON_RETRYABLE_CODES) {
    if (message.includes(code)) {
      const retryAfter: number | null = message.includes('PROVIDER_RATE_LIMITED') ? 60 : null
      return { retryable: false, retryAfter }
    }
  }
  return { retryable: true, retryAfter: null }
}

export class AgentWorker {
  private readonly workerId: string
  private readonly concurrency: number
  private readonly heartbeatIntervalMs: number
  private readonly leaseMs: number
  private readonly queue: AgentRunQueueRepository
  private readonly orchestrator: AgentOrchestrator
  private readonly onStage?: (runId: string, stage: AgentRun['stage']) => void | Promise<void>
  private readonly classifyError: (error: Error) => WorkerClassification
  private running = true

  constructor(options: AgentWorkerOptions) {
    this.workerId = options.workerId
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    this.queue = options.queue
    this.orchestrator = options.orchestrator
    this.onStage = options.onStage
    this.classifyError = options.classifyError ?? defaultClassify
  }

  stop(): void {
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }

  async tick(): Promise<void> {
    if (!this.running) return
    const claimed = await this.queue.claim({ workerId: this.workerId, limit: this.concurrency })
    if (claimed.length === 0) return
    await Promise.all(claimed.map((run) => this.processRun(run)))
  }

  private async processRun(run: ClaimedRun): Promise<void> {
    const heartbeat = setInterval(() => {
      void this.queue.heartbeat({ runId: run.id, workerId: this.workerId })
    }, this.heartbeatIntervalMs).unref?.()
    await this.onStage?.(run.id, 'generating')
    try {
      const result = await this.orchestrator.run({
        run: this.toRunShape(run),
        userId: run.userId,
        stockId: run.stockId,
        threadId: run.threadId,
      })
      await this.queue.finalizeSuccess({
        runId: run.id,
        workerId: this.workerId,
        userId: run.userId,
        threadId: run.threadId,
        content: result.content,
        model: run.model,
        provider: run.provider,
        citations: result.citations,
        providerMetadata: {},
      })
      await this.onStage?.(run.id, 'completed')
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      const classification = this.classifyError(error)
      if (classification.retryable && run.attemptCount < run.maxAttempts) {
        await this.queue.markRetryable({
          runId: run.id,
          workerId: this.workerId,
          errorCode: error.message.slice(0, 100),
          errorMessage: error.message.slice(0, 500),
        })
        await this.onStage?.(run.id, 'queued')
        return
      }
      await this.queue.markFailed({
        runId: run.id,
        workerId: this.workerId,
        errorCode: error.message.slice(0, 100),
        errorMessage: error.message.slice(0, 500),
        retryAfter: classification.retryAfter ?? null,
      })
      await this.onStage?.(run.id, 'failed')
    } finally {
      clearInterval(heartbeat)
    }
  }

  private toRunShape(run: ClaimedRun) {
    return {
      id: run.id,
      threadId: run.threadId,
      userId: run.userId,
      userMessageId: run.userMessageId,
      clientRequestId: '',
      provider: run.provider,
      model: run.model,
      credentialMode: 'api' as const,
      status: 'running' as const,
      stage: 'loading_context' as const,
      attemptCount: run.attemptCount,
      maxAttempts: run.maxAttempts,
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      retryAfter: null,
      createdAt: '',
      updatedAt: '',
    }
  }
}

export type { AgentOrchestratorResult, AgentCitation }
