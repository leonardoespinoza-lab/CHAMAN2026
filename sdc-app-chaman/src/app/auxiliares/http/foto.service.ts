import { Injectable } from '@angular/core';
import { IFoto, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class FotoService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IFoto>> {
    return this.http.get(`/fotos`, { params });
  }

  public listarPorLote(idLote: string): Promise<IListado<IFoto>> {
    return this.http.get(`/fotos/lote/${idLote}`);
  }

  public getImagen(url: string): Promise<any> {
    return this.http.get(`/fotos/imagen`, { params: { url } });
  }

  public listarPorId(id: string): Promise<IFoto> {
    return this.http.get(`/fotos/${id}`);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/fotos/${id}`);
  }
}
