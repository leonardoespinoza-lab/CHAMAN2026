import { IGeoJSONPoint, IGeoJSONPolygon } from '../compartidos';
import { IDepartamento } from './departamento';
import { IDistribuidor } from './distribuidor';
import { IEstablecimiento } from './establecimiento';
import { ILote } from './lote';
import { IProductor } from './productor';
import { IQuimica } from './quimica';

export interface IMetadata {
  geojson: IGeoJSONPolygon;
  width: number;
  height: number;
  crs: string;
}

export interface IReporteNDVIExterno {
  idLote?: string;
  ndvi_url?: string;
  ndvi_promedio?: number;
  metadata?: IMetadata;
  fecha?: string;
  fechaImagen?: string;
  coleccion?: string;
}

export interface IReporteNDVI {
  _id?: string;
  //
  fechaCreacion?: string;
  fechaDelReporte?: string;
  fechaDeLaImagen?: string;
  ndviPromedio?: number;
  ndviUrl?: string;
  coleccion?: string; // Nombre de la coleccion satelital de la imagen
  // Esto sirve para ubicar la imagen en el mapa
  metadataImagen?: IMetadata;
  idLote?: string;
  // Cosas para completar en datos
  idEstablecimiento?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idDepartamento?: string;

  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  lote?: ILote;
  departamento?: IDepartamento;
}

type OmitirCreate =
  | '_id'
  | 'productor'
  | 'distribuidor'
  | 'quimica'
  | 'lote'
  | 'establecimiento'
  | 'departamento';

export interface ICreateReporteNDVI
  extends Omit<Partial<IReporteNDVI>, OmitirCreate> {}

type OmitirUpdate =
  | '_id'
  | 'productor'
  | 'distribuidor'
  | 'quimica'
  | 'lote'
  | 'establecimiento'
  | 'departamento';

export interface IUpdateReporteNDVI
  extends Omit<Partial<IReporteNDVI>, OmitirUpdate> {}
