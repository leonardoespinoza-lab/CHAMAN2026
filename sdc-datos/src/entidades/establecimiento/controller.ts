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
import { EstablecimientosService } from './service';
import {
  ICreateEstablecimiento,
  IQueryParam,
  IUpdateEstablecimiento,
  ISolicitudArchivado,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Establecimientos')
@Controller('establecimientos')
export class EstablecimientosController {
  constructor(private readonly service: EstablecimientosService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateEstablecimiento) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateEstablecimiento) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Query() audit: ISolicitudArchivado) {
    return await this.service.delete(id, audit);
  }
}
