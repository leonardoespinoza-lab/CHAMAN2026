import { Injectable } from '@angular/core';
import { DireccionV2, ICoordenadas, IGeoJSONPoint, IZonaGeografica } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class GeoNodeService {
  constructor(private http: HttpService) {}

  public direcciones(dato: {
    text: string;
    pais?: string;
    coordenadas?: ICoordenadas;
  }): Promise<{ resultados: string[] }> {
    return this.http.post(`/geocode/direcciones`, dato);
  }

  public geocode(dato: { text: string }): Promise<ICoordenadas> {
    return this.http.post(`/geocode/geocode`, dato);
  }

  public zonas(dato: { text: string; provincia?: string }): Promise<{ resultados: IZonaGeografica[] }> {
    return this.http.post(`/geocode/zonas`, dato);
  }

  public provincias(): Promise<{ resultados: IZonaGeografica[] }> {
    return this.http.post(`/geocode/provincias`, {});
  }

  public reverse(dato: { geojson: IGeoJSONPoint }): Promise<DireccionV2> {
    return this.http.post(`/geocode/reverse`, dato);
  }
}
