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
import { EmpresasService } from './service';
import { ICreateEmpresa, IQueryParam, IUpdateEmpresa } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Empresas')
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly service: EmpresasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateEmpresa) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateEmpresa[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateEmpresa) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
