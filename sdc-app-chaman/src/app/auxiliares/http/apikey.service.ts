import { Injectable } from '@angular/core';
import { IApikey, ICreateApikey, IListado, IQueryParam, IUpdateApikey } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class ApikeyService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<IApikey>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/apikeys`, { params });
  }

  public getById(id: string): Promise<IApikey> {
    return this.http.get(`/apikeys/${id}`);
  }

  public create(dato: ICreateApikey): Promise<IApikey> {
    return this.http.post(`/apikeys`, dato);
  }

  public update(id: string, dato: IUpdateApikey): Promise<IApikey> {
    return this.http.put(`/apikeys/${id}`, dato);
  }

  public delete(id: string): Promise<void> {
    return this.http.delete(`/apikeys/${id}`);
  }
}
