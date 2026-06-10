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
import { FertilizantesService } from './service';
import {
  ICreateFertilizante,
  IQueryParam,
  IUpdateFertilizante,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Fertilizantes')
@Controller('fertilizantes')
export class FertilizantesController {
  constructor(private readonly service: FertilizantesService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateFertilizante) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateFertilizante) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
