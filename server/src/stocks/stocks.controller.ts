import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { DailySyncService } from './daily-sync.service';
import { CreateStockDto, UpdateStockDto } from './dto';

@Controller('stocks')
export class StocksController {
  constructor(
    private readonly service: StocksService,
    private readonly dailySync: DailySyncService,
  ) {}

  @Get()
  async list(@Query('keyword') keyword?: string) {
    const data = await this.service.list(keyword);
    return { data };
  }

  @Get('summary')
  async summary() {
    const data = await this.service.summary();
    return { data };
  }

  @Post('sync-all')
  @HttpCode(200)
  async syncAll() {
    const data = await this.dailySync.syncAll();
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Get(':id/history')
  async history(@Param('id') id: string, @Query('days') days?: string) {
    const data = await this.dailySync.getHistory(id, days ? Number(days) : 30);
    return { data };
  }

  @Post(':id/refresh-price')
  @HttpCode(200)
  async refreshPrice(@Param('id') id: string) {
    const stock = await this.service.getById(id);
    const tsCode = this.toTushareCode(stock.code);
    const result = await this.dailySync.syncOne(id, tsCode);
    const updated = await this.service.getById(id);
    return { data: { sync: result, stock: updated } };
  }

  @Post()
  @HttpCode(200)
  async create(@Body() dto: CreateStockDto) {
    const data = await this.service.create(dto);
    return { data };
  }

  @Patch(':id')
  @HttpCode(200)
  async update(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string) {
    const data = await this.service.remove(id);
    return { data };
  }

  private toTushareCode(code: string): string {
    const c = code.trim().toUpperCase();
    if (c.includes('.')) return c;
    if (/^(6|9|5|1)/.test(c)) return `${c}.SH`;
    if (/^(0|3|2)/.test(c)) return `${c}.SZ`;
    if (/^(4|8)/.test(c)) return `${c}.BJ`;
    return `${c}.SZ`;
  }
}
