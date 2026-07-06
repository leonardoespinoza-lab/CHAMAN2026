import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IaMalezaEstado = 'pendiente' | 'procesando' | 'completado' | 'error';

export interface IaMalezaDetection {
  class: string;
  confidence: number;
  label?: string;
  group?: string;
  agronomicNote?: string;
  recommendation?: string;
  severity?: 'informativo' | 'bajo' | 'medio' | 'alto';
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

@Schema({ timestamps: true })
export class IaMalezaAnalisis {
  _id: string;

  @Prop()
  ensayoId?: string;

  @Prop()
  loteId?: string;

  @Prop()
  loteNombre?: string;

  @Prop()
  cultivo?: string;

  @Prop()
  campania?: string;

  @Prop()
  fecha?: string;

  @Prop({ default: 'deteccion_malezas' })
  tipoAnalisis?: string;

  @Prop({ default: 'pendiente' })
  estado?: IaMalezaEstado;

  @Prop()
  originalFilename?: string;

  @Prop()
  mimeType?: string;

  @Prop()
  sizeBytes?: number;

  @Prop()
  originalImagePath?: string;

  @Prop()
  processedImagePath?: string;

  @Prop()
  originalImageUrl?: string;

  @Prop()
  processedImageUrl?: string;

  @Prop()
  sourceType?: 'upload' | 'chaman_camera';

  @Prop()
  sourcePhotoId?: string;

  @Prop()
  cameraSerial?: string;

  @Prop()
  cameraUrl?: string;

  @Prop()
  modelVersion?: string;

  @Prop({ type: [Object], default: [] })
  detections?: IaMalezaDetection[];

  @Prop({ type: Object })
  summary?: Record<string, any>;

  @Prop({ type: Object })
  resultJson?: Record<string, any>;

  @Prop()
  error?: string;

  @Prop()
  analyzedAt?: Date;

  @Prop({ default: true })
  experimental?: boolean;
}

export type IaMalezaAnalisisDocument = IaMalezaAnalisis & Document;

export const IaMalezaAnalisisSchema =
  SchemaFactory.createForClass(IaMalezaAnalisis);

IaMalezaAnalisisSchema.set('toJSON', { virtuals: true, getters: true });

IaMalezaAnalisisSchema.index({ loteId: 1, fecha: -1 });
IaMalezaAnalisisSchema.index({ campania: 1, cultivo: 1, estado: 1 });
IaMalezaAnalisisSchema.index({ 'summary.classes_detected': 1 });
