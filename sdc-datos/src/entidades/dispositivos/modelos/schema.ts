import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDispositivo,
  IMetaDataLora,
  TipoDispositivo,
  SensoresV2,
  IQuimica,
  IDistribuidor,
  IProductor,
  IEstablecimiento,
  ILote,
  IGeoJSONPoint,
  IBateria,
  IReporte,
  IFrioAcumulado,
  IAsignacionDispositivoLote,
  ICalificacionSensorMeteorologico,
} from 'modelos/src';
import mongoose, { Document } from 'mongoose';
import { Distribuidor } from 'src/entidades/distribuidor/modelos/schema';
import { Productor } from 'src/entidades/productor/modelos/schema';
import { Quimica } from 'src/entidades/quimica/modelos/schema';

const camposCalificacionVariable = (
  exactitudMaxima: number,
  offsetMaximo: number,
) => ({
  estado: {
    type: String,
    enum: ['calificado', 'referencia', 'rechazado'],
    required: true,
  },
  rol: {
    type: String,
    enum: ['aire_2m', 'aire_canopia', 'suelo', 'desconocido'],
  },
  alturaM: { type: Number, min: 0.01, max: 10 },
  abrigoRadiacion: { type: Boolean },
  exactitud: { type: Number, min: 0.01, max: exactitudMaxima },
  fechaCalibracion: { type: Date },
  proximaCalibracion: { type: Date },
  offset: { type: Number, min: -offsetMaximo, max: offsetMaximo },
  fuenteCalibracion: { type: String, trim: true },
  observaciones: { type: String, trim: true },
});

const CalificacionHumedadRelativaSchema = new mongoose.Schema(
  camposCalificacionVariable(5, 20),
  { _id: false, id: false },
);

const IntervaloCalibracionMeteorologicaSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    variable: {
      type: String,
      enum: ['temperatura_aire', 'humedad_relativa'],
      required: true,
    },
    version: {
      type: String,
      enum: ['calificacion-variable-v1'],
      required: true,
    },
    registradoEn: { type: Date, required: true },
    ...camposCalificacionVariable(5, 20),
  },
  { _id: false, id: false },
);

IntervaloCalibracionMeteorologicaSchema.path('exactitud').validate(function (
  this: { variable?: string },
  value?: number,
) {
  if (value === undefined || value === null) return true;
  return this.variable === 'temperatura_aire' ? value <= 2 : value <= 5;
}, 'La exactitud excede el limite de la variable calibrada.');

IntervaloCalibracionMeteorologicaSchema.path('offset').validate(function (
  this: { variable?: string },
  value?: number,
) {
  if (value === undefined || value === null) return true;
  return Math.abs(value) <= (this.variable === 'temperatura_aire' ? 10 : 20);
}, 'El offset excede el limite de la variable calibrada.');

const CalificacionMeteorologicaSchema = new mongoose.Schema(
  {
    estado: {
      type: String,
      enum: ['calificado', 'referencia', 'rechazado'],
      required: true,
    },
    rolTemperatura: {
      type: String,
      enum: ['aire_2m', 'aire_canopia', 'suelo', 'desconocido'],
    },
    alturaM: { type: Number, min: 0.01, max: 10 },
    abrigoRadiacion: { type: Boolean },
    exactitudTemperaturaC: { type: Number, min: 0.01, max: 2 },
    fechaCalibracion: { type: Date },
    proximaCalibracion: { type: Date },
    offsetTemperaturaC: { type: Number, min: -10, max: 10 },
    fuenteCalibracion: { type: String, trim: true },
    observaciones: { type: String, trim: true },
    humedadRelativa: { type: CalificacionHumedadRelativaSchema },
    historialCalibraciones: {
      type: [IntervaloCalibracionMeteorologicaSchema],
      default: [],
    },
  },
  { _id: false, id: false },
);

@Schema()
export class Dispositivo implements Exactly<IDispositivo, Dispositivo> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;
  //
  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote?: string;

  @Prop({ type: Date })
  fechaAsignacionLote?: string;

  @Prop({ type: [Object], default: [] })
  historialAsignacionesLote?: IAsignacionDispositivoLote[];
  //
  @Prop({ type: String, uppercase: true, index: true })
  deveui?: string;

  @Prop()
  tipo?: TipoDispositivo;

  @Prop({ type: Object })
  metadata?: IMetaDataLora;
  /**
   * Sensores que tiene la estación - Cambia según el origen
   */
  @Prop({ type: [String] })
  sensores?: SensoresV2[]; // ["temperatura", "humedad", "viento", "radiacion"]
  // Datos de Carga
  @Prop({ type: Object })
  geojson?: IGeoJSONPoint;

  @Prop()
  nombre?: string;

  @Prop({ type: Object })
  bateria?: IBateria;

  @Prop({ type: Object })
  ultimoReporte?: IReporte;

  @Prop({ type: Object })
  frioAcumulado?: IFrioAcumulado;

  @Prop({ type: CalificacionMeteorologicaSchema })
  calificacionMeteorologica?: ICalificacionSensorMeteorologico;

  @Prop({ type: Date })
  fechaUltimaComunicacion?: string; // Puede ser de otra copsa que no sea un reporte.

  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  lote?: ILote;
}

export type DispositivoDocument = Dispositivo & Document;

export const DispositivoSchema = SchemaFactory.createForClass(Dispositivo);

DispositivoSchema.set('toJSON', { virtuals: true, getters: true });

DispositivoSchema.index({ geojson: '2dsphere' });

DispositivoSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

DispositivoSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

DispositivoSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

DispositivoSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: 'Establecimiento',
});

DispositivoSchema.virtual('lote', {
  foreignField: '_id',
  justOne: true,
  localField: 'idLote',
  ref: 'Lote',
});
