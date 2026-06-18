import { Injectable } from '@angular/core';
import { ILicenciaPorEntidad, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class LicenciaPorEntidadService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<ILicenciaPorEntidad>> {
    return this.http.get(`/licenciaporentidads`, { params });
  }
}
