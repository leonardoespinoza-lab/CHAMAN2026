import { ICoordenadas } from 'modelos/src';

export class HelperService {
  static filtroToObject(filtro: string) {
    let filter: any;
    try {
      filter = JSON.parse(filtro);
    } catch (error) {
      filter = {};
    }
    return filter;
  }
  static polyToGeojson(p: ICoordenadas[]) {
    const geojson: [number, number][] = [];
    for (const punto of p) {
      geojson.push([punto.lng, punto.lat]);
    }
    geojson.push(geojson[0]);
    return geojson;
  }

  static coorToGeoJson(c: ICoordenadas): [number, number] {
    return [c.lng, c.lat];
  }
}
