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
import { LicenciasService } from './service';
import { ICreateLicencia, IQueryParam, IUpdateLicencia } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Licencias')
@Controller('licencias')
export class LicenciasController {
  constructor(private readonly service: LicenciasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateLicencia) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateLicencia) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
