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
import { CronosService } from './service';
import { ICreateCrono, IQueryParam, IUpdateCrono } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Cronos')
@Controller('cronos')
export class CronoController {
  constructor(private readonly service: CronosService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateCrono) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateCrono[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateCrono) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
