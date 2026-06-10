import { Injectable } from '@angular/core';
import { IDepartamento, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class DepartamentoService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IDepartamento>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/departamentos`, { params });
  }

  public listarPorId(id: string): Promise<IDepartamento> {
    return this.http.get(`/departamentos/${id}`);
  }
}
