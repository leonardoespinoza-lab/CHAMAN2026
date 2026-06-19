import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, ICamara, IFoto, ILote } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Camara implements Exactly<ICamara, Camara> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop({ type: String, uppercase: true, trim: true, required: true, index: true, unique: true })
  serialCamara: string;

  @Prop()
  nombre?: string;

  @Prop()
  modelo?: string;

  @Prop()
  categoria?: string;

  @Prop()
  canal?: number;

  @Prop()
  online?: boolean;

  @Prop()
  area?: string;

  @Prop({ type: String, enum: ['hik-connect', 'ftp'] })
  fuente?: ICamara['fuente'];

  @Prop({ type: Date })
  fechaSincronizacion?: string;

  @Prop({ type: Date })
  fechaUltimaComunicacion?: string;

  @Prop({ type: Object })
  capturaAutomatica?: ICamara['capturaAutomatica'];

  @Prop({ type: Object })
  raw?: Record<string, unknown>;

  lotes?: ILote[];
  ultimaFoto?: IFoto;
  totalFotos?: number;
}

export type CamaraDocument = Camara & Document;

export const CamaraSchema = SchemaFactory.createForClass(Camara);

CamaraSchema.set('toJSON', { virtuals: true, getters: true });
