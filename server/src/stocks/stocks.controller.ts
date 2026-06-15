import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { DailySyncService } from './daily-sync.service';
import { DailyBriefService } from '../ai/daily-brief.service';
import { BuyStockDto, CreateStockDto, SellStockDto, UpdateStockDto } from './dto';
import { CurrentUser } from '../storage/auth/current-user.decorator';

@Controller('stocks')
export class StocksController {
  constructor(
    private readonly service: StocksService,
    private readonly dailySync: DailySyncService,
    private readonly dailyBrief: DailyBriefService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { id: string },
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.service.list(user.id, keyword);
    return { data };
  }

  @Get('summary')
  async summary(@CurrentUser() user: { id: string }) {
    const data = await this.service.summary(user.id);
    return { data };
  }

  @Post('sync-all')
  @HttpCode(200)
  async syncAll(@CurrentUser() user: { id: string }) {
    const data = await this.dailySync.syncAll(user.id);
    return { data };
  }

  @Get('search')
  async search(
    @Query('keyword') keyword?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.service.searchMarket(keyword ?? '', limit ? Number(limit) : 20);
    return { data };
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.service.getById(user.id, id);
    return { data };
  }

  @Get(':id/history')
  async history(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const data = await this.dailySync.getHistory(user.id, id, days ? Number(days) : 30);
    return { data };
  }

  @Post(':id/refresh-price')
  @HttpCode(200)
  async refreshPrice(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.service.refreshPrice(user.id, id);
    return { data };
  }

  @Get(':id/refresh-status')
  async refreshStatus(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.service.getRefreshStatus(user.id, id);
    return { data };
  }

  @Post(':id/buy')
  @HttpCode(200)
  async buy(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: BuyStockDto,
  ) {
    const data = await this.service.buy(user.id, id, dto);
    return { data };
  }

  @Post(':id/sell')
  @HttpCode(200)
  async sell(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SellStockDto,
  ) {
    const data = await this.service.sell(user.id, id, dto);
    return { data };
  }

  @Get(':id/stop-loss-alert')
  async stopLossAlert(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.service.getStopLossAlert(user.id, id);
    return { data };
  }

  /**
   * 生成并返回最新一日的 brief(强制走 LLM)
   *  - 默认从 stock_prices 拉 60 天数据
   *  - upsert 到 stock_briefs
   */
  @Post(':id/brief/generate')
  @HttpCode(200)
  async generateBrief(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.dailyBrief.generateBrief(user.id, id);
    return { data };
  }

  /**
   * 取最近 N 天的 brief 缓存(默认 7 天)
   */
  @Get(':id/brief')
  async recentBriefs(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const data = await this.dailyBrief.getRecent(user.id, id, days ? Number(days) : 7);
    return { data };
  }

  @Post()
  @HttpCode(200)
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateStockDto,
  ) {
    const data = await this.service.create(user.id, dto);
    return { data };
  }

  @Patch(':id')
  @HttpCode(200)
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ) {
    const data = await this.service.update(user.id, id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.service.remove(user.id, id);
    return { data };
  }

}
