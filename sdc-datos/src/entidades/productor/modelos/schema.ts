import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IProductor,
  IQuimica,
  IDistribuidor,
  IIntegracion,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';

@Schema()
export class Productor implements Exactly<IProductor, Productor> {
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ required: true })
  nombre: string;

  @Prop()
  logo: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ type: Object })
  integraciones?: IIntegracion[];

  @Prop({ type: Boolean })
  gratis?: boolean;

  // Populate
  quimica?: IQuimica;

  distribuidor?: IDistribuidor;
}

export type ProductorDocument = Productor & Document;

export const ProductorSchema = SchemaFactory.createForClass(Productor);

ProductorSchema.set('toJSON', { virtuals: true, getters: true });

ProductorSchema.index({ nombre: 1, idDistribuidor: 1 }, { unique: true });

ProductorSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

ProductorSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});
