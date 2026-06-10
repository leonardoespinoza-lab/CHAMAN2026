import { Injectable } from '@angular/core';
import { IFenologia, IListado, IQueryParam, ICreateFenologia, IUpdateFenologia } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class FenologiaService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IFenologia>> {    
    return this.http.get(`/cronos`, { params });
  }

  public listarPorId(id: string): Promise<IFenologia> {
    return this.http.get(`/cronos/${id}`);
  }

  public crear(dato: ICreateFenologia): Promise<IFenologia> {
    return this.http.post(`/cronos`, dato);
  }

  public editar(id: string, dato: IUpdateFenologia): Promise<IFenologia> {
    return this.http.put(`/cronos/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/cronos/${id}`);
  }
}
