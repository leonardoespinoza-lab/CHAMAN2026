import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lote, LoteSchema } from '../lote/modelos/schema';
import { LotLocationModule } from '../ubicacion-lote/module';
import { SoilAgronomicInputsService } from './agronomic-inputs.service';
import { SoilIntelligenceConfidenceService } from './confidence.service';
import { SoilIntelligenceController } from './controller';
import { LotSoilIntelligenceEngine } from './engine.service';
import { IntaSoilTextNormalizer } from './inta-normalizer.service';
import { SoilIntelligenceJobsService } from './jobs.service';
import { SoilIntelligenceInternalGuard } from './internal-token.guard';
import { LotSoilAssessment, LotSoilAssessmentSchema } from './modelos/schema';
import { IntaSoilProvider } from './providers/inta-soil.provider';
import { SoilGridsProvider } from './providers/soilgrids.provider';
import { SoilIntelligenceRepository } from './repository';
import { SoilTextureClassifier } from './texture-classifier.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lote.name, schema: LoteSchema },
      {
        name: LotSoilAssessment.name,
        schema: LotSoilAssessmentSchema,
      },
    ]),
    LotLocationModule,
  ],
  controllers: [SoilIntelligenceController],
  providers: [
    SoilIntelligenceRepository,
    SoilTextureClassifier,
    IntaSoilTextNormalizer,
    IntaSoilProvider,
    SoilGridsProvider,
    SoilIntelligenceConfidenceService,
    LotSoilIntelligenceEngine,
    SoilAgronomicInputsService,
    SoilIntelligenceJobsService,
    SoilIntelligenceInternalGuard,
  ],
  exports: [
    LotSoilIntelligenceEngine,
    SoilAgronomicInputsService,
    SoilIntelligenceRepository,
  ],
})
export class SoilIntelligenceModule {}
