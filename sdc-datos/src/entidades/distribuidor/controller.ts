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
import { DistribuidorsService } from './service';
import {
  ICreateDistribuidor,
  IQueryParam,
  IUpdateDistribuidor,
  ISolicitudArchivado,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Distribuidores')
@Controller('distribuidors')
export class DistribuidorsController {
  constructor(private readonly service: DistribuidorsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateDistribuidor) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateDistribuidor) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Query() audit: ISolicitudArchivado) {
    return await this.service.delete(id, audit);
  }
}
