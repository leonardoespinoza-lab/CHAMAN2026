import { Injectable } from '@angular/core';
import { IAlerta, ICreateAlerta, IEstadoAlerta, IListado, IQueryParam, IUpdateAlerta } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class AlertaService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IAlerta>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/alertas`, { params });
  }

  public crear(dato: ICreateAlerta): Promise<IAlerta> {
    return this.http.post(`/alertas`, dato);
  }

  public listarPorId(id: string): Promise<IAlerta> {
    return this.http.get(`/alertas/${id}`);
  }

  public editar(id: string, dato: IUpdateAlerta): Promise<IAlerta> {
    return this.http.put(`/alertas/${id}`, dato);
  }

  public cambiarEstado(id: string, dato: { estado: IEstadoAlerta; activa: boolean }): Promise<IAlerta> {
    return this.http.put(`/alertas/cambiarEstado/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/alertas/${id}`);
  }
}
