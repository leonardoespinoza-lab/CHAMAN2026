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
import { PrincipioActivosService } from './service';
import {
  ICreatePrincipioActivo,
  IQueryParam,
  IUpdatePrincipioActivo,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('PrincipioActivos')
@Controller('principioactivos')
export class PrincipioActivosController {
  constructor(private readonly service: PrincipioActivosService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreatePrincipioActivo) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreatePrincipioActivo[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdatePrincipioActivo) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
