import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IEstablecimiento,
  IUbicacion,
  IQuimica,
  IDistribuidor,
  IProductor,
  IPronosticoEstacionMeteorologica,
  IClimaEstacionMeteorologica,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';
import { Productor } from '../../productor/modelos/schema';

@Schema()
export class Establecimiento
  implements Exactly<IEstablecimiento, Establecimiento>
{
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ type: [Object] })
  ubicacion?: IUbicacion[];

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ type: Object })
  prediccionClimatica?: {
    fecha?: string;
    pronosticos?: IPronosticoEstacionMeteorologica[];
  };

  @Prop({ type: Object })
  climaActual?: {
    fecha?: string;
    pronosticos?: IClimaEstacionMeteorologica;
  };

  // Populate
  quimica?: IQuimica;

  distribuidor?: IDistribuidor;

  productor?: IProductor;
}

export type EstablecimientoDocument = Establecimiento & Document;

export const EstablecimientoSchema =
  SchemaFactory.createForClass(Establecimiento);

EstablecimientoSchema.set('toJSON', { virtuals: true, getters: true });

EstablecimientoSchema.index({ nombre: 1, idProductor: 1 }, { unique: true });

EstablecimientoSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

EstablecimientoSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

EstablecimientoSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});
