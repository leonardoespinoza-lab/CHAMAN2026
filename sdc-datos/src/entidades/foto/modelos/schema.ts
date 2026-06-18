import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IFoto, ILote } from 'modelos/src';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

@Schema()
export class Foto implements Exactly<IFoto, Foto> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop()
  url?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote?: string;

  @Prop()
  fuente?: IFoto['fuente'];

  @Prop({ uppercase: true })
  serialCamara?: string;

  @Prop()
  canalCamara?: number;

  @Prop()
  nombreOriginal?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  lote?: ILote;
}

export type FotoDocument = Foto & Document;

export const FotoSchema = SchemaFactory.createForClass(Foto);

FotoSchema.set('toJSON', { virtuals: true, getters: true });
