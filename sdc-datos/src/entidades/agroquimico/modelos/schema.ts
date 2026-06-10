import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IAgroquimico, IEmpresa } from 'modelos/src';
import { Document } from 'mongoose';
import { Empresa } from '../../empresa/modelos/schema';

@Schema()
export class Agroquimico implements Exactly<IAgroquimico, Agroquimico> {
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEmpresa?: string;

  @Prop()
  segmento?: string;

  @Prop({ type: [String] })
  subsegmentos?: string[];

  // Virtual

  empresa?: IEmpresa;
}

export type AgroquimicoDocument = Agroquimico & Document;

export const AgroquimicoSchema = SchemaFactory.createForClass(Agroquimico);

AgroquimicoSchema.set('toJSON', { virtuals: true, getters: true });

AgroquimicoSchema.virtual('empresa', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEmpresa',
  ref: Empresa.name,
});
