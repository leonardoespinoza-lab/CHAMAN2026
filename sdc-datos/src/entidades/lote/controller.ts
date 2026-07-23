import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';
import { LotesService } from './service';
import { ICreateLote, IQueryParam, ISolicitudArchivado, IUpdateLote } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Lotes')
@Controller('lotes')
export class LotesController {
  constructor(private readonly service: LotesService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateLote) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateLote) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Query() audit: ISolicitudArchivado) {
    return await this.service.delete(id, audit);
  }

  @Delete()
  async deleteMany(@Query() query: IQueryParam) {
    return await this.service.deleteMany(query);
  }
}
