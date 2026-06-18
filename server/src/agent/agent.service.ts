import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { AgentModelOption } from './agent.types'
import { AgentRepository } from './agent.repository'
import { buildModelCatalog, loadProviderConfig } from './providers/provider-config'
import { ProviderHealthService } from './providers/provider-health.service'
import { PG_POOL } from '../storage/database/database.module'
import {
  AgentActiveRunError,
  submitAgentMessage,
  SubmissionOutcome,
} from './runs/run-submission'
import { SubmitAgentMessageDto, RetryAgentRunDto } from './agent.dto'
import {
  AgentReportError,
  createAgentReportService,
  type AgentReportDetail,
} from './report.service'

export interface SubmitMessageInput {
  userId: string
  threadId: string
  dto: SubmitAgentMessageDto
}

export interface RetryRunInput {
  userId: string
  runId: string
  dto: RetryAgentRunDto
}

export interface SubmitMessageResult {
  messageId: string
  threadId: string
  run: SubmissionOutcome['run']
  replayed: boolean
}

export interface RetryRunResult {
  messageId: string
  threadId: string
  run: SubmissionOutcome['run']
  retryOfRunId: string
}

@Injectable()
export class AgentService {
  constructor(
    private readonly repository: AgentRepository,
    private readonly health: ProviderHealthService,
    @Inject(PG_POOL) private readonly pool: { connect(): Promise<PoolClient> },
  ) {}

  async getThread(userId: string, stockId: string) {
    return this.repository.findThreadByStock(userId, stockId)
  }

  async createThread(userId: string, stockId: string) {
    try {
      return await this.repository.getOrCreateThread(userId, stockId)
    } catch {
      throw new NotFoundException('资源不存在')
    }
  }

  async getMessages(userId: string, threadId: string, cursor: string | null, limit: number) {
    const thread = await this.repository.findThread(userId, threadId)
    if (!thread) throw new NotFoundException('资源不存在')
    return this.repository.listMessages(userId, threadId, cursor, limit)
  }

  async getRun(userId: string, runId: string) {
    const run = await this.repository.findRun(userId, runId)
    if (!run) throw new NotFoundException('资源不存在')
    return run
  }

  async getReports(userId: string, stockId: string) {
    return this.repository.listReports(userId, stockId)
  }

  listModels(): AgentModelOption[] {
    const config = loadProviderConfig(process.env)
    return buildModelCatalog(config, this.health.snapshot())
  }

  async submitMessage(input: SubmitMessageInput): Promise<SubmitMessageResult> {
    const client = await this.pool.connect()
    try {
      const outcome = await submitAgentMessage({
        userId: input.userId,
        threadId: input.threadId,
        dto: input.dto,
        client: client as unknown as PoolClient,
      })
      return {
        messageId: outcome.message.id,
        threadId: outcome.message.threadId,
        run: outcome.run,
        replayed: outcome.kind === 'replay',
      }
    } catch (cause) {
      if (cause instanceof AgentActiveRunError) {
        throw cause
      }
      throw cause
    } finally {
      client.release?.()
    }
  }

  async retryRun(input: RetryRunInput): Promise<RetryRunResult> {
    const originalRun = await this.repository.findRun(input.userId, input.runId)
    if (!originalRun) throw new NotFoundException('资源不存在')
    if (originalRun.status !== 'failed') {
      throw new NotFoundException('资源不存在')
    }
    const originalMessage = await this.repository.findUserMessage(input.userId, originalRun.userMessageId)
    if (!originalMessage) throw new NotFoundException('资源不存在')
    const dto: SubmitAgentMessageDto = Object.assign(new SubmitAgentMessageDto(), {
      content: originalMessage.content,
      provider: input.dto.provider ?? originalRun.provider,
      model: input.dto.model ?? originalRun.model,
      clientRequestId: input.dto.clientRequestId,
    })
    if (!isProviderAllowed(dto.provider) || !isModelAllowed(dto.model)) {
      throw new NotFoundException('资源不存在')
    }
    const submit = await this.submitMessage({
      userId: input.userId,
      threadId: originalRun.threadId,
      dto,
    })
    return {
      messageId: submit.messageId,
      threadId: submit.threadId,
      run: submit.run,
      retryOfRunId: originalRun.id,
    }
  }

  async saveReport(input: { userId: string; runId: string }): Promise<AgentReportDetail> {
    const service = createAgentReportService({ clientFactory: () => this.pool.connect() })
    try {
      return await service.saveReport(input)
    } catch (cause) {
      if (cause instanceof AgentReportError) {
        if (cause.statusCode === 404) throw new NotFoundException('资源不存在')
      }
      throw cause
    }
  }

  async getReport(input: { userId: string; reportId: string }): Promise<AgentReportDetail> {
    const service = createAgentReportService({ clientFactory: () => this.pool.connect() })
    try {
      return await service.getReport(input)
    } catch (cause) {
      if (cause instanceof AgentReportError && cause.statusCode === 404) {
        throw new NotFoundException('资源不存在')
      }
      throw cause
    }
  }

  async listReports(input: { userId: string; stockId: string }) {
    const service = createAgentReportService({ clientFactory: () => this.pool.connect() })
    return service.listReports(input)
  }
}

function isProviderAllowed(provider: string): boolean {
  return ['deepseek', 'openai', 'minimax'].includes(provider)
}

function isModelAllowed(model: string): boolean {
  const config = loadProviderConfig(process.env)
  const allowed: string[] = []
  if (config.deepseek.model) allowed.push(config.deepseek.model)
  if (config.openai.model) allowed.push(config.openai.model)
  if (config.minimax.model) allowed.push(config.minimax.model)
  return allowed.includes(model)
}