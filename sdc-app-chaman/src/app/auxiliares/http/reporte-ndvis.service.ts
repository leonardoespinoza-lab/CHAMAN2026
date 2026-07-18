import { Injectable } from '@angular/core';
import { IListado, IQueryParam, IReporteNDVI } from 'modelos/src';
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

  public listarPorId(id: string): Promise<IReporteNDVI> {
    return this.http.get(`/reportendvis/${id}`);
  }

  public ultimoPorLote(): Promise<IUltimoReporteNDVI[]> {
    return this.http.get(`/reportendvis/lastByLote`);
  }

  public ultimoPorLotePorDistribuidor(): Promise<IUltimoReporteNDVI[]> {
    return this.http.get(`/reportendvis/lastByLoteByDistribuidor`);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/reportendvis/${id}`);
  }
}
