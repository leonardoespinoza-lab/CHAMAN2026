import { Injectable } from '@angular/core';
import { IPrincipioActivo, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class PrincipioActivoService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<IPrincipioActivo>> {
    // const params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/principioactivos`, { params });
  }
}
