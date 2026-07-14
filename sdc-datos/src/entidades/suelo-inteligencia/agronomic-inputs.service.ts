import { Injectable } from '@nestjs/common';
import { IEntradasAgronomicasSuelo } from 'modelos/src';
import { LotSoilIntelligenceEngine } from './engine.service';
import { SoilIntelligenceRepository } from './repository';

@Injectable()
export class SoilAgronomicInputsService {
  constructor(
    private readonly repository: SoilIntelligenceRepository,
    private readonly engine: LotSoilIntelligenceEngine,
  ) {}

  async getForLot(loteId: string): Promise<IEntradasAgronomicasSuelo | null> {
    const assessment = await this.repository.getByLot(loteId);
    if (!assessment) {
      await this.engine.request(loteId, 'lazy_read');
      return null;
    }
    if (!assessment.summary) return null;
    const summary = assessment.summary;
    return {
      loteId,
      operationalTexture: summary.operationalTexture,
      estimatedTexture: summary.estimatedTexture,
      sandPercentage: summary.sandPercentage,
      siltPercentage: summary.siltPercentage,
      clayPercentage: summary.clayPercentage,
      drainageClass: summary.drainageClass,
      availableWaterMmPerMeter: summary.availableWaterMmPerMeter,
      rootZoneAvailableWaterMm: summary.rootZoneAvailableWaterMm,
      effectiveDepthCm: summary.effectiveDepthCm,
      bulkDensityKgDm3: summary.bulkDensityKgDm3,
      coarseFragmentsPercentage: summary.coarseFragmentsPercentage,
      ph: summary.ph,
      organicCarbonGKg: summary.organicCarbonGKg,
      source: assessment.source?.type,
      confidence: assessment.source?.confidence,
      warnings: assessment.warnings,
    };
  }
}
