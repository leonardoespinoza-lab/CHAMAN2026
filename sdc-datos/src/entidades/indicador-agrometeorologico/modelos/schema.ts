import mongoose, { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  FuenteMeteorologicaNormalizada,
  IIndicadorAgrometeorologicoDiario,
  IMetricasAgrometeorologicasDiarias,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';

@Schema({
  collection: 'indicadores_agrometeorologicos',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class IndicadorAgrometeorologico implements IIndicadorAgrometeorologicoDiario {
  _id?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  idSiembra: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  idLote: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  idEstablecimiento: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ required: true })
  fecha: string;

  @Prop({ required: true })
  esPronostico: boolean;

  @Prop()
  etapaFenologica?: string;

  @Prop({ type: Object, required: true })
  metricas: IMetricasAgrometeorologicasDiarias;

  @Prop({
    type: String,
    enum: [
      'station',
      'open_meteo',
      'mixed',
      'derived_station',
      'derived_open_meteo',
      'gap_filled',
    ],
    required: true,
  })
  fuente: FuenteMeteorologicaNormalizada;

  @Prop({ type: Object, required: true })
  fuentePorVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;

  @Prop({ type: [String], default: [] })
  banderasCalidad: string[];

  @Prop({ type: [String], default: [] })
  advertencias: string[];

  @Prop({ min: 0, max: 100, required: true })
  completitudPct: number;

  @Prop({ required: true })
  versionCalculo: string;

  @Prop({ required: true })
  versionParametros: string;

  @Prop({ type: Date, required: true })
  calculadoEn: string;

  creadoEn?: string;
  actualizadoEn?: string;
}

export type IndicadorAgrometeorologicoDocument = IndicadorAgrometeorologico &
  Document;

export const IndicadorAgrometeorologicoSchema = SchemaFactory.createForClass(
  IndicadorAgrometeorologico,
);

IndicadorAgrometeorologicoSchema.index(
  { idSiembra: 1, fecha: 1, versionCalculo: 1 },
  { unique: true, name: 'uniq_sowing_date_engine_version' },
);
IndicadorAgrometeorologicoSchema.index({ idSiembra: 1, fecha: 1 });
IndicadorAgrometeorologicoSchema.index({
  idEstablecimiento: 1,
  fecha: 1,
});
