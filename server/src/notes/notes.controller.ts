import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CreateNoteDto, NoteDirection, NoteType, QueryNoteDto, RenderMdDto, UpdateNoteDto } from './dto';
import { NotesService } from './notes.service';
import { CurrentUser } from '../storage/auth/current-user.decorator';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async list(
    @CurrentUser() user: { id: string },
    @Query('stock_id') stock_id?: string,
    @Query('direction') direction?: NoteDirection,
    @Query('type') type?: NoteType,
    @Query('keyword') keyword?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const data = await this.notesService.list(user.id, {
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
  async heatmap(@CurrentUser() user: { id: string }, @Query('days') days?: string) {
    return this.notesService.heatmap(user.id, days ? Number(days) : 365);
  }

  @Get('distribution/:stock_id')
  async distribution(
    @CurrentUser() user: { id: string },
    @Param('stock_id') stock_id: string,
  ) {
    return this.notesService.distributionByStock(user.id, stock_id);
  }

  @Get('summary/:stock_id')
  async summary(
    @CurrentUser() user: { id: string },
    @Param('stock_id') stock_id: string,
  ) {
    return this.notesService.summary(user.id, stock_id);
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.notesService.getById(user.id, id);
    return { data };
  }

  @Post()
  @HttpCode(200)
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateNoteDto,
  ) {
    const data = await this.notesService.create(user.id, dto);
    return { data };
  }

  @Put(':id')
  @HttpCode(200)
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    const data = await this.notesService.update(user.id, id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.notesService.remove(user.id, id);
    return { data };
  }

  @Post('render-md')
  @HttpCode(200)
  async renderMd(@Body() dto: RenderMdDto) {
    return this.notesService.renderMd(dto);
  }
}
