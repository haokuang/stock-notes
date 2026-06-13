import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CreateNoteDto, NoteDirection, NoteType, QueryNoteDto, RenderMdDto, UpdateNoteDto } from './dto';
import { NotesService } from './notes.service';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async list(
    @Query('stock_id') stock_id?: string,
    @Query('direction') direction?: NoteDirection,
    @Query('type') type?: NoteType,
    @Query('keyword') keyword?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const data = await this.notesService.list({
      stock_id,
      direction,
      type,
      keyword,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return { data };
  }

  @Get('heatmap')
  async heatmap(@Query('days') days?: string) {
    return this.notesService.heatmap(days ? Number(days) : 365);
  }

  @Get('distribution/:stock_id')
  async distribution(@Param('stock_id') stock_id: string) {
    return this.notesService.distributionByStock(stock_id);
  }

  @Get('summary/:stock_id')
  async summary(@Param('stock_id') stock_id: string) {
    return this.notesService.summary(stock_id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.notesService.getById(id);
    return { data };
  }

  @Post()
  @HttpCode(200)
  async create(@Body() dto: CreateNoteDto) {
    const data = await this.notesService.create(dto);
    return { data };
  }

  @Put(':id')
  @HttpCode(200)
  async update(@Param('id') id: string, @Body() dto: UpdateNoteDto) {
    const data = await this.notesService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string) {
    const data = await this.notesService.remove(id);
    return { data };
  }

  @Post('render-md')
  @HttpCode(200)
  async renderMd(@Body() dto: RenderMdDto) {
    return this.notesService.renderMd(dto);
  }
}
