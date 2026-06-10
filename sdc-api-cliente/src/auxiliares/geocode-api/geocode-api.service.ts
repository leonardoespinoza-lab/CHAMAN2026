import { Injectable } from '@nestjs/common';
import { DireccionV2, ICoordenadas, IGeoJSONPoint } from 'modelos/src';
import { NodeGeocodeService } from './node-geocoder/node-geocoder.service';

@Injectable()
export class GeocodesService {
  constructor(private nodeGeoCode: NodeGeocodeService) {}

  async direcciones(
    text: string,
    pais?: string,
    coordenadas?: ICoordenadas,
  ): Promise<{ resultados: string[] }> {
    const resultados = await this.nodeGeoCode.getPredictions(
      text,
      pais,
      coordenadas,
    );
    return { resultados };
  }

  async geoCode(direccion: string): Promise<ICoordenadas> {
    return await this.nodeGeoCode.geocode(direccion);
  }

  async reverse(geojson: IGeoJSONPoint): Promise<DireccionV2> {
    const coordenadas: ICoordenadas = {
      lat: geojson.coordinates[1],
      lng: geojson.coordinates[0],
    };
    return await this.nodeGeoCode.reverse(coordenadas);
  }
}
