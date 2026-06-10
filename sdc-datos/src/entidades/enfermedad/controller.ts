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
import { EnfermedadsService } from './service';
import { ICreateEnfermedad, IQueryParam, IUpdateEnfermedad } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Enfermedades')
@Controller('enfermedads')
export class EnfermedadsController {
  constructor(private readonly service: EnfermedadsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateEnfermedad) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateEnfermedad[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateEnfermedad) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
