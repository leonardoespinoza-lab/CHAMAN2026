import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IEnfermedad } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Enfermedad implements Exactly<IEnfermedad, Enfermedad> {
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ required: true })
  cultivo: string;

  @Prop({ type: [Number], required: true })
  etapas: number[];

  @Prop()
  formula?: string;

  @Prop()
  tempMin?: number;

  @Prop()
  tempMax?: number;

  @Prop()
  rocioMin?: number;

  @Prop()
  rocioMax?: number;

  @Prop()
  latenciaMin?: number;

  @Prop()
  latenciaMax?: number;
}

export type EnfermedadDocument = Enfermedad & Document;

export const EnfermedadSchema = SchemaFactory.createForClass(Enfermedad);

EnfermedadSchema.set('toJSON', { virtuals: true, getters: true });

EnfermedadSchema.index({ nombre: 1, cultivo: 1 }, { unique: true });
