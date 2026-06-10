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
import { AgroquimicosService } from './service';
import {
  ICreateAgroquimico,
  IQueryParam,
  IUpdateAgroquimico,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Agroquimicos')
@Controller('agroquimicos')
export class AgroquimicosController {
  constructor(private readonly service: AgroquimicosService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateAgroquimico) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateAgroquimico[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateAgroquimico) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
