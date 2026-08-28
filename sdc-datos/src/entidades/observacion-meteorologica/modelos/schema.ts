import mongoose, { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  EstadoDatoMeteorologico,
  FuenteMeteorologicaNormalizada,
  GranularidadMeteorologica,
  ICoordenadas,
  IObservacionMeteorologicaNormalizada,
  IValoresMeteorologicosNormalizados,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';

@Schema({
  collection: 'observaciones_meteorologicas',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class ObservacionMeteorologica implements IObservacionMeteorologicaNormalizada {
  _id?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  idEstablecimiento: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idLote?: string;

  @Prop({ type: Date, required: true })
  timestamp: string;

  @Prop({ required: true })
  fechaLocal: string;

  @Prop({ required: true })
  timezone: string;

  @Prop({ type: String, enum: ['hourly', 'daily'], required: true })
  granularidad: GranularidadMeteorologica;

  @Prop({
    type: String,
    enum: ['observed', 'estimated', 'forecast', 'missing', 'invalid'],
    required: true,
  })
  estado: EstadoDatoMeteorologico;

  @Prop({ required: true })
  esPronostico: boolean;

  @Prop({ type: Object, required: true })
  valores: IValoresMeteorologicosNormalizados;

  @Prop({
    type: String,
    enum: [
      'sensor',
      'station',
      'open_meteo',
      'chaman_meteo',
      'mixed',
      'derived_sensor',
      'derived_station',
      'derived_open_meteo',
      'derived_chaman_meteo',
      'gap_filled',
    ],
    required: true,
  })
  fuente: FuenteMeteorologicaNormalizada;

  @Prop({ type: Object, required: true })
  fuentePorVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;

  @Prop({ type: Object })
  estadoPorVariable?: Partial<
    Record<VariableMeteorologicaNormalizada, EstadoDatoMeteorologico>
  >;

  @Prop({ type: [String], default: [] })
  banderasCalidad: string[];

  @Prop({ min: 0, max: 100, required: true })
  completitudPct: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  estacionId?: string;

  @Prop()
  estacionNombre?: string;

  @Prop({ type: Object })
  coordenadas?: ICoordenadas;

  @Prop()
  altitudM?: number;

  @Prop({ type: Date, required: true })
  obtenidoEn: string;

  @Prop({ type: Object })
  contextosLote?: IObservacionMeteorologicaNormalizada['contextosLote'];

  creadoEn?: string;
  actualizadoEn?: string;
}

export type ObservacionMeteorologicaDocument = ObservacionMeteorologica &
  Document;

export const ObservacionMeteorologicaSchema = SchemaFactory.createForClass(
  ObservacionMeteorologica,
);

ObservacionMeteorologicaSchema.index(
  {
    idEstablecimiento: 1,
    timestamp: 1,
    granularidad: 1,
  },
  { unique: true, name: 'uniq_establishment_time_granularity' },
);
ObservacionMeteorologicaSchema.index({
  idEstablecimiento: 1,
  fechaLocal: 1,
  granularidad: 1,
});
ObservacionMeteorologicaSchema.index({ actualizadoEn: -1 });
