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
import { IQueryParam } from 'modelos/src';
import { IaMalezaAnalisis } from './modelos/schema';
import { IaMalezasService } from './service';

@ApiTags('IA Malezas')
@Controller('ia-malezas')
export class IaMalezasController {
  constructor(private readonly service: IaMalezasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: Partial<IaMalezaAnalisis>) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: Partial<IaMalezaAnalisis>,
  ) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
