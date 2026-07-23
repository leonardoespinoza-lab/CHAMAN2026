import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ICreateVisitaLote, IQueryParam, IUpdateVisitaLote } from 'modelos/src';
import { VisitasLoteService } from './service';

@ApiTags('Visitas de lote')
@Controller('visitas-lote')
export class VisitasLoteController {
  constructor(private readonly service: VisitasLoteService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateVisitaLote) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateVisitaLote) {
    return await this.service.update(id, data);
  }
}
