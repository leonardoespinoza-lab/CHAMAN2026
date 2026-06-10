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
import { FumigacionsService } from './service';
import { ICreateFumigacion, IQueryParam, IUpdateFumigacion } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Fumigacions')
@Controller('fumigacions')
export class FumigacionsController {
  constructor(private readonly service: FumigacionsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateFumigacion) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateFumigacion[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateFumigacion) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
