import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IFoto, ILote } from 'modelos/src';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

@Schema()
export class Foto implements Exactly<IFoto, Foto> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop({ type: Date, index: true })
  fechaCaptura?: string;

  @Prop()
  url?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, index: true })
  idVisita?: string;

  @Prop({ type: String, enum: ['ftp', 'hik-connect', 'campo'], index: true })
  fuente?: IFoto['fuente'];

  @Prop({ type: String, enum: ['imagen', 'audio'] })
  tipoMedio?: IFoto['tipoMedio'];

  @Prop({ uppercase: true })
  serialCamara?: string;

  @Prop()
  canalCamara?: number;

  @Prop()
  nombreOriginal?: string;

  @Prop()
  mimeType?: string;

  @Prop({ type: Number, min: 0 })
  sizeBytes?: number;

  @Prop({ type: Number, min: 0 })
  duracionSegundos?: number;

  @Prop({ trim: true, maxlength: 120 })
  titulo?: string;

  @Prop({ maxlength: 3000 })
  descripcion?: string;

  @Prop({ type: [String], default: [] })
  etiquetas?: string[];

  @Prop({ type: Number, min: -90, max: 90 })
  latitud?: number;

  @Prop({ type: Number, min: -180, max: 180 })
  longitud?: number;

  @Prop({ type: Number, min: 0 })
  precisionMetros?: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  creadaPorUsuario?: string;

  @Prop()
  creadaPorNombre?: string;

  @Prop({
    type: String,
    enum: ['pendiente', 'lista', 'procesando', 'analizada', 'error'],
    default: 'lista',
  })
  estadoIA?: IFoto['estadoIA'];

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ type: Boolean, default: false, index: true })
  archivado?: boolean;

  @Prop({ type: Date })
  fechaArchivado?: string;

  @Prop()
  archivadoPor?: string;

  @Prop()
  motivoArchivado?: string;

  lote?: ILote;
}

export type FotoDocument = Foto & Document;

export const FotoSchema = SchemaFactory.createForClass(Foto);

FotoSchema.index({ idLote: 1, fuente: 1, fechaCaptura: -1, archivado: 1 });

FotoSchema.set('toJSON', { virtuals: true, getters: true });
