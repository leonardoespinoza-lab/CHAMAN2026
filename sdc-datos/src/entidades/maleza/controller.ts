import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ICreateMaleza, IQueryParam, IUpdateMaleza } from 'modelos/src';
import { MalezasService } from './service';

@ApiTags('Malezas')
@Controller('malezas')
export class MalezasController {
  constructor(private readonly service: MalezasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateMaleza) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateMaleza[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateMaleza) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
