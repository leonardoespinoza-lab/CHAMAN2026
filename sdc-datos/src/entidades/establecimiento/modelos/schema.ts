import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IEstablecimiento,
  IUbicacion,
  IQuimica,
  IDistribuidor,
  IProductor,
  IEstacion,
  IPronosticoEstacionMeteorologica,
  IClimaEstacionMeteorologica,
  DireccionV2,
  IUbicacionAdministrativaEstablecimiento,
  IUbicacionAdministrativaLegadaEstablecimiento,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Quimica } from '../../quimica/modelos/schema';
import { Distribuidor } from '../../distribuidor/modelos/schema';
import { Productor } from '../../productor/modelos/schema';
import { Estacion } from '../../estacion/schema';

@Schema()
export class Establecimiento implements Exactly<
  IEstablecimiento,
  Establecimiento
> {
  _id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, index: true })
  idTenant?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idAsesorPropietario?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idQuimica?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idDistribuidor?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idProductor: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ type: [Object] })
  ubicacion?: IUbicacion[];

  @Prop({ type: Object })
  ubicacionAdministrativa?: DireccionV2;

  @Prop({ type: Object })
  ubicacionAdministrativaLegada?: IUbicacionAdministrativaLegadaEstablecimiento;

  @Prop({ type: Object })
  ubicacionOficial?: IUbicacionAdministrativaEstablecimiento;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  idEstacionMeteorologica?: string;

  @Prop({ type: String, enum: ['FieldClimate', 'Open-Meteo', 'Chaman'] })
  fuenteClimaPreferida?: 'FieldClimate' | 'Open-Meteo' | 'Chaman';

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ type: Boolean, default: false, index: true })
  archivado?: boolean;

  @Prop({ type: Date })
  fechaArchivado?: string;

  @Prop({ type: String })
  archivadoPor?: string;

  @Prop({ type: String })
  motivoArchivado?: string;

  @Prop({ type: Object })
  prediccionClimatica?: {
    fecha?: string;
    pronosticos?: IPronosticoEstacionMeteorologica[];
  };

  @Prop({ type: Object })
  climaActual?: {
    fecha?: string;
    pronosticos?: IClimaEstacionMeteorologica;
  };

  // Populate
  quimica?: IQuimica;

  distribuidor?: IDistribuidor;

  productor?: IProductor;

  estacionMeteorologica?: IEstacion;
}

export type EstablecimientoDocument = Establecimiento & Document;

export const EstablecimientoSchema =
  SchemaFactory.createForClass(Establecimiento);

EstablecimientoSchema.set('toJSON', { virtuals: true, getters: true });

EstablecimientoSchema.index(
  { nombre: 1, idProductor: 1 },
  {
    name: 'uniq_establecimiento_productor_nombre_activo_v2',
    unique: true,
    partialFilterExpression: { archivado: false },
  },
);
EstablecimientoSchema.index({ idAsesorPropietario: 1 });

EstablecimientoSchema.virtual('quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idQuimica',
  ref: Quimica.name,
});

EstablecimientoSchema.virtual('distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDistribuidor',
  ref: Distribuidor.name,
});

EstablecimientoSchema.virtual('productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'idProductor',
  ref: Productor.name,
});

EstablecimientoSchema.virtual('estacionMeteorologica', {
  foreignField: '_id',
  justOne: true,
  localField: 'idEstacionMeteorologica',
  ref: Estacion.name,
});
