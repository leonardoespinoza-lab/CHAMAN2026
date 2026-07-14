import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  IConflictoUbicacionManual,
  IInterseccionAdministrativaLote,
  ILugarCercanoLote,
  IReferenciaGeoref,
  TMotivoResolucionUbicacionLote,
  TConfianzaUbicacionLote,
  TEstadoUbicacionLote,
} from 'modelos/src';

@Schema({ collection: 'lot_administrative_locations', timestamps: true })
export class LotAdministrativeLocation {
  @Prop({ required: true, index: true })
  loteId: string;

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

  @Prop({ required: true, default: false, index: true })
  isCurrent: boolean;

  @Prop({ type: Object })
  pais?: IReferenciaGeoref;

  @Prop({ type: Object })
  provincia?: IReferenciaGeoref;

  @Prop({ type: Object })
  nivelAdministrativo2?: IReferenciaGeoref & {
    tipo?: 'Partido' | 'Comuna' | 'Departamento';
  };

  @Prop({ type: Object })
  municipio?: IReferenciaGeoref | null;

  @Prop({ type: Object })
  gobiernoLocal?: IReferenciaGeoref | null;

  @Prop({ type: Object })
  localidadReferencia?: ILugarCercanoLote | null;

  @Prop({ type: Object })
  localidadCensal?: IReferenciaGeoref | null;

  @Prop({ type: Object })
  asentamientoCercano?: ILugarCercanoLote | null;

  @Prop({ type: [Object], default: [] })
  jurisdiccionesSecundarias?: IInterseccionAdministrativaLote[];

  @Prop({ type: Object })
  geometriaNormalizada?: any;

  @Prop({ type: Object })
  puntoRepresentativo?: any;

  @Prop()
  superficieCalculadaM2?: number;

  @Prop()
  coberturaPorcentaje?: number;

  @Prop({ default: 'GeoRef Argentina' })
  fuente?: string;

  @Prop()
  metodo?: string;

  @Prop({ required: true, default: 'sin_calcular' })
  confianza: TConfianzaUbicacionLote;

  @Prop({ type: [String], default: [] })
  razonesConfianza?: string[];

  @Prop({ type: [String], default: [] })
  advertencias?: string[];

  @Prop({ type: Object })
  conflictoManual?: IConflictoUbicacionManual;

  @Prop()
  motivo?: TMotivoResolucionUbicacionLote;

  @Prop({ default: 0 })
  intentos?: number;

  @Prop()
  fechaSolicitud?: string;

  @Prop()
  fechaInicio?: string;

  @Prop()
  fechaResolucion?: string;

  @Prop()
  fechaActualizacion?: string;

  @Prop()
  error?: string;
}

export type LotAdministrativeLocationDocument = LotAdministrativeLocation &
  Document;
export const LotAdministrativeLocationSchema = SchemaFactory.createForClass(
  LotAdministrativeLocation,
);

LotAdministrativeLocationSchema.index(
  { resolutionKey: 1 },
  { unique: true, name: 'resolution_key' },
);
LotAdministrativeLocationSchema.index(
  { loteId: 1, isCurrent: 1 },
  { name: 'lot_current_location' },
);
LotAdministrativeLocationSchema.index(
  { loteId: 1, geometryHash: 1, sourceVersion: 1, resolverVersion: 1 },
  { name: 'lot_geometry_source_resolver' },
);

@Schema({ collection: 'lot_administrative_intersections', timestamps: true })
export class LotAdministrativeIntersection {
  @Prop({ required: true, index: true })
  resolutionKey: string;

  @Prop({ required: true, index: true })
  loteId: string;

  @Prop({ required: true })
  recurso: string;

  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true })
  nombre: string;

  @Prop()
  categoria?: string;

  @Prop()
  fuente?: string;

  @Prop()
  superficieInterseccionM2?: number;

  @Prop()
  porcentajeLote?: number;

  @Prop({ default: false })
  dominante?: boolean;
}

export type LotAdministrativeIntersectionDocument =
  LotAdministrativeIntersection & Document;
export const LotAdministrativeIntersectionSchema = SchemaFactory.createForClass(
  LotAdministrativeIntersection,
);
LotAdministrativeIntersectionSchema.index(
  { resolutionKey: 1, recurso: 1, entityId: 1 },
  { unique: true, name: 'resolution_resource_entity' },
);
LotAdministrativeIntersectionSchema.index(
  { loteId: 1, recurso: 1 },
  { name: 'lot_intersection_resource' },
);
