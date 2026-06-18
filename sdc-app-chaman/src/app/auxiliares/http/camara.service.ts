import { Injectable } from '@angular/core';
import { IAsignarCamaraLotes, ICamara, IFoto, ILote, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class CamaraService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<ICamara>> {
    return this.http.get(`/camaras`, { params });
  }

  public listarFotos(serialCamara: string, params?: IQueryParam): Promise<IListado<IFoto>> {
    return this.http.get(`/camaras/${encodeURIComponent(serialCamara)}/fotos`, { params });
  }

  public listarLotesDisponibles(): Promise<IListado<ILote>> {
    return this.http.get(`/camaras/lotes/disponibles`);
  }

  public asignarLotes(serialCamara: string, body: IAsignarCamaraLotes): Promise<IListado<ILote>> {
    return this.http.put(`/camaras/${encodeURIComponent(serialCamara)}/lotes`, body);
  }

  public capturar(serialCamara: string, canal = 1): Promise<IFoto> {
    return this.http.post(`/camaras/${encodeURIComponent(serialCamara)}/capturar`, {}, { params: { canal } });
  }
}
