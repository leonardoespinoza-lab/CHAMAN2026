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

  @Post('generaciones/reemplazar')
  replaceGeneration(
    @Body()
    body: {
      idSiembra: string;
      versionCalculo: string;
      generacionCalculo: string;
      indicadores: ICreateIndicadorAgrometeorologico[];
      intervaloEsperado: {
        desde: string;
        hasta: string;
        cantidad: number;
        checksumFechas: string;
      };
    },
  ) {
    return this.service.replaceGeneration(
      body?.idSiembra,
      body?.versionCalculo,
      body?.generacionCalculo,
      body?.indicadores,
      body?.intervaloEsperado,
    );
  }

  @Post('generaciones/lease/adquirir')
  acquireGenerationLease(
    @Body()
    body: {
      idSiembra: string;
      versionCalculo: string;
      generacionCalculo: string;
    },
  ) {
    return this.service.acquireGenerationLease(
      body?.idSiembra,
      body?.versionCalculo,
      body?.generacionCalculo,
    );
  }

  @Post('generaciones/lease/liberar')
  releaseGenerationLease(
    @Body()
    body: {
      idSiembra: string;
      versionCalculo: string;
      generacionCalculo: string;
    },
  ) {
    return this.service.releaseGenerationLease(
      body?.idSiembra,
      body?.versionCalculo,
      body?.generacionCalculo,
    );
  }

  @Get('generaciones/activa/:idSiembra/:versionCalculo')
  getActiveGeneration(
    @Param('idSiembra') idSiembra: string,
    @Param('versionCalculo') versionCalculo: string,
  ) {
    return this.service.getActiveGeneration(idSiembra, versionCalculo);
  }

  @Delete('siembra/:idSiembra')
  deleteBySowing(@Param('idSiembra') idSiembra: string) {
    return this.service.deleteBySowing(idSiembra);
  }
}
