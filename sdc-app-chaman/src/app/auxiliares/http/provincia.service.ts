import { Injectable } from '@angular/core';
import { IListado, IProvincia, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class ProvinciaService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IProvincia>> {
    return this.http.get(`/provincias`, { params });
  }

  public listarPorId(id: string): Promise<IProvincia> {
    return this.http.get(`/provincias/${id}`);
  }
}
