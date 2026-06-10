import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IFertilizante } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Fertilizante implements Exactly<IFertilizante, Fertilizante> {
  _id: string;

  @Prop()
  nombre?: string;

  @Prop()
  porcentajeN?: number;

  @Prop()
  porcentajeP?: number;
}

export type FertilizanteDocument = Fertilizante & Document;

export const FertilizanteSchema = SchemaFactory.createForClass(Fertilizante);

FertilizanteSchema.set('toJSON', { virtuals: true, getters: true });
