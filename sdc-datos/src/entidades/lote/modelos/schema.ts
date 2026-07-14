import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  ILote,
  IUbicacion,
  IQuimica,
  IDistribuidor,
  IProductor,
  IEstablecimiento,
  IDepartamento,
  ISuelo,
  IEstacion,
  TTipoDepositoN,
  TTexturaSuelo,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
  TTipoContenidoP,
  IHuellaHidrica,
  ISiembra,
  ICalidadClima,
  IDispositivo,
  ISueloReferencia,
  IUbicacionAdministrativaLote,
  IDepartamentoLegadoLote,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';
import { Productor } from '../../productor/modelos/schema';
import { Establecimiento } from '../../establecimiento/modelos/schema';
import { Departamento } from '../../departamento/modelos/schema';
import { Estacion } from '../../estacion/schema';
import { Dispositivo } from 'src/entidades/dispositivos/modelos/schema';

@Schema()
export class Lote implements Exactly<ILote, Lote> {
  _id: string;

  @Prop()
  nombre: string;

  @Prop({ type: Object })
  ubicacion?: IUbicacion;

  @Prop()
  capacidadDeCampo?: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idSondaSuelo?: string;

  @Prop({ type: Object })
  sueloReferencia?: ISueloReferencia;

  @Prop({ type: [Object] })
  suelos?: ISuelo[];

  @Prop()
  capacidadDeRiego?: number;

  @Prop()
  puntoMarchitez?: number;

  @Prop()
  anchoDeBulbo?: number;

  @Prop()
  metrosLinealesHas: number;

  @Prop({ uppercase: true })
  serialCamara?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDepartamento?: string;

  @Prop({ type: Object })
  ubicacionDepartamentoLegado?: IDepartamentoLegadoLote;

  @Prop({ type: [mongoose.Schema.Types.ObjectId] })
  idsDispositivo?: string[]; // Dispositivos asociados al lote

  // Datos para Huella Hídrica
  @Prop()
  depositoN?: TTipoDepositoN;

  @Prop()
  texturaLixiviacion?: TTexturaSuelo;

  @Prop()
  texturaEscorrentia?: TTexturaSuelo;

  @Prop()
  drenajeNaturalLixiviacion?: TTipoDrenaje;

  @Prop()
  drenajeNaturalEscorrentia?: TTipoDrenaje;

  @Prop()
  erosionEscorrentiaPendiente?: TTipoErosionEscorrentiaPendiente;

  @Prop()
  contenidoP?: TTipoContenidoP;

  @Prop({ type: Object })
  huellaHidrica?: IHuellaHidrica;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idSiembra?: string;

  @Prop({ type: Object })
  calidadClima?: ICalidadClima;

  // Populate

  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  departamento?: IDepartamento;
  sondaSuelo?: IEstacion;
  siembra?: ISiembra;
  dispositivos?: IDispositivo[];
  ubicacionAdministrativa?: IUbicacionAdministrativaLote;
}

export type LoteDocument = Lote & Document;

export const LoteSchema = SchemaFactory.createForClass(Lote);

LoteSchema.set('toJSON', { virtuals: true, getters: true });

LoteSchema.index({ 'ubicacion.geojson': '2dsphere' });

LoteSchema.index({ nombre: 1, idEstablecimiento: 1 }, { unique: true });

LoteSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

LoteSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

LoteSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

LoteSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: Establecimiento.name,
});

LoteSchema.virtual('departamento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDepartamento',
  ref: Departamento.name,
});

LoteSchema.virtual('sondaSuelo', {
  foreignField: '_id',
  justOne: true,
  localField: 'idSondaSuelo',
  ref: Estacion.name,
});

LoteSchema.virtual('siembra', {
  foreignField: '_id',
  justOne: true,
  localField: 'idSiembra',
  ref: 'Siembra',
});

LoteSchema.virtual('dispositivos', {
  foreignField: 'idLote',
  justOne: false,
  localField: '_id',
  ref: Dispositivo.name,
});

LoteSchema.virtual('calidadClima.nivelPrediccion.temperatura.estacion', {
  foreignField: '_id',
  justOne: true,
  localField: 'calidadClima.nivelPrediccion.temperatura.idEstacion',
  ref: Estacion.name,
});

LoteSchema.virtual('calidadClima.nivelPrediccion.humedadRelativa.estacion', {
  foreignField: '_id',
  justOne: true,
  localField: 'calidadClima.nivelPrediccion.humedadRelativa.idEstacion',
  ref: Estacion.name,
});

LoteSchema.virtual('calidadClima.nivelPrediccion.velocidadViento.estacion', {
  foreignField: '_id',
  justOne: true,
  localField: 'calidadClima.nivelPrediccion.velocidadViento.idEstacion',
  ref: Estacion.name,
});

LoteSchema.virtual('calidadClima.nivelPrediccion.lluvias.estacion', {
  foreignField: '_id',
  justOne: true,
  localField: 'calidadClima.nivelPrediccion.lluvias.idEstacion',
  ref: Estacion.name,
});
