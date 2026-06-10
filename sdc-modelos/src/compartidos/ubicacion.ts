import { ICoordenadas } from './coordenadas';
import { IGeoJSONPolygon } from './geojson';

export interface IUbicacion {
  poligono?: ICoordenadas[];
  geojson?: IGeoJSONPolygon;
  centro?: ICoordenadas;
  nombre?: string;
  superficie?: number;
}
