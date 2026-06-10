import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDistribuidor,
  IEstablecimiento,
  IFertilizacion,
  IFertilizante,
  ILote,
  IProductor,
  IQuimica,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from 'src/entidades/quimica/modelos/schema';
import { Distribuidor } from 'src/entidades/distribuidor/modelos/schema';
import { Productor } from 'src/entidades/productor/modelos/schema';
import { Establecimiento } from 'src/entidades/establecimiento/modelos/schema';
import { Lote } from '../../lote/modelos/schema';
import { Fertilizante } from '../../fertilizante/modelos/schema';

@Schema()
export class Fertilizacion implements Exactly<IFertilizacion, Fertilizacion> {
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
  fechaFertilizacion?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idFertilizante?: string;

  @Prop({ type: Number })
  dosisKgHa?: number;

  // Populate
  lote?: ILote;
  fertilizante?: IFertilizante;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
}

export type FertilizacionDocument = Fertilizacion & Document;

export const FertilizacionSchema = SchemaFactory.createForClass(Fertilizacion);

FertilizacionSchema.set('toJSON', { virtuals: true, getters: true });

FertilizacionSchema.virtual('lote', {
  foreignField: '_id',
  justOne: true,
  localField: 'idLote',
  ref: Lote.name,
});

FertilizacionSchema.virtual('fertilizante', {
  foreignField: '_id',
  justOne: true,
  localField: 'idFertilizante',
  ref: Fertilizante.name,
});

FertilizacionSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

FertilizacionSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

FertilizacionSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

FertilizacionSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: Establecimiento.name,
});
