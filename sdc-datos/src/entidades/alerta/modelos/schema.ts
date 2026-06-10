import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDistribuidor,
  IEstablecimiento,
  IAlerta,
  IProductor,
  IQuimica,
  EstadoAlerta,
  IEstadoAlerta,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from 'src/entidades/quimica/modelos/schema';
import { Distribuidor } from 'src/entidades/distribuidor/modelos/schema';
import { Productor } from 'src/entidades/productor/modelos/schema';
import { Establecimiento } from 'src/entidades/establecimiento/modelos/schema';
import { Siembra } from 'src/entidades/siembra/modelos/schema';

@Schema()
export class Alerta implements Exactly<IAlerta, Alerta> {
  _id?: string;

  // Tenant
  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idSiembra?: string;

  // // Datos Autogenerados
  @Prop({ type: Date, default: Date.now })
  fecha?: string;

  // Estados de la alerta
  @Prop({ type: [Object] })
  estados?: IEstadoAlerta[];

  @Prop({ type: String })
  estadoActual?: EstadoAlerta;

  @Prop({ type: Boolean })
  activa?: boolean;
  // // Datos especificos de la alerta de acuerdo al tipo de dispositivo
  @Prop({ type: String })
  descripcion?: string;

  @Prop({ type: [Object] })
  reportes?: Record<string, any>[];

  // // Virtuals
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
}

export type AlertaDocument = Alerta & Document;

export const AlertaSchema = SchemaFactory.createForClass(Alerta);

AlertaSchema.set('toJSON', { virtuals: true, getters: true });

AlertaSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

AlertaSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

AlertaSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

AlertaSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: Establecimiento.name,
});

AlertaSchema.virtual('siembra', {
  foreignField: '_id',
  justOne: true,
  localField: 'idSiembra',
  ref: Siembra.name,
});
