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
import { PrediccionsService } from './service';
import { ICreatePrediccion, IQueryParam, IUpdatePrediccion } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Predicciones')
@Controller('prediccions')
export class PrediccionsController {
  constructor(private readonly service: PrediccionsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreatePrediccion) {
    return await this.service.create(data);
  }

  @Post('/idSiembra/:idSiembra/restore')
  async restoreByIdSiembra(
    @Param('idSiembra') idSiembra: string,
    @Body() body: { predicciones?: ICreatePrediccion[] },
  ) {
    return await this.service.restoreByIdSiembra(
      idSiembra,
      body?.predicciones || [],
    );
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdatePrediccion) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }

  @Delete('/idSiembra/:idSiembra')
  async deleteByIdSiembra(@Param('idSiembra') idSiembra: string) {
    return await this.service.deleteByIdSiembra(idSiembra);
  }

  @Delete('/idSiembra/:idSiembra/clear')
  async clearByIdSiembra(@Param('idSiembra') idSiembra: string) {
    return await this.service.clearByIdSiembra(idSiembra);
  }
}
