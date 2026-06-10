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
import { SiembrasService } from './service';
import { ICreateSiembra, IQueryParam, IUpdateSiembra } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Siembras')
@Controller('siembras')
export class SiembrasController {
  constructor(private readonly service: SiembrasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateSiembra) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateSiembra) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
