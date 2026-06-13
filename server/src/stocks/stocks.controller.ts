import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CreateStockDto, UpdateStockDto } from './dto';

@Controller('stocks')
export class StocksController {
  constructor(private readonly service: StocksService) {}

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

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
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
}
