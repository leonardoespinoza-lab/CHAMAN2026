import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SiembrasService } from './service';
import {
  ICreateSiembra,
  IQueryParam,
  IRegistroFenologico,
  IUpdateSiembra,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { AgrometeorologiaStorageGuard } from '../../auxiliares/agrometeorologia-storage.guard';

@ApiTags('Siembras')
@Controller('siembras')
export class SiembrasController {
  constructor(private readonly service: SiembrasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id/huella-hidrica/seguimiento')
  async seguimientoHuellaHidrica(@Param('id') id: string) {
    return await this.service.seguimientoHuellaHidrica(id);
  }

  @Post(':id/prediccion-malezas')
  async prediccionMalezas(@Param('id') id: string) {
    return await this.service.prediccionMalezas(id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateSiembra) {
    return await this.service.create(data);
  }

  @Post(':id/registros-fenologicos')
  @UseGuards(AgrometeorologiaStorageGuard)
  async appendPhenologyRecord(
    @Param('id') id: string,
    @Body() data: IRegistroFenologico,
  ) {
    return await this.service.appendPhenologyRecord(id, data);
  }

  @Put('cosechar/:id')
  async cosechar(@Param('id') id: string, @Body() data: IUpdateSiembra) {
    return await this.service.cosechar(id, data);
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
