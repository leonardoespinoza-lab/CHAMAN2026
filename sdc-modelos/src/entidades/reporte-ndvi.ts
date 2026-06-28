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
  renderVersion?: string;
  renderStrategy?: string;
}

export interface IIndicesSatelitales {
  ndvi?: number;
  ndmi?: number;
  ndwi?: number;
  ndre?: number;
  savi?: number;
  evi?: number;
}

export interface IImagenesSatelitales {
  ndvi?: string;
  ndmi?: string;
  ndwi?: string;
  ndre?: string;
  savi?: string;
  evi?: string;
}

export interface IReporteNDVIExterno {
  idLote?: string;
  ndvi_url?: string;
  ndvi_promedio?: number;
  indices?: IIndicesSatelitales;
  imagenes?: IImagenesSatelitales;
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
  indices?: IIndicesSatelitales;
  imagenes?: IImagenesSatelitales;
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
