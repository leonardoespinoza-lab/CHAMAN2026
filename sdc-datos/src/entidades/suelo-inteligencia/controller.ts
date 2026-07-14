import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TMotivoInteligenciaSuelo } from 'modelos/src';
import { SoilIntelligenceInternalGuard } from './internal-token.guard';
import { SoilAgronomicInputsService } from './agronomic-inputs.service';
import { LotSoilIntelligenceEngine } from './engine.service';
import { SoilIntelligenceJobsService } from './jobs.service';
import { SoilIntelligenceRepository } from './repository';

@Controller('soil-intelligence')
@UseGuards(SoilIntelligenceInternalGuard)
export class SoilIntelligenceController {
  constructor(
    private readonly engine: LotSoilIntelligenceEngine,
    private readonly inputs: SoilAgronomicInputsService,
    private readonly jobs: SoilIntelligenceJobsService,
    private readonly repository: SoilIntelligenceRepository,
  ) {}

  @Get('lots/:id')
  getByLot(@Param('id') id: string) {
    return this.engine.get(id);
  }

  @Get('lots/:id/agronomic-inputs')
  getAgronomicInputs(@Param('id') id: string) {
    return this.inputs.getForLot(id);
  }

  @Post('lots/:id/reprocess')
  reprocess(
    @Param('id') id: string,
    @Body()
    body: { reason?: TMotivoInteligenciaSuelo; force?: boolean } = {},
  ) {
    return this.engine.request(id, body.reason || 'manual_retry', {
      immediate: false,
      force: body.force !== false,
    });
  }

  @Get('admin/status')
  async status() {
    return { counts: await this.repository.countByStatus() };
  }

  @Post('admin/backfill')
  backfill(@Query('limit') limit?: string) {
    return this.jobs.backfill(Number(limit) || 0);
  }
}
