import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDistribuidor,
  IEstablecimiento,
  ILote,
  IPrediccionRiego,
  IProductor,
  IQuimica,
  IResultadoPrediccionRiego,
  ISiembra,
  IVariablesPrediccionRiego,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Siembra } from '../../siembra/modelos/schema';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';
import { Productor } from '../../productor/modelos/schema';
import { Establecimiento } from '../../establecimiento/modelos/schema';
import { Lote } from '../../lote/modelos/schema';

@Schema()
export class PrediccionRiego
  implements Exactly<IPrediccionRiego, PrediccionRiego>
{
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento?: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop()
  fechaPrediccion?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idSiembra?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote?: string;

  @Prop({ type: [Object] })
  regar?: IResultadoPrediccionRiego[];

  @Prop({ type: Object })
  variables?: IVariablesPrediccionRiego;

  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  siembra?: ISiembra;
  lote?: ILote;
}

export type PrediccionRiegoDocument = PrediccionRiego & Document;

export const PrediccionRiegoSchema =
  SchemaFactory.createForClass(PrediccionRiego);

PrediccionRiegoSchema.set('toJSON', { virtuals: true, getters: true });

PrediccionRiegoSchema.index(
  { idSiembra: 1, fechaPrediccion: 1 },
  { unique: true },
);

PrediccionRiegoSchema.virtual('siembra', {
  foreignField: '_id',
  justOne: true,
  localField: 'idSiembra',
  ref: Siembra.name,
});

PrediccionRiegoSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

PrediccionRiegoSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

PrediccionRiegoSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

PrediccionRiegoSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: Establecimiento.name,
});

PrediccionRiegoSchema.virtual('lote', {
  foreignField: '_id',
  justOne: true,
  localField: 'idLote',
  ref: Lote.name,
});
