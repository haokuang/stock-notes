import { Injectable, NotFoundException } from '@nestjs/common'
import { AgentRepository } from './agent.repository'

@Injectable()
export class AgentService {
  constructor(private readonly repository: AgentRepository) {}

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
}
