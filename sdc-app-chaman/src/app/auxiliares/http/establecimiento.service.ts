import { Injectable } from '@angular/core';
import { IEstablecimiento, ICreateEstablecimiento, IListado, IQueryParam, IUpdateEstablecimiento } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class EstablecimientoService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IEstablecimiento>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/establecimientos`, { params });
  }

  public crear(dato: ICreateEstablecimiento): Promise<IEstablecimiento> {
    return this.http.post(`/establecimientos`, dato);
  }

  public listarPorId(id: string): Promise<IEstablecimiento> {
    return this.http.get(`/establecimientos/${id}`);
  }

  public editar(id: string, dato: IUpdateEstablecimiento): Promise<IEstablecimiento> {
    return this.http.put(`/establecimientos/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/establecimientos/${id}`);
  }
}
