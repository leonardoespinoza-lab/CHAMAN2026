import { Injectable } from '@angular/core';
import { IPrediccion, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class PrediccionService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IPrediccion>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/prediccions`, { params });
  }

  public listarPorId(id: string): Promise<IPrediccion> {
    return this.http.get(`/prediccions/${id}`);
  }

  public async exportar(params?: IQueryParam, filename = 'prediccion.xlsx'): Promise<void> {
    // let params = HelperService.getQueryParams(queryParams);
    const options = {
      params,
    };
    await this.http.getFile(`/prediccions/export`, options, filename);
  }
}
