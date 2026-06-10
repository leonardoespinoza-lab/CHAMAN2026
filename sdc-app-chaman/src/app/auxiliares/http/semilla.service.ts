import { Injectable } from '@angular/core';
import { ISemilla, IListado, IQueryParam, ICreateSemilla, IUpdateSemilla } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class SemillaService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<ISemilla>> {
    return this.http.get(`/semillas`, { params });
  }

  public listarPorId(id: string): Promise<ISemilla> {
    return this.http.get(`/semillas/${id}`);
  }

  public crear(dato: ICreateSemilla): Promise<ISemilla> {
    return this.http.post(`/semillas`, dato);
  }

  public editar(id: string, dato: IUpdateSemilla): Promise<ISemilla> {
    return this.http.put(`/semillas/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/semillas/${id}`);
  }
}
