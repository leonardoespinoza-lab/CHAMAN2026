import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDistribuidor,
  IGeoJSONPoint,
  IIntegracion,
  IQuimica,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from '../../quimica/modelos/schema';

@Schema()
export class Distribuidor implements Exactly<IDistribuidor, Distribuidor> {
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop()
  logo: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: Object })
  integraciones?: IIntegracion[];

  // Datos de Carga
  @Prop({ type: Object })
  geojson?: IGeoJSONPoint;

  @Prop({ type: String })
  direccion?: string;

  @Prop({ type: Number, min: 1, max: 1000 })
  radioInfluenciaKm?: number;

  @Prop({ type: Boolean, default: false, index: true })
  archivado?: boolean;

  @Prop({ type: Date })
  fechaArchivado?: string;

  @Prop({ type: String })
  archivadoPor?: string;

  @Prop({ type: String })
  motivoArchivado?: string;

  // Populate
  quimica?: IQuimica;
}

export type DistribuidorDocument = Distribuidor & Document;

export const DistribuidorSchema = SchemaFactory.createForClass(Distribuidor);

DistribuidorSchema.set('toJSON', { virtuals: true, getters: true });

DistribuidorSchema.index(
  { nombre: 1, idQuimica: 1 },
  {
    name: 'uniq_distribuidor_quimica_nombre_activo_v2',
    unique: true,
    partialFilterExpression: { archivado: false },
  },
);

DistribuidorSchema.index({ geojson: '2dsphere' });

DistribuidorSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});
