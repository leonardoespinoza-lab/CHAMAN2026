import { Injectable } from '@angular/core';
import { IEstacion, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class EstacionService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IEstacion>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/estacions`, { params });
  }

  public listarPorId(id: string): Promise<IEstacion> {
    return this.http.get(`/estacions/${id}`);
  }
}
