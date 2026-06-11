import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDispositivo,
  IMetaDataLora,
  TipoDispositivo,
  SensoresV2,
  IQuimica,
  IDistribuidor,
  IProductor,
  IGeoJSONPoint,
  IBateria,
  IReporte,
  IFrioAcumulado,
} from 'modelos/src';
import mongoose, { Document } from 'mongoose';
import { Distribuidor } from 'src/entidades/distribuidor/modelos/schema';
import { Productor } from 'src/entidades/productor/modelos/schema';
import { Quimica } from 'src/entidades/quimica/modelos/schema';

@Schema()
export class Dispositivo implements Exactly<IDispositivo, Dispositivo> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;
  //
  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor?: string;
  //
  @Prop({ type: String, uppercase: true })
  deveui?: string;

  @Prop()
  tipo?: TipoDispositivo;

  @Prop({ type: Object })
  metadata?: IMetaDataLora;
  /**
   * Sensores que tiene la estación - Cambia según el origen
   */
  @Prop({ type: [String] })
  sensores?: SensoresV2[]; // ["temperatura", "humedad", "viento", "radiacion"]
  // Datos de Carga
  @Prop({ type: Object })
  geojson?: IGeoJSONPoint;

  @Prop()
  nombre?: string;

  @Prop({ type: Object })
  bateria?: IBateria;

  @Prop({ type: Object })
  ultimoReporte?: IReporte;

  @Prop({ type: Object })
  frioAcumulado?: IFrioAcumulado;

  @Prop({ type: Date })
  fechaUltimaComunicacion?: string; // Puede ser de otra copsa que no sea un reporte.

  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
}

export type DispositivoDocument = Dispositivo & Document;

export const DispositivoSchema = SchemaFactory.createForClass(Dispositivo);

DispositivoSchema.set('toJSON', { virtuals: true, getters: true });

DispositivoSchema.index({ geojson: '2dsphere' });

DispositivoSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

DispositivoSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

DispositivoSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});
