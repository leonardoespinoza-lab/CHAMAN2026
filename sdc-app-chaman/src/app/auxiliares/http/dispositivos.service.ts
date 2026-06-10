import { Injectable } from '@angular/core';
import { ICreateDispositivo, IDispositivo, IListado, IQueryParam, IUpdateDispositivo } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class DispositivoService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<IDispositivo>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/dispositivos`, { params });
  }

  public getById(id: string): Promise<IDispositivo> {
    return this.http.get(`/dispositivos/${id}`);
  }

  public create(dato: ICreateDispositivo): Promise<IDispositivo> {
    return this.http.post(`/dispositivos`, dato);
  }

  public update(id: string, dato: IUpdateDispositivo): Promise<IDispositivo> {
    return this.http.put(`/dispositivos/${id}`, dato);
  }

  public delete(id: string): Promise<void> {
    return this.http.delete(`/dispositivos/${id}`);
  }
}
