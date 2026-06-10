import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IPrincipioActivo } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class PrincipioActivo
  implements Exactly<IPrincipioActivo, PrincipioActivo>
{
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ type: Number })
  koc?: number;

  @Prop()
  persistencia?: number;
}

export type PrincipioActivoDocument = PrincipioActivo & Document;

export const PrincipioActivoSchema =
  SchemaFactory.createForClass(PrincipioActivo);

PrincipioActivoSchema.set('toJSON', { virtuals: true, getters: true });
