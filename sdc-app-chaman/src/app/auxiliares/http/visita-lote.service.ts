import { Injectable } from '@angular/core';
import {
  ICreateVisitaLote,
  IListado,
  IUpdateVisitaLote,
  IVisitaLote,
} from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({ providedIn: 'root' })
export class VisitaLoteService {
  constructor(private http: HttpService) {}

  public listarPorLote(idLote: string): Promise<IListado<IVisitaLote>> {
    return this.http.get(`/visitas-lote/lote/${idLote}`);
  }

  public obtener(id: string): Promise<IVisitaLote> {
    return this.http.get(`/visitas-lote/${id}`);
  }

  public crear(data: ICreateVisitaLote): Promise<IVisitaLote> {
    return this.http.post('/visitas-lote', data);
  }

  public actualizar(id: string, data: IUpdateVisitaLote): Promise<IVisitaLote> {
    return this.http.put(`/visitas-lote/${id}`, data);
  }

  public archivar(id: string): Promise<IVisitaLote> {
    return this.http.delete(`/visitas-lote/${id}`);
  }
}
