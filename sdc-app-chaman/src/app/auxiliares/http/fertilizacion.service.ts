import { Injectable } from '@angular/core';
import { IFertilizacion, ICreateFertilizacion, IListado, IQueryParam, IUpdateFertilizacion } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class FertilizacionService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<IFertilizacion>> {
    // const params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/fertilizacions`, { params });
  }

  public crear(dato: ICreateFertilizacion): Promise<IFertilizacion> {
    return this.http.post(`/fertilizacions`, dato);
  }

  public listarPorId(id: string): Promise<IFertilizacion> {
    return this.http.get(`/fertilizacions/${id}`);
  }

  public listarPorIdSiembra(idSiembra: string): Promise<IFertilizacion> {
    return this.http.get(`/fertilizacions/idSiembra/${idSiembra}`);
  }

  public editar(id: string, dato: IUpdateFertilizacion): Promise<IFertilizacion> {
    return this.http.put(`/fertilizacions/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/fertilizacions/${id}`);
  }
}
