import { Injectable } from '@angular/core';
import { IListado, IMaleza, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class MalezaService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<IMaleza>> {
    return this.http.get('/malezas', { params });
  }
}
