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
import { ReportesService } from './service';
import { ICreateReporte, IQueryParam, IUpdateReporte } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Reportes')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get('historico/:dispositivo')
  async historico(
    @Param('dispositivo') dispositivo: string,
    @Query('dias') dias?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.service.historico(dispositivo, {
      dias: Number(dias) || 7,
      limit: Number(limit) || 2000,
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateReporte) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateReporte) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
