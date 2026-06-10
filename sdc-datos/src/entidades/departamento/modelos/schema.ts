import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IDepartamento, IProvincia, IUbicacion } from 'modelos/src';
import { Document } from 'mongoose';
import { Provincia } from '../../provincia/modelos/schema';

@Schema()
export class Departamento implements Exactly<IDepartamento, Departamento> {
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ type: Object })
  ubicacion?: IUbicacion;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  idProvincia: string;

  // Populate
  provincia?: IProvincia;
}

export type DepartamentoDocument = Departamento & Document;

export const DepartamentoSchema = SchemaFactory.createForClass(Departamento);

DepartamentoSchema.set('toJSON', { virtuals: true, getters: true });

DepartamentoSchema.index({ 'ubicacion.geojson': '2dsphere' });

DepartamentoSchema.index({ nombre: 1, idProvincia: 1 }, { unique: true });

DepartamentoSchema.virtual('provincia', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProvincia',
  ref: Provincia.name,
});
