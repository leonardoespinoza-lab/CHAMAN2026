import { Injectable } from '@angular/core';
import { IListado, IQueryParam, IFertilizante } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class FertilizanteService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<IFertilizante>> {
    // const params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/fertilizantes`, { params });
  }
}
