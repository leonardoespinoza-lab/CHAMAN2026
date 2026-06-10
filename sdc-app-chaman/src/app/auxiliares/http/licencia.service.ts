import { Injectable } from '@angular/core';
import { ICreateLicencia, ILicencia, IListado, IQueryParam, IUpdateLicencia } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class LicenciaService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<ILicencia>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/licencias`, { params });
  }

  public getById(id: string): Promise<ILicencia> {
    return this.http.get(`/licencias/${id}`);
  }

  public create(dato: ICreateLicencia): Promise<ILicencia> {
    return this.http.post(`/licencias`, dato);
  }

  public update(id: string, dato: IUpdateLicencia): Promise<ILicencia> {
    return this.http.put(`/licencias/${id}`, dato);
  }

  public delete(id: string): Promise<void> {
    return this.http.delete(`/licencias/${id}`);
  }
}
