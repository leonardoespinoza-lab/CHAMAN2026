import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ICreateCamara, IQueryParam, IUpdateCamara } from 'modelos/src';
import { CamarasService } from './service';

@ApiTags('Camaras')
@Controller('camaras')
export class CamarasController {
  constructor(private readonly service: CamarasService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Post('bulk-upsert')
  async upsertMany(@Body() body: { camaras?: ICreateCamara[] } | ICreateCamara[]) {
    return await this.service.upsertMany(body);
  }

  @Get(':serial')
  async getBySerial(@Param('serial') serial: string) {
    return await this.service.getBySerial(serial);
  }

  @Put(':serial')
  async update(@Param('serial') serial: string, @Body() data: IUpdateCamara) {
    return await this.service.update(serial, data);
  }
}
