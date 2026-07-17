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
import { ReporteNDVIsService } from './service';
import {
  ICreateReporteNDVI,
  IQueryParam,
  IUpdateReporteNDVI,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('ReporteNDVIs')
@Controller('reportendvis')
export class ReporteNDVIsController {
  constructor(private readonly service: ReporteNDVIsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get('lastByLote')
  async getLastByLote() {
    return await this.service.getLastByLote();
  }

  @Get('lastByLote/:idProductor')
  async getLastByIdProductor(@Param('idProductor') idProductor: string) {
    return await this.service.getLastByIdProductor(idProductor);
  }

  @Get('lastByIdLote/:idLote')
  async getlastByIdLote(@Param('idLote') idLote: string) {
    return await this.service.getLastByIdLote(idLote);
  }

  @Get('lastByLoteByDistribuidor/:idDistribuidor')
  async getLastByIdDistribuidor(
    @Param('idDistribuidor') idDistribuidor: string,
  ) {
    return await this.service.getLastByIdDistribuidor(idDistribuidor);
  }

  @Get('lastByScope/:scope/:id')
  async getLastByScope(
    @Param('scope') scope: string,
    @Param('id') id: string,
  ) {
    return await this.service.getLastByScope(scope, id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateReporteNDVI) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateReporteNDVI) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }

  @Delete()
  async deleteMany(@Query() query: IQueryParam) {
    return await this.service.deleteMany(query);
  }
}
