import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDistribuidor,
  IEstablecimiento,
  IPrediccion,
  IPrediccionEnfermedad,
  IPrediccionEstacion,
  IProductor,
  IQuimica,
  ISiembra,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Siembra } from '../../siembra/modelos/schema';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';
import { Productor } from '../../productor/modelos/schema';
import { Establecimiento } from '../../establecimiento/modelos/schema';

@Schema()
export class Prediccion implements Exactly<IPrediccion, Prediccion> {
  _id: string;

  @Prop({ type: Date })
  fecha: string;

  @Prop()
  fechaPrediccion: string;

  @Prop()
  etapa: number;

  @Prop()
  nombreEtapa: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idSiembra: string;

  @Prop({ type: [Object] })
  enfermedades: IPrediccionEnfermedad[];

  @Prop({ type: Object })
  estacion: IPrediccionEstacion;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento?: string;

  // Populate
  siembra?: ISiembra;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
}

export type PrediccionDocument = Prediccion & Document;

export const PrediccionSchema = SchemaFactory.createForClass(Prediccion);

PrediccionSchema.set('toJSON', { virtuals: true, getters: true });

PrediccionSchema.index({ fecha: 1 });
PrediccionSchema.index({ idSiembra: 1, fecha: 1 }, { unique: true });
PrediccionSchema.index({ idQuimica: 1, idSiembra: 1, fecha: 1 });
PrediccionSchema.index({ idDistribuidor: 1, idSiembra: 1, fecha: 1 });
PrediccionSchema.index({ idProductor: 1, idSiembra: 1, fecha: 1 });
PrediccionSchema.index({ idEstablecimiento: 1, idSiembra: 1, fecha: 1 });
PrediccionSchema.index({ idQuimica: 1, fecha: 1 });
PrediccionSchema.index({ idDistribuidor: 1, fecha: 1 });
PrediccionSchema.index({ idProductor: 1, fecha: 1 });
PrediccionSchema.index({ idEstablecimiento: 1, fecha: 1 });

PrediccionSchema.virtual('siembra', {
  foreignField: '_id',
  justOne: true,
  localField: 'idSiembra',
  ref: Siembra.name,
});

PrediccionSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

PrediccionSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

PrediccionSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

PrediccionSchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: Establecimiento.name,
});
