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
import { ICreateObservacionMeteorologica, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { ObservacionesMeteorologicasService } from './service';
import { AgrometeorologiaStorageGuard } from '../../auxiliares/agrometeorologia-storage.guard';

@ApiTags('Observaciones meteorologicas')
@Controller('observaciones-meteorologicas')
@UseGuards(AgrometeorologiaStorageGuard)
export class ObservacionesMeteorologicasController {
  constructor(private readonly service: ObservacionesMeteorologicasService) {}

  @Get()
  getFilter(@Query() query: IQueryParam) {
    return this.service.getFilter(query);
  }

  @Post('upsert/many')
  upsertMany(@Body() data: ICreateObservacionMeteorologica[]) {
    return this.service.upsertMany(data);
  }

  @Delete(':idEstablecimiento/:desde/:hasta')
  deleteRange(
    @Param('idEstablecimiento') idEstablecimiento: string,
    @Param('desde') desde: string,
    @Param('hasta') hasta: string,
  ) {
    return this.service.deleteRange(idEstablecimiento, desde, hasta);
  }
}
