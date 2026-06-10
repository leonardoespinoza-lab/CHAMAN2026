import { Injectable } from '@angular/core';
import { IFumigacion, ICreateFumigacion, IListado, IQueryParam, IUpdateFumigacion } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class FumigacionService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IFumigacion>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/fumigacions`, { params });
  }

  public crear(dato: ICreateFumigacion): Promise<IFumigacion> {
    return this.http.post(`/fumigacions`, dato);
  }

  public listarPorId(id: string): Promise<IFumigacion> {
    return this.http.get(`/fumigacions/${id}`);
  }

  public listarPorIdSiembra(idSiembra: string): Promise<IFumigacion> {
    return this.http.get(`/fumigacions/idSiembra/${idSiembra}`);
  }

  public editar(id: string, dato: IUpdateFumigacion): Promise<IFumigacion> {
    return this.http.put(`/fumigacions/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/fumigacions/${id}`);
  }
}
