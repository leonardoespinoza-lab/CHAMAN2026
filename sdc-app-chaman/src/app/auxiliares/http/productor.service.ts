import { Injectable } from '@angular/core';
import { IProductor, ICreateProductor, IListado, IQueryParam, IUpdateProductor } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class ProductorsService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IProductor>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/productors`, { params });
  }

  public crear(dato: ICreateProductor): Promise<IProductor> {
    return this.http.post(`/productors`, dato);
  }

  public listarPorId(id: string): Promise<IProductor> {
    return this.http.get(`/productors/${id}`);
  }

  public editar(id: string, dato: IUpdateProductor): Promise<IProductor> {
    return this.http.put(`/productors/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/productors/${id}`);
  }
}
