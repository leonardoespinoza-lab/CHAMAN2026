import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IVisitaLote } from 'modelos/src';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

@Schema({ collection: 'visitas_lote' })
export class VisitaLote implements Exactly<IVisitaLote, VisitaLote> {
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, index: true }) idTenant?: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId, index: true }) idAsesorPropietario?: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId }) idQuimica?: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId }) idDistribuidor?: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId }) idProductor?: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId, index: true }) idEstablecimiento?: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true, index: true }) idLote?: string;

  @Prop({ type: Date, required: true, index: true }) fechaVisita?: string;
  @Prop() horaInicio?: string;
  @Prop() horaFin?: string;
  @Prop({ trim: true, maxlength: 120 }) titulo?: string;
  @Prop({
    type: String,
    enum: [
      'recorrida_general', 'monitoreo_sanitario', 'fenologia', 'riego',
      'nutricion', 'aplicacion', 'muestreo', 'cosecha', 'otro',
    ],
    default: 'recorrida_general',
  })
  tipo?: IVisitaLote['tipo'];
  @Prop({
    type: String,
    enum: ['programada', 'realizada', 'cancelada'],
    default: 'realizada',
    index: true,
  })
  estado?: IVisitaLote['estado'];
  @Prop({ type: [String], default: [] }) actividades?: IVisitaLote['actividades'];
  @Prop({ type: [String], default: [] }) participantes?: string[];
  @Prop({ maxlength: 5000 }) observaciones?: string;
  @Prop({ maxlength: 5000 }) hallazgos?: string;
  @Prop({ maxlength: 5000 }) recomendaciones?: string;
  @Prop({ type: Date }) proximaVisita?: string;
  @Prop({ type: Number, min: -90, max: 90 }) latitud?: number;
  @Prop({ type: Number, min: -180, max: 180 }) longitud?: number;
  @Prop({ type: Number, min: 0 }) precisionMetros?: number;
  @Prop({ type: [mongoose.Schema.Types.ObjectId], default: [] }) idsFotos?: string[];
  @Prop({ type: mongoose.Schema.Types.ObjectId }) creadaPorUsuario?: string;
  @Prop() creadaPorNombre?: string;
  @Prop({ type: Date, default: Date.now }) fechaCreacion?: string;
  @Prop({ type: Date, default: Date.now }) fechaActualizacion?: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId }) actualizadoPorUsuario?: string;
  @Prop() actualizadoPorNombre?: string;
  @Prop({ type: Boolean, default: false, index: true }) archivado?: boolean;
  @Prop({ type: Date }) fechaArchivado?: string;
  @Prop() archivadoPor?: string;
  @Prop() motivoArchivado?: string;
}

export type VisitaLoteDocument = VisitaLote & Document;
export const VisitaLoteSchema = SchemaFactory.createForClass(VisitaLote);

VisitaLoteSchema.index({ idLote: 1, fechaVisita: -1, archivado: 1 });
VisitaLoteSchema.set('toJSON', { virtuals: true, getters: true });
