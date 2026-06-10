import { Injectable } from '@angular/core';
import { ICreateReporteNDVI, IListado, IQueryParam, IReporteNDVI, IUpdateReporteNDVI } from 'modelos/src';
import { HttpService } from './http.service';

export interface IUltimoReporteNDVI {
  _id: string;
  lastReporte: IReporteNDVI;
}

@Injectable({
  providedIn: 'root',
})
export class ReporteNDVIService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IReporteNDVI>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/reportendvis`, { params });
  }

  public crear(dato: ICreateReporteNDVI): Promise<IReporteNDVI> {
    return this.http.post(`/reportendvis`, dato);
  }

  public listarPorId(id: string): Promise<IReporteNDVI> {
    return this.http.get(`/reportendvis/${id}`);
  }

  public ultimoPorLote(): Promise<IUltimoReporteNDVI[]> {
    return this.http.get(`/reportendvis/lastByLote`);
  }

  public ultimoPorLotePorDistribuidor(): Promise<IUltimoReporteNDVI[]> {
    return this.http.get(`/reportendvis/lastByLoteByDistribuidor`);
  }

  public editar(id: string, dato: IUpdateReporteNDVI): Promise<IReporteNDVI> {
    return this.http.put(`/reportendvis/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/reportendvis/${id}`);
  }
}
