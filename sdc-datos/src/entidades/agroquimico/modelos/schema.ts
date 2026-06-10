import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IAgroquimico, IEmpresa, IPrincipioActivo } from 'modelos/src';
import { Document } from 'mongoose';
import { Empresa } from '../../empresa/modelos/schema';
import { PrincipioActivo } from '../../principio-activo/modelos/schema';

@Schema()
export class Agroquimico implements Exactly<IAgroquimico, Agroquimico> {
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEmpresa?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idPrincipioActivo?: string;

  @Prop()
  concentracion?: number;

  @Prop()
  koc?: number;

  @Prop()
  persistencia?: number;

  @Prop()
  volatilidad?: string;

  @Prop()
  segmento?: string;

  @Prop({ type: [String] })
  subsegmentos?: string[];

  @Prop()
  fuente?: string;

  // Virtual

  empresa?: IEmpresa;
  principioActivo?: IPrincipioActivo;
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

AgroquimicoSchema.virtual('principioActivo', {
  foreignField: '_id',
  justOne: true,
  localField: 'idPrincipioActivo',
  ref: PrincipioActivo.name,
});
