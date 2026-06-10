import { Injectable } from '@angular/core';
import { ICrono, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class CronoService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<ICrono>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/cronos`, { params });
  }

  public listarPorId(id: string): Promise<ICrono> {
    return this.http.get(`/cronos/${id}`);
  }
}
