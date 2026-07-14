import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TMotivoResolucionUbicacionLote } from 'modelos/src';
import { GeorefCatalogSyncService } from './georef-sync.service';
import { LotLocationInternalGuard } from './internal-token.guard';
import { LotLocationJobsService } from './jobs.service';
import { LotLocationRepository } from './repository';
import { LotLocationService } from './service';

@Controller('lot-locations')
@UseGuards(LotLocationInternalGuard)
export class LotLocationController {
  constructor(
    private readonly service: LotLocationService,
    private readonly repository: LotLocationRepository,
    private readonly sync: GeorefCatalogSyncService,
    private readonly jobs: LotLocationJobsService,
  ) {}

  @Get('lotes/:id')
  getByLot(@Param('id') id: string) {
    return this.service.getCurrent(id);
  }

  @Post('lotes/:id/resolve')
  resolve(
    @Param('id') id: string,
    @Body()
    body: { motivo?: TMotivoResolucionUbicacionLote; force?: boolean } = {},
  ) {
    return this.service.requestResolution(id, body.motivo || 'manual_retry', {
      immediate: true,
      force: !!body.force,
    });
  }

  @Get('admin/status')
  async status() {
    return { activeSnapshot: await this.repository.getActiveSnapshot() };
  }

  @Post('admin/sync')
  syncCatalog(@Query('force') force?: string) {
    return this.sync.sync(force === 'true');
  }

  @Post('admin/backfill')
  backfill(@Query('limit') limit?: string) {
    return this.service.backfill('backfill', Number(limit) || 0);
  }

  @Post('admin/sync-and-backfill')
  syncAndBackfill(@Query('force') force?: string) {
    return this.jobs.run(force === 'true', 'source_version_changed');
  }
}
