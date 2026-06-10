import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IAgroquimico,
  IDistribuidor,
  IEstablecimiento,
  IFumigacion,
  IPrincipioActivo,
  IProductor,
  IQuimica,
  ISiembra,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Siembra } from '../../siembra/modelos/schema';
import { Agroquimico } from '../../agroquimico/modelos/schema';
import { Quimica } from 'src/entidades/quimica/modelos/schema';
import { Distribuidor } from 'src/entidades/distribuidor/modelos/schema';
import { Productor } from 'src/entidades/productor/modelos/schema';
import { Establecimiento } from 'src/entidades/establecimiento/modelos/schema';
import { PrincipioActivo } from '../../principio-activo/modelos/schema';

@Schema()
export class Fumigacion implements Exactly<IFumigacion, Fumigacion> {
  _id: string;

  // Tenant
  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento?: string;

  // // Datos Autogenerados
  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  // Info de Fumigación
  @Prop({ type: Date, default: Date.now })
  fechaFumigacion?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idSiembra?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idAgroquimico?: string;

  @Prop({ type: Number })
  duracion?: number; // 15 días

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idPrincipioActivo?: string;

  @Prop({ type: Number })
  concentracion?: number;

  @Prop({ type: Number })
  dosisLtHa?: number;

  // Populate
  siembra?: ISiembra;
  agroquimico?: IAgroquimico;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  principioActivo?: IPrincipioActivo;
}

export type FumigacionDocument = Fumigacion & Document;

export const FumigacionSchema = SchemaFactory.createForClass(Fumigacion);

FumigacionSchema.set('toJSON', { virtuals: true, getters: true });

FumigacionSchema.virtual('siembra', {
  foreignField: '_id',
  justOne: true,
  localField: 'idSiembra',
  ref: Siembra.name,
});

FumigacionSchema.virtual('agroquimico', {
  foreignField: '_id',
  justOne: true,
  localField: 'idAgroquimico',
  ref: Agroquimico.name,
});

FumigacionSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

FumigacionSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

FumigacionSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

FumigacionSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: Establecimiento.name,
});

FumigacionSchema.virtual('principioActivo', {
  foreignField: '_id',
  justOne: true,
  localField: 'idPrincipioActivo',
  ref: PrincipioActivo.name,
});
