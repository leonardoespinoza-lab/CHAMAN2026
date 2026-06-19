import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDispositivo,
  IMetaDataLora,
  IReporte,
  IValoresV2,
} from 'modelos/src';
import mongoose, { Document } from 'mongoose';
import { Dispositivo } from 'src/entidades/dispositivos/modelos/schema';

@Schema()
export class Reporte implements Exactly<IReporte, Reporte> {
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDispositivo?: string;

  @Prop()
  deveui?: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string; // Cuando me llega

  @Prop({ type: Date })
  fecha?: string; // Fecha del reporte

  @Prop({ type: String, enum: ['parcial', 'completo'], default: 'completo' })
  estado?: 'parcial' | 'completo'; // Para los partidos como la lanza de 12

  @Prop({ type: Object })
  datos?: IValoresV2;

  @Prop({ type: Object })
  metadataLora?: IMetaDataLora;

  // Populate
  dispositivo?: IDispositivo;
}

export type ReporteDocument = Reporte & Document;

export const ReporteSchema = SchemaFactory.createForClass(Reporte);

ReporteSchema.set('toJSON', { virtuals: true, getters: true });
ReporteSchema.index({ deveui: 1, fecha: 1 });
ReporteSchema.index({ deveui: 1, fechaCreacion: 1 });
ReporteSchema.index({ idDispositivo: 1, fecha: 1 });
ReporteSchema.index({ idDispositivo: 1, fechaCreacion: 1 });
ReporteSchema.index({ estado: 1, deveui: 1, fecha: 1 });

ReporteSchema.virtual('dispositivo', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDispositivo',
  ref: Dispositivo.name,
});
