import { Injectable } from '@angular/core';
import { IAgroquimico, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class AgroquimicoService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<IAgroquimico>> {
    return this.http.get('/agroquimicos', { params });
  }
}
