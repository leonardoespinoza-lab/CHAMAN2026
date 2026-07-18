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

  @Prop()
  generacionCalculo?: string;

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

  @Prop({
    type: String,
    enum: [
      'campo',
      'proyeccion_anclada_campo',
      'gdd_validado',
      'cronograma_referencia',
      'rango_termico_referencia',
      'seguimiento',
    ],
  })
  fuenteEtapaFenologica?: IIndicadorAgrometeorologicoDiario['fuenteEtapaFenologica'];

  @Prop({
    type: String,
    enum: ['alta', 'media', 'referencia'],
  })
  confianzaEtapaFenologica?: IIndicadorAgrometeorologicoDiario['confianzaEtapaFenologica'];

  @Prop()
  versionModeloFenologico?: string;

  @Prop({ type: Object, required: true })
  metricas: IMetricasAgrometeorologicasDiarias;

  @Prop({
    type: String,
    enum: [
      'sensor',
      'station',
      'open_meteo',
      'mixed',
      'derived_sensor',
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

  @Prop({ min: 0, max: 100 })
  coberturaCampoPct?: number;

  @Prop({ type: Date })
  ultimaObservacionCampo?: string;

  @Prop({
    type: String,
    enum: ['calificado', 'referencia'],
  })
  calidadTemperaturaCampo?: IIndicadorAgrometeorologicoDiario['calidadTemperaturaCampo'];

  @Prop({ type: [String], default: undefined })
  nombresSensoresTemperaturaCampo?: string[];

  @Prop({
    type: String,
    enum: [
      'dormancia_perenne',
      'vernalizacion_anual',
      'termico_fotoperiodico',
      'termico',
    ],
  })
  procesoTermico?: IIndicadorAgrometeorologicoDiario['procesoTermico'];

  @Prop({
    type: String,
    enum: ['validado', 'referencia', 'requiere_calibracion'],
  })
  estadoParametros?: IIndicadorAgrometeorologicoDiario['estadoParametros'];

  @Prop()
  fuenteParametros?: string;

  @Prop({
    type: String,
    enum: ['ventana_calibrada'],
  })
  modeloVernalizacion?: IIndicadorAgrometeorologicoDiario['modeloVernalizacion'];

  @Prop({
    type: String,
    enum: ['primaveral', 'facultativo', 'invernal', 'desconocido'],
  })
  habitoVernalizacion?: IIndicadorAgrometeorologicoDiario['habitoVernalizacion'];

  @Prop()
  requerimientoVernalizacion?: number;

  @Prop({
    type: String,
    enum: ['validado', 'referencia', 'requiere_calibracion'],
  })
  estadoVernalizacion?: IIndicadorAgrometeorologicoDiario['estadoVernalizacion'];

  @Prop()
  inicioVentanaFrio?: string;

  @Prop()
  inicioVentanaVernalizacion?: string;

  @Prop()
  finVentanaVernalizacion?: string;

  @Prop({
    type: String,
    enum: ['HF', 'CP', 'sin_calibrar'],
  })
  modeloFrioRector?: IIndicadorAgrometeorologicoDiario['modeloFrioRector'];

  @Prop({
    type: String,
    enum: ['validado', 'referencia', 'requiere_calibracion'],
  })
  estadoRequerimientoFrio?: IIndicadorAgrometeorologicoDiario['estadoRequerimientoFrio'];

  @Prop()
  fuenteRequerimientoFrio?: string;

  @Prop({
    type: String,
    enum: ['alta', 'media', 'estimada'],
  })
  confianzaRequerimientoFrio?: IIndicadorAgrometeorologicoDiario['confianzaRequerimientoFrio'];

  @Prop()
  objetivoFrioRector?: number;

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

export const INDICADOR_AGROMETEOROLOGICO_GENERADO_MODEL =
  'IndicadorAgrometeorologicoGenerado';
export const INDICADOR_AGROMETEOROLOGICO_GENERACION_MODEL =
  'IndicadorAgrometeorologicoGeneracion';

/**
 * Las corridas nuevas se preparan en una colección separada. Así no pisan la
 * generación activa mientras todavía se están escribiendo.
 */
export const IndicadorAgrometeorologicoGeneradoSchema =
  IndicadorAgrometeorologicoSchema.clone();
IndicadorAgrometeorologicoGeneradoSchema.set(
  'collection',
  'indicadores_agrometeorologicos_generados',
);
IndicadorAgrometeorologicoGeneradoSchema.add({
  expiraEn: { type: Date, required: false },
} as any);
IndicadorAgrometeorologicoGeneradoSchema.clearIndexes();
IndicadorAgrometeorologicoGeneradoSchema.index(
  {
    idSiembra: 1,
    fecha: 1,
    versionCalculo: 1,
    generacionCalculo: 1,
  },
  { unique: true, name: 'uniq_sowing_date_engine_generation' },
);
IndicadorAgrometeorologicoGeneradoSchema.index({
  idSiembra: 1,
  versionCalculo: 1,
  generacionCalculo: 1,
  fecha: 1,
});
IndicadorAgrometeorologicoGeneradoSchema.index(
  { expiraEn: 1 },
  { expireAfterSeconds: 0, name: 'ttl_inactive_generations' },
);

export const IndicadorAgrometeorologicoGeneracionSchema =
  new mongoose.Schema(
    {
      idSiembra: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      versionCalculo: { type: String, required: true },
      generacionActiva: { type: String, required: true },
      cantidadIndicadores: { type: Number, required: true, min: 0 },
      activadaEn: { type: Date, required: true },
      generacionEnProceso: { type: String },
      leaseProcesoHasta: { type: Date },
      eliminadaEn: { type: Date },
    },
    {
      collection: 'indicadores_agrometeorologicos_generaciones',
      timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
    },
  );
IndicadorAgrometeorologicoGeneracionSchema.index(
  { idSiembra: 1, versionCalculo: 1 },
  { unique: true, name: 'uniq_active_generation_by_sowing_engine' },
);
