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
import { FertilizacionsService } from './service';
import {
  ICreateFertilizacion,
  IQueryParam,
  IUpdateFertilizacion,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Fertilizacions')
@Controller('fertilizacions')
export class FertilizacionsController {
  constructor(private readonly service: FertilizacionsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateFertilizacion) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateFertilizacion[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateFertilizacion) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
