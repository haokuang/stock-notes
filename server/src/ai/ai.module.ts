import {
  Module,
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
  Get,
  Param,
} from '@nestjs/common'
import { IsString, IsOptional, IsNotEmpty, IsArray, IsUrl, MaxLength } from 'class-validator'
import { LLMClient } from 'coze-coding-dev-sdk'
import { DailyBriefService } from './daily-brief.service'
import { CurrentUser } from '../storage/auth/current-user.decorator'

/**
 * AI 分析模块
 * 提供：
 * - POST /ai/image-understand  单图解读（多模态）
 * - POST /ai/analyze-stock     跨观点分析（文本生成）
 * - POST /ai/daily-brief       今日简评（Tushare + 联网搜索 + 豆包）
 * - POST /ai/chat              通用对话
 *
 * 注：实际项目中应使用豆包/DeepSeek/Kimi 等大模型。
 * SDK 提供了 llm 命名空间，先做接口骨架，等用户在 .env 配置模型凭据后即可启用。
 */

class ImageUnderstandDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  imageUrl!: string

  @IsString()
  @IsOptional()
  @MaxLength(200)
  context?: string
}

class AnalyzeStockDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  stockCode!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  stockName!: string

  @IsArray()
  notes!: Array<{
    title: string
    content?: string
    direction: string
    createdAt: string
    entryPrice?: string
    targetPrice?: string
  }>
}

class ChatDto {
  @IsString()
  @IsNotEmpty()
  message!: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  model?: string
}

@Controller('ai')
export class AiController {
  constructor(private readonly dailyBriefService: DailyBriefService) {}

  /** 单图解读：把图片 URL + 上下文传给多模态模型 */
  @Post('image-understand')
  @HttpCode(200)
  async imageUnderstand(@Body() dto: ImageUnderstandDto) {
    if (!dto.imageUrl) throw new BadRequestException('imageUrl 必填')
    // 占位实现：返回模拟分析结果
    return {
      data: {
        summary: '【占位解读】K 线图显示过去 30 日呈震荡上行趋势，MACD 金叉后量能配合良好。',
        keyPoints: [
          '近 30 日累计涨幅 +12.4%',
          '成交量较 30 日均值放大 1.3 倍',
          '突破前期箱体上沿 218.50 元',
        ],
        sentiment: 'neutral',
        confidence: 0.78,
        imageUrl: dto.imageUrl,
        mock: true,
        msg: 'AI 模型凭据未配置，当前返回占位结果',
      },
    }
  }

  /** 跨观点分析：汇总该股所有历史观点 */
  @Post('analyze-stock')
  @HttpCode(200)
  async analyzeStock(@Body() dto: AnalyzeStockDto) {
    if (!dto.stockCode || !dto.notes || dto.notes.length === 0) {
      throw new BadRequestException('stockCode 与 notes 必填')
    }
    const bullCount = dto.notes.filter((n) => n.direction === 'bull').length
    const bearCount = dto.notes.filter((n) => n.direction === 'bear').length
    const neutralCount = dto.notes.filter((n) => n.direction === 'neutral').length

    return {
      data: {
        stockCode: dto.stockCode,
        stockName: dto.stockName,
        totalNotes: dto.notes.length,
        directionDistribution: { bull: bullCount, bear: bearCount, neutral: neutralCount },
        report: `【${dto.stockName} · 投研复盘】\n\n基于你的 ${dto.notes.length} 条历史观点，看多 ${bullCount} 条 / 看空 ${bearCount} 条 / 中性 ${neutralCount} 条。\n\n核心论点：\n1. ...\n2. ...\n3. ...\n\n潜在风险：\n- ...\n\n后续关注：\n- ...`,
        generatedAt: new Date().toISOString(),
        mock: true,
        msg: 'AI 模型凭据未配置，当前返回占位结果',
      },
    }
  }

  /** 今日简评:Tushare 价格 + 豆包结构化输出 + 3 色信号 */
  @Get('daily-brief/:stockId')
  @HttpCode(200)
  async dailyBrief(
    @CurrentUser() user: { id: string },
    @Param('stockId') stockId: string,
  ) {
    if (!stockId) throw new BadRequestException('stockId 必填')
    const result = await this.dailyBriefService.generateBrief(user.id, stockId)
    return { data: result }
  }

  /** 通用对话 */
  @Post('chat')
  @HttpCode(200)
  async chat(@Body() dto: ChatDto) {
    if (!dto.message) throw new BadRequestException('message 必填')
    return { data: { reply: `[占位]${dto.message.slice(0, 80)}`, mock: true } }
  }

  /**
   * AI 总结标题(note-edit 标题留空时调用)— 2026-06-14
   * body: { content: string }
   * 返回: { data: { title: string } }
   */
  @Post('summarize-title')
  @HttpCode(200)
  async summarizeTitle(@Body() dto: { content?: string }) {
    const content = (dto?.content ?? '').trim()
    if (!content) throw new BadRequestException('content 必填')
    const title = await this.dailyBriefService.summarizeTitle(content)
    return { data: { title } }
  }

  /** 健康检查 */
  @Post('health')
  @HttpCode(200)
  async health() {
    try {
      return { data: { ok: true, sdk: 'llm', models: ['mock'] } }
    } catch (e) {
      return { code: 500, msg: (e as Error).message }
    }
  }
}

// 避免 ESLint 报 unused import
void LLMClient

@Module({
  controllers: [AiController],
  providers: [DailyBriefService],
  exports: [DailyBriefService],
})
export class AiModule {}
