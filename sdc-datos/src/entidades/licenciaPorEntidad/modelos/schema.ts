import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDistribuidor,
  ILicencia,
  ILicenciaPorEntidad,
  IProductor,
  IQuimica,
} from 'modelos/src';
import mongoose, { Document } from 'mongoose';
import { Distribuidor } from 'src/entidades/distribuidor/modelos/schema';
import { Licencia } from 'src/entidades/licencia/modelos/schema';
import { Productor } from 'src/entidades/productor/modelos/schema';
import { Quimica } from 'src/entidades/quimica/modelos/schema';

@Schema()
export class LicenciaPorEntidad
  implements Exactly<ILicenciaPorEntidad, LicenciaPorEntidad>
{
  _id?: string;
  //
  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string; // Fecha de creación de la licencia

  @Prop({ type: Date })
  fechaExpiracion?: string; // Fecha de expiración de la licencia

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLicencia?: string; // ID de la licencia

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEntidad?: string; // puede ser ID de Química, Distribuidor o Productor
  // Virtuals
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  licencia?: ILicencia;
}

export type LicenciaPorEntidadDocument = LicenciaPorEntidad & Document;

export const LicenciaPorEntidadSchema =
  SchemaFactory.createForClass(LicenciaPorEntidad);

LicenciaPorEntidadSchema.set('toJSON', { virtuals: true, getters: true });

LicenciaPorEntidadSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEntidad',
  ref: Quimica.name,
});

LicenciaPorEntidadSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEntidad',
  ref: Distribuidor.name,
});

LicenciaPorEntidadSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEntidad',
  ref: Productor.name,
});

LicenciaPorEntidadSchema.virtual('licencia', {
  foreignField: '_id',
  justOne: true,
  localField: 'idLicencia',
  ref: Licencia.name,
});
