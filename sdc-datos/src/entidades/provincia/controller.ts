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
import { ProvinciasService } from './service';
import { ICreateProvincia, IQueryParam, IUpdateProvincia } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Provincias')
@Controller('provincias')
export class ProvinciasController {
  constructor(private readonly service: ProvinciasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateProvincia) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateProvincia[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateProvincia) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
