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
import { AlertasService } from './service';
import {
  ICreateAlerta,
  IFinalizarEventoAlerta,
  IQueryParam,
  IRegistrarEventoAlerta,
  IUpdateAlerta,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Alertas')
@Controller('alertas')
export class AlertasController {
  constructor(private readonly service: AlertasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateAlerta) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateAlerta[]) {
    return await this.service.bulk(data);
  }

  @Post('eventos/siembra')
  async registrarEventoSiembra(@Body() data: IRegistrarEventoAlerta) {
    return await this.service.registrarEventoSiembra(data);
  }

  @Post('eventos/siembra/finalizar')
  async finalizarEventoSiembra(@Body() data: IFinalizarEventoAlerta) {
    return await this.service.finalizarEventoSiembra(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateAlerta) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
