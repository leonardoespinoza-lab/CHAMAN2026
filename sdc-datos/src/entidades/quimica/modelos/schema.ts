import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IIntegracion, IQuimica } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Quimica implements Exactly<IQuimica, Quimica> {
  _id: string;

  @Prop({ required: true, unique: true })
  nombre: string;

  @Prop()
  logo: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ type: Object })
  integraciones?: IIntegracion[];
}

export type QuimicaDocument = Quimica & Document;

export const QuimicaSchema = SchemaFactory.createForClass(Quimica);

QuimicaSchema.set('toJSON', { virtuals: true, getters: true });
