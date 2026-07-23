import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IProductor,
  IQuimica,
  IDistribuidor,
  IIntegracion,
  IGeoJSONPoint,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';

@Schema()
export class Productor implements Exactly<IProductor, Productor> {
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, index: true })
  idTenant?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idAsesorPropietario?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ type: String })
  razonSocial?: string;

  @Prop({ type: String })
  cuit?: string;

  @Prop({ type: String })
  condicionIva?: string;

  @Prop({ type: String })
  emailFiscal?: string;

  @Prop({ type: String })
  telefonoFiscal?: string;

  @Prop({ type: String })
  direccionFiscal?: string;

  @Prop()
  logo: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ type: Object })
  integraciones?: IIntegracion[];

  @Prop({ type: String })
  direccion?: string;

  @Prop({ type: Object })
  geojson?: IGeoJSONPoint;

  @Prop({ type: Number, min: 1, max: 1000 })
  radioInfluenciaKm?: number;

  @Prop({ type: Boolean })
  gratis?: boolean;

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

  distribuidor?: IDistribuidor;
}

export type ProductorDocument = Productor & Document;

export const ProductorSchema = SchemaFactory.createForClass(Productor);

ProductorSchema.set('toJSON', { virtuals: true, getters: true });

ProductorSchema.index(
  { nombre: 1, idDistribuidor: 1 },
  {
    name: 'uniq_productor_distribuidor_nombre_activo_v3',
    unique: true,
    partialFilterExpression: {
      idDistribuidor: { $type: 'objectId' },
      archivado: false,
    },
  },
);
ProductorSchema.index({ geojson: '2dsphere' });
ProductorSchema.index(
  { nombre: 1, idAsesorPropietario: 1 },
  {
    name: 'uniq_productor_asesor_nombre_activo_v3',
    unique: true,
    partialFilterExpression: {
      idAsesorPropietario: { $type: 'objectId' },
      archivado: false,
    },
  },
);

ProductorSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

ProductorSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});
