import { Injectable } from '@angular/core';
import { ILote, ICreateLote, IListado, IQueryParam, IUpdateLote } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class LoteService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<ILote>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/lotes`, { params });
  }

  public crear(dato: ICreateLote): Promise<ILote> {
    return this.http.post(`/lotes`, dato);
  }

  public listarPorId(id: string): Promise<ILote> {
    return this.http.get(`/lotes/${id}`);
  }

  public certificado(id: string, filename: string): Promise<void> {
    return this.http.getFile(`/lotes/${id}/certificado`, {}, filename);
  }

  public sueloInta(lat: number, lng: number): Promise<any> {
    return this.http.get(`/lotes/suelo-inta`, { params: { lat, lng } });
  }

  public generarNdvi(id: string): Promise<{
    encolado: boolean;
    mensaje: string;
    ultimaFechaImagen?: string | null;
  }> {
    return this.http.post(`/lotes/${id}/ndvi`, {});
  }

  public editar(id: string, dato: IUpdateLote): Promise<ILote> {
    return this.http.put(`/lotes/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/lotes/${id}`);
  }
}
