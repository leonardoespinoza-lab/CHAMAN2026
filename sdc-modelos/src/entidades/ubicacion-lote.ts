import {
  IGeoJSONPoint,
  IGeoJSONPolygon,
  IGeoJSONMultiPolygon,
} from "../compartidos/geojson";

export type TEstadoUbicacionLote =
  | "missing_geometry"
  | "pending"
  | "processing"
  | "ready"
  | "partial"
  | "invalid_geometry"
  | "outside_supported_area"
  | "source_unavailable"
  | "failed";

export type TConfianzaUbicacionLote =
  | "alta"
  | "media"
  | "baja"
  | "sin_calcular";

export type TMotivoResolucionUbicacionLote =
  | "lot_created"
  | "geometry_added"
  | "geometry_changed"
  | "lot_split"
  | "lot_merged"
  | "source_version_changed"
  | "resolver_version_changed"
  | "partial_retry"
  | "failed_retry"
  | "backfill"
  | "manual_retry";

export interface IReferenciaGeoref {
  id?: string;
  nombre?: string;
  nombreCompleto?: string;
  categoria?: string;
  fuente?: string;
  provinciaId?: string;
  departamentoId?: string;
  gobiernoLocalId?: string;
}

export interface IInterseccionAdministrativaLote extends IReferenciaGeoref {
  recurso?: string;
  superficieInterseccionM2?: number;
  porcentajeLote?: number;
  dominante?: boolean;
}

export interface ILugarCercanoLote extends IReferenciaGeoref {
  distanciaMetros?: number;
  dentroDelLote?: boolean;
}

export interface IConflictoUbicacionManual {
  existe: boolean;
  departamentoManualId?: string;
  departamentoManual?: string;
  provinciaManual?: string;
  detalle?: string;
}

export interface IUbicacionAdministrativaLote {
  _id?: string;
  loteId: string;
  estado: TEstadoUbicacionLote;
  pais?: IReferenciaGeoref;
  provincia?: IReferenciaGeoref;
  nivelAdministrativo2?: IReferenciaGeoref & {
    tipo?: "Partido" | "Comuna" | "Departamento";
  };
  municipio?: IReferenciaGeoref | null;
  gobiernoLocal?: IReferenciaGeoref | null;
  localidadReferencia?: ILugarCercanoLote | null;
  localidadCensal?: IReferenciaGeoref | null;
  asentamientoCercano?: ILugarCercanoLote | null;
  jurisdiccionesSecundarias?: IInterseccionAdministrativaLote[];
  intersecciones?: IInterseccionAdministrativaLote[];
  geometriaNormalizada?: IGeoJSONPolygon | IGeoJSONMultiPolygon;
  puntoRepresentativo?: IGeoJSONPoint;
  superficieCalculadaM2?: number;
  coberturaPorcentaje?: number;
  geometryHash?: string;
  resolutionKey?: string;
  snapshotId?: string;
  sourceVersion?: string;
  resolverVersion?: string;
  fuente?: string;
  metodo?: string;
  confianza: TConfianzaUbicacionLote;
  razonesConfianza?: string[];
  advertencias?: string[];
  conflictoManual?: IConflictoUbicacionManual;
  motivo?: TMotivoResolucionUbicacionLote;
  intentos?: number;
  fechaSolicitud?: string;
  fechaInicio?: string;
  fechaResolucion?: string;
  fechaActualizacion?: string;
}

export interface IEventoResolucionUbicacionLote {
  loteId: string;
  motivo: TMotivoResolucionUbicacionLote;
  geometryHash?: string;
  requestedAt: string;
  requestedBy?: string;
}
