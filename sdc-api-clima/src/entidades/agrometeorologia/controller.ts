import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';
import { AgrometeorologiaBatchService } from './batch.service';
import { AgrometeorologiaInternalServiceGuard } from './internal-service.guard';

@ApiTags('Agrometeorologia')
@Controller('agrometeorologia')
@UseGuards(AgrometeorologiaInternalServiceGuard)
export class AgrometeorologiaController {
  constructor(
    private engine: AgrometeorologicalEngineService,
    private batch: AgrometeorologiaBatchService,
  ) {}

  @Get('siembras/:id')
  getBySowing(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.engine.getResponse(id, from, to);
  }

  @Post('siembras/:id/reprocesar')
  reprocess(
    @Param('id') id: string,
    @Body() body?: { sincronizarClima?: boolean; forceBackfill?: boolean },
  ) {
    return this.engine.procesarSiembra(id, {
      sincronizarClima: body?.sincronizarClima !== false,
      forceBackfill: body?.forceBackfill === true,
    });
  }

  @Post('procesar-activas')
  processActive() {
    return this.batch.procesarActivas();
  }

  @Post('establecimientos/:id/reprocesar')
  reprocessEstablishment(@Param('id') id: string) {
    return this.batch.procesarEstablecimiento(id);
  }

  @Post('semillas/:id/reprocesar')
  reprocessSeed(@Param('id') id: string) {
    return this.batch.procesarSemilla(id);
  }
}
