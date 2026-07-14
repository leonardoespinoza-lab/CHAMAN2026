import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  IUbicacionAdministrativaEstablecimiento,
  TMotivoResolucionUbicacionEstablecimiento,
  TEstadoUbicacionLote,
} from 'modelos/src';

@Schema({
  collection: 'establishment_administrative_locations',
  timestamps: true,
})
export class EstablishmentAdministrativeLocation {
  @Prop({ required: true, index: true })
  establecimientoId: string;

  @Prop({ required: true })
  resolutionKey: string;

  @Prop({ required: true, index: true })
  geometryHash: string;

  @Prop({ required: true, index: true })
  snapshotId: string;

  @Prop({ required: true })
  sourceVersion: string;

  @Prop({ required: true })
  resolverVersion: string;

  @Prop({ required: true })
  estado: TEstadoUbicacionLote;

  @Prop({ required: true, type: Object })
  resultado: IUbicacionAdministrativaEstablecimiento;

  @Prop()
  motivo?: TMotivoResolucionUbicacionEstablecimiento;

  @Prop()
  fechaResolucion?: string;
}

export type EstablishmentAdministrativeLocationDocument =
  EstablishmentAdministrativeLocation & Document;

export const EstablishmentAdministrativeLocationSchema =
  SchemaFactory.createForClass(EstablishmentAdministrativeLocation);

EstablishmentAdministrativeLocationSchema.index(
  { resolutionKey: 1 },
  { unique: true, name: 'establishment_resolution_key' },
);
EstablishmentAdministrativeLocationSchema.index(
  {
    establecimientoId: 1,
    geometryHash: 1,
    sourceVersion: 1,
    resolverVersion: 1,
  },
  { name: 'establishment_geometry_source_resolver' },
);
