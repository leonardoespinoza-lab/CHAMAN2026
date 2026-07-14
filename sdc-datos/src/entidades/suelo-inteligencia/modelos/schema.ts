import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  IFuenteSueloMetadata,
  IInteligenciaSueloLote,
  IPerfilProfundidadSuelo,
  IPropiedadSuelo,
  IResumenInteligenciaSuelo,
  ITaxonomiaSueloLote,
  IUnidadSueloLote,
  TEstadoInteligenciaSuelo,
  TMotivoInteligenciaSuelo,
} from 'modelos/src';

@Schema({ collection: 'lot_soil_assessments', timestamps: true })
export class LotSoilAssessment implements Omit<
  IInteligenciaSueloLote,
  'createdAt' | 'updatedAt'
> {
  _id?: string;

  @Prop({ required: true, unique: true, index: true })
  loteId: string;

  @Prop({ required: true, index: true })
  status: TEstadoInteligenciaSuelo;

  @Prop({ index: true })
  geometryHash?: string;

  @Prop({ index: true })
  resolutionKey?: string;

  @Prop({ type: Object })
  summary?: IResumenInteligenciaSuelo;

  @Prop({ type: Object })
  taxonomy?: ITaxonomiaSueloLote;

  @Prop({ type: Object })
  source?: IFuenteSueloMetadata;

  @Prop({ type: [Object], default: [] })
  sources?: IFuenteSueloMetadata[];

  @Prop({ type: [Object], default: [] })
  depthProfile?: IPerfilProfundidadSuelo[];

  @Prop({ type: [Object], default: [] })
  soilUnits?: IUnidadSueloLote[];

  @Prop({ type: Object, default: {} })
  propertyProvenance?: Record<string, IPropiedadSuelo<unknown>>;

  @Prop()
  coveragePercentage?: number;

  @Prop()
  heterogeneityFlag?: boolean;

  @Prop()
  manualConflict?: boolean;

  @Prop({ required: true })
  engineVersion?: string;

  @Prop({ required: true })
  mappingVersion?: string;

  @Prop({ type: Object, default: {} })
  sourceVersions?: Record<string, string>;

  @Prop({ type: [String], default: [] })
  warnings?: string[];

  @Prop({ type: [String], default: [] })
  qualityFlags?: string[];

  @Prop()
  reason?: TMotivoInteligenciaSuelo;

  @Prop({ default: 0 })
  attempts?: number;

  @Prop()
  requestedAt?: string;

  @Prop()
  processingStartedAt?: string;

  @Prop()
  calculatedAt?: string;
}

export type LotSoilAssessmentDocument = LotSoilAssessment & Document;

export const LotSoilAssessmentSchema =
  SchemaFactory.createForClass(LotSoilAssessment);

LotSoilAssessmentSchema.set('toJSON', { virtuals: true, getters: true });
LotSoilAssessmentSchema.index({ loteId: 1, resolutionKey: 1 });
LotSoilAssessmentSchema.index({ status: 1, requestedAt: 1 });
