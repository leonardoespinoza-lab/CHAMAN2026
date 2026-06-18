export type TSueloIntaGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: any[];
};

export interface ISueloInta {
  _id?: string;
  ogcFid?: number;
  fuente?: string;
  provincia?: string;
  carta?: number;
  unidadCartografica?: string;
  tipoUnidad?: string;
  geometry?: TSueloIntaGeometry;
  properties?: Record<string, unknown>;
  fechaImportacion?: string;
}

type OmitirCreate = '_id';
export interface ICreateSueloInta
  extends Omit<Partial<ISueloInta>, OmitirCreate> {}

type OmitirUpdate = '_id';
export interface IUpdateSueloInta
  extends Omit<Partial<ISueloInta>, OmitirUpdate> {}
