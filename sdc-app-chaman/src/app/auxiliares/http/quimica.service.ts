import { Injectable } from '@angular/core';
import { ICreateQuimica, IListado, IQueryParam, IQuimica, IUpdateQuimica } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class QuimicaService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IQuimica>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/quimicas`, { params });
  }

  public listarPorId(id: string): Promise<IQuimica> {
    return this.http.get(`/quimicas/${id}`);
  }

  public crear(dato: ICreateQuimica): Promise<IQuimica> {
    return this.http.post(`/quimicas`, dato);
  }

  public editar(id: string, dato: IUpdateQuimica): Promise<IQuimica> {
    return this.http.put(`/quimicas/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/quimicas/${id}`);
  }
}
