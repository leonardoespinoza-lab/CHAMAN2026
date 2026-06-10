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
import { QuimicasService } from './service';
import { ICreateQuimica, IQueryParam, IUpdateQuimica } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Quimicas')
@Controller('quimicas')
export class QuimicasController {
  constructor(private readonly service: QuimicasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateQuimica) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateQuimica) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
