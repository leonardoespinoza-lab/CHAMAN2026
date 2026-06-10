import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IProvincia, IUbicacion } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Provincia implements Exactly<IProvincia, Provincia> {
  _id: string;

  @Prop({ required: true, unique: true })
  nombre: string;

  @Prop({ type: Object })
  ubicacion?: IUbicacion;
}

export type ProvinciaDocument = Provincia & Document;

export const ProvinciaSchema = SchemaFactory.createForClass(Provincia);

ProvinciaSchema.set('toJSON', { virtuals: true, getters: true });

ProvinciaSchema.index({ 'ubicacion.geojson': '2dsphere' });
