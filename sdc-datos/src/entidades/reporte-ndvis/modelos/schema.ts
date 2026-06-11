import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IReporteNDVI,
  IMetadata,
  IDepartamento,
  IDistribuidor,
  IEstablecimiento,
  ILote,
  IProductor,
  IQuimica,
} from 'modelos/src';
import mongoose, { Document } from 'mongoose';
import { Quimica } from 'src/entidades/quimica/modelos/schema';

@Schema()
export class ReporteNDVI implements Exactly<IReporteNDVI, ReporteNDVI> {
  _id?: string;
  //
  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop({ type: Date })
  fechaDelReporte?: string;

  @Prop({ type: Date })
  fechaDeLaImagen?: string;

  @Prop()
  ndviPromedio?: number;

  @Prop({ type: Object })
  indices?: IReporteNDVI['indices'];

  @Prop()
  ndviUrl?: string;

  @Prop()
  coleccion?: string;

  @Prop({ type: Object })
  metadataImagen?: IMetadata;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstablecimiento?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDepartamento?: string;

  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  lote?: ILote;
  departamento?: IDepartamento;
}

export type ReporteNDVIDocument = ReporteNDVI & Document;

export const ReporteNDVISchema = SchemaFactory.createForClass(ReporteNDVI);

// Indice para que el idLote y fechaDeLaImagen no se repitan
ReporteNDVISchema.index(
  { idLote: 1, fechaDeLaImagen: 1 },
  { unique: true, background: true },
);

ReporteNDVISchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

ReporteNDVISchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: 'Distribuidor',
});

ReporteNDVISchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: 'Productor',
});

ReporteNDVISchema.virtual('establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstablecimiento',
  ref: 'Establecimiento',
});

ReporteNDVISchema.virtual('lote', {
  foreignField: '_id',
  justOne: true,
  localField: 'idLote',
  ref: 'Lote',
});

ReporteNDVISchema.virtual('departamento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDepartamento',
  ref: 'Departamento',
});
