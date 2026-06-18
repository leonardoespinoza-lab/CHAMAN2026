import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Exactly, ISueloInta, TSueloIntaGeometry } from 'modelos/src';

@Schema({ collection: 'suelos_inta' })
export class SueloInta implements Exactly<ISueloInta, SueloInta> {
  _id: string;

  @Prop({ index: true })
  ogcFid?: number;

  @Prop()
  fuente?: string;

  @Prop({ index: true })
  provincia?: string;

  @Prop()
  carta?: number;

  @Prop({ index: true })
  unidadCartografica?: string;

  @Prop()
  tipoUnidad?: string;

  @Prop({ type: Object, required: true })
  geometry?: TSueloIntaGeometry;

  @Prop({ type: Object })
  properties?: Record<string, unknown>;

  @Prop()
  fechaImportacion?: string;
}

export type SueloIntaDocument = SueloInta & Document;

export const SueloIntaSchema = SchemaFactory.createForClass(SueloInta);

SueloIntaSchema.set('toJSON', { virtuals: true, getters: true });

SueloIntaSchema.index({ geometry: '2dsphere' });
SueloIntaSchema.index({ provincia: 1, unidadCartografica: 1 });
