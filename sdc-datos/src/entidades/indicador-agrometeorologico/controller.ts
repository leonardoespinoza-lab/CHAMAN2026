import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ICreateIndicadorAgrometeorologico, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { IndicadoresAgrometeorologicosService } from './service';
import { AgrometeorologiaStorageGuard } from '../../auxiliares/agrometeorologia-storage.guard';

@ApiTags('Indicadores agrometeorologicos')
@Controller('indicadores-agrometeorologicos')
@UseGuards(AgrometeorologiaStorageGuard)
export class IndicadoresAgrometeorologicosController {
  constructor(private readonly service: IndicadoresAgrometeorologicosService) {}

  @Get()
  getFilter(@Query() query: IQueryParam) {
    return this.service.getFilter(query);
  }

  @Post('upsert/many')
  upsertMany(@Body() data: ICreateIndicadorAgrometeorologico[]) {
    return this.service.upsertMany(data);
  }

  @Delete('siembra/:idSiembra')
  deleteBySowing(@Param('idSiembra') idSiembra: string) {
    return this.service.deleteBySowing(idSiembra);
  }
}
