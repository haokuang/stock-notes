import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { AgentWorker } from './agent-worker.service'
import type { RunRecoveryService } from './run-recovery.service'

interface RuntimeWorker {
  tick(): Promise<void>
  stop(): void
}

interface RuntimeRecovery {
  recoverOnce(): Promise<{ requeued: string[]; failed: string[] }>
}

export interface AgentRuntimeOptions {
  worker: RuntimeWorker
  recovery: RuntimeRecovery
  pollMs: number
  setIntervalFn?: (callback: () => void, ms: number) => ReturnType<typeof setInterval>
  clearIntervalFn?: (timer: ReturnType<typeof setInterval>) => void
}

@Injectable()
export class AgentRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRuntimeService.name)
  private readonly options: AgentRuntimeOptions
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false

  constructor(options: AgentRuntimeOptions) {
    this.options = options
  }

  async onModuleInit(): Promise<void> {
    await this.tick()
    const schedule = this.options.setIntervalFn ?? setInterval
    this.timer = schedule(() => { void this.tick() }, this.options.pollMs)
    this.timer.unref?.()
  }

  onModuleDestroy(): void {
    this.options.worker.stop()
    if (this.timer) {
      const clear = this.options.clearIntervalFn ?? clearInterval
      clear(this.timer)
      this.timer = null
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      await this.options.recovery.recoverOnce()
      await this.options.worker.tick()
    } catch (cause) {
      this.logger.error(`Agent worker tick failed: ${cause instanceof Error ? cause.name : 'unknown'}`)
    } finally {
      this.ticking = false
    }
  }
}

export type { AgentWorker, RunRecoveryService }
