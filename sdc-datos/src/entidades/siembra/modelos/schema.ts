import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  ISiembra,
  IQuimica,
  IDistribuidor,
  IProductor,
  IEstablecimiento,
  IDepartamento,
  ICoordenadas,
  ILote,
  ISemilla,
  IPrediccion,
  ICrono,
  IGeoJSONPoint,
  TTipoFijacionN,
  TTipoDosisN,
  TTipoRendimiento,
  TTipoManejoAgronomico,
  TTipoIntensidadLluvias,
  TTipoMateriaOrganica,
  IHuellaHidrica,
  TTipoLluviaPromedio,
  TTipoDosisP,
  TTipoLabranza,
  IResultadoPrediccionRiego,
  IResultadoPrediccionMalezas,
  IRegistroFenologico,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';
import { Productor } from '../../productor/modelos/schema';
import { Establecimiento } from '../../establecimiento/modelos/schema';
import { Departamento } from '../../departamento/modelos/schema';
import { Lote } from '../../lote/modelos/schema';
import { Semilla } from '../../semilla/modelos/schema';
import { Crono } from '../../crono/modelos/schema';

@Schema()
export class Siembra implements Exactly<ISiembra, Siembra> {
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDepartamento?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idSemilla: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idCrono: string;

  @Prop({ type: Date })
  fechaSiembra: string;

  @Prop({ type: Date })
  fechaCosecha?: string;

  @Prop({ type: Boolean, default: true })
  activa?: boolean;

  @Prop({ type: Object })
  coordenadas?: ICoordenadas;

  @Prop({ type: Object })
  geojson?: IGeoJSONPoint;

  @Prop({ type: Object })
  ultimaPrediccion: IPrediccion;

  @Prop({ type: [Object] })
  ultimaPrediccionRiego?: IResultadoPrediccionRiego[];

  @Prop({ type: Object })
  ultimaPrediccionMalezas?: IResultadoPrediccionMalezas;

  // Datos para huella hídrica
  @Prop()
  humedadCosecha?: number;

  @Prop()
  rendimientoObtenidoKgHa?: number;

  @Prop()
  rendimientoObtenidoKgHaSeco?: number;

  @Prop()
  lluviasPromedio?: TTipoLluviaPromedio;

  @Prop()
  fijacionN?: TTipoFijacionN;

  @Prop()
  dosisN?: TTipoDosisN;

  @Prop()
  dosisP?: TTipoDosisP;

  @Prop()
  labranza?: TTipoLabranza;

  @Prop()
  rendimiento?: TTipoRendimiento;

  @Prop()
  manejoAgronomico?: TTipoManejoAgronomico;

  @Prop()
  intensidadLluvias?: TTipoIntensidadLluvias;

  @Prop()
  materiaOrganica?: TTipoMateriaOrganica;

  @Prop({ type: Object })
  huellaHidrica?: IHuellaHidrica;

  @Prop({ type: [Object], default: [] })
  registrosFenologicos?: IRegistroFenologico[];

  // Campos para diagnóstico del cálculo de agua útil
  @Prop()
  aguaUtilReal?: number;

  @Prop()
  estadoCalculoAguaUtil?:
    | 'calculado'
    | 'estimado'
    | 'no_disponible'
    | 'fallida';

  @Prop()
  motivoCalculoAguaUtil?: string;

  // Populate
  quimica?: IQuimica;

  distribuidor?: IDistribuidor;

  productor?: IProductor;

  establecimiento?: IEstablecimiento;

  lote?: ILote;

  departamento?: IDepartamento;

  semilla?: ISemilla;

  crono?: ICrono;
}

export type SiembraDocument = Siembra & Document;

export const SiembraSchema = SchemaFactory.createForClass(Siembra);

SiembraSchema.set('toJSON', { virtuals: true, getters: true });

SiembraSchema.index({ geojson: '2dsphere' });

SiembraSchema.index({ fechaSiembra: 1 });
SiembraSchema.index({ idQuimica: 1, fechaSiembra: 1 });
SiembraSchema.index({ idDistribuidor: 1, fechaSiembra: 1 });
SiembraSchema.index({ idProductor: 1, fechaSiembra: 1 });
SiembraSchema.index({ idEstablecimiento: 1, fechaSiembra: 1 });

SiembraSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

SiembraSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

SiembraSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

SiembraSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: Establecimiento.name,
});

SiembraSchema.virtual('lote', {
  foreignField: '_id',
  justOne: true,
  localField: 'idLote',
  ref: Lote.name,
});

SiembraSchema.virtual('departamento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDepartamento',
  ref: Departamento.name,
});

SiembraSchema.virtual('semilla', {
  foreignField: '_id',
  justOne: true,
  localField: 'idSemilla',
  ref: Semilla.name,
});

SiembraSchema.virtual('crono', {
  foreignField: '_id',
  justOne: true,
  localField: 'idCrono',
  ref: Crono.name,
});
