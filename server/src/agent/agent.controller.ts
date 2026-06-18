import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { CurrentUser } from '../storage/auth/current-user.decorator'
import { CreateAgentThreadDto, RetryAgentRunDto, SubmitAgentMessageDto } from './agent.dto'
import { AgentService } from './agent.service'

@Controller('agent')
export class AgentController {
  constructor(private readonly service: AgentService) {}

  @Get('threads')
  async getThread(@CurrentUser() user: { id: string }, @Query('stock_id') stockId: string) {
    return { data: await this.service.getThread(user.id, stockId?.trim()) }
  }

  @Post('threads')
  @HttpCode(200)
  async createThread(@CurrentUser() user: { id: string }, @Body() dto: CreateAgentThreadDto) {
    return { data: await this.service.createThread(user.id, dto.stock_id) }
  }

  @Post('threads/:id/messages')
  @HttpCode(200)
  async submitMessage(
    @CurrentUser() user: { id: string },
    @Param('id') threadId: string,
    @Body() dto: SubmitAgentMessageDto,
  ) {
    return { data: await this.service.submitMessage({ userId: user.id, threadId, dto }) }
  }

  @Post('runs/:id/retry')
  @HttpCode(200)
  async retryRun(
    @CurrentUser() user: { id: string },
    @Param('id') runId: string,
    @Body() dto: RetryAgentRunDto,
  ) {
    return { data: await this.service.retryRun({ userId: user.id, runId, dto }) }
  }

  @Get('threads/:id/messages')
  async getMessages(
    @CurrentUser() user: { id: string },
    @Param('id') threadId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit ?? 20)
    const normalizedLimit = Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.trunc(parsed))) : 20
    return { data: await this.service.getMessages(user.id, threadId, cursor ?? null, normalizedLimit) }
  }

  @Get('runs/:id')
  async getRun(@CurrentUser() user: { id: string }, @Param('id') runId: string) {
    return { data: await this.service.getRun(user.id, runId) }
  }

  @Get('reports')
  async getReports(@CurrentUser() user: { id: string }, @Query('stock_id') stockId: string) {
    return { data: await this.service.getReports(user.id, stockId?.trim()) }
  }

  @Get('models')
  @HttpCode(200)
  async getModels() {
    return { data: this.service.listModels() }
  }
}