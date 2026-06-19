import type { AgentRunQueueRepository } from './run-queue.repository'

export interface RunRecoveryServiceOptions {
  queue: AgentRunQueueRepository
  leaseMs?: number
  now?: () => Date
  classifyRun?: (runId: string) => Promise<{ exhausted: boolean; attemptCount: number; maxAttempts: number }>
}

export class RunRecoveryService {
  private readonly queue: AgentRunQueueRepository
  private readonly leaseMs: number
  private readonly classifyRun?: RunRecoveryServiceOptions['classifyRun']

  constructor(options: RunRecoveryServiceOptions) {
    this.queue = options.queue
    this.leaseMs = options.leaseMs ?? 45_000
    this.classifyRun = options.classifyRun
  }

  async recoverOnce(): Promise<{ requeued: string[]; failed: string[] }> {
    const expired = await this.queue.scanExpiredLeases({ leaseMs: this.leaseMs })
    const requeued: string[] = []
    const failed: string[] = []
    for (const runId of expired) {
      if (!this.classifyRun) {
        const status = await this.queue.recoverExpiredRun({ runId, leaseMs: this.leaseMs })
        if (status === 'queued') requeued.push(runId)
        if (status === 'failed') failed.push(runId)
        continue
      }
      const info = this.classifyRun ? await this.classifyRun(runId) : null
      if (info && info.exhausted) {
        await this.queue.markFailed({
          runId,
          workerId: 'recovery',
          errorCode: 'AGENT_WORKER_LOST',
          errorMessage: 'lease expired without completion',
        })
        failed.push(runId)
        continue
      }
      await this.queue.markRetryable({
        runId,
        workerId: 'recovery',
        errorCode: 'AGENT_WORKER_LOST',
        errorMessage: 'lease expired without completion',
      })
      requeued.push(runId)
    }
    return { requeued, failed }
  }
}
