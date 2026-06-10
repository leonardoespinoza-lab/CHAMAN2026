import { Injectable } from '@angular/core';
import { IDistribuidor, ICreateDistribuidor, IListado, IQueryParam, IUpdateDistribuidor } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class DistribuidorService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IDistribuidor>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/distribuidors`, { params });
  }

  public crear(dato: ICreateDistribuidor): Promise<IDistribuidor> {
    return this.http.post(`/distribuidors`, dato);
  }

  public listarPorId(id: string): Promise<IDistribuidor> {
    return this.http.get(`/distribuidors/${id}`);
  }

  public editar(id: string, dato: IUpdateDistribuidor): Promise<IDistribuidor> {
    return this.http.put(`/distribuidors/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/distribuidors/${id}`);
  }
}
