import { Injectable } from '@angular/core';
import { ISiembra, ICreateSiembra, IListado, IPrediccion, IQueryParam, IUpdateSiembra } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class SiembraService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<ISiembra>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/siembras`, { params });
  }

  public crear(dato: ICreateSiembra): Promise<ISiembra> {
    return this.http.post(`/siembras`, dato);
  }

  public listarPorId(id: string): Promise<ISiembra> {
    return this.http.get(`/siembras/${id}`);
  }

  public generarPrediccionEnfermedades(id: string): Promise<IPrediccion[]> {
    return this.http.post(`/siembras/${id}/prediccion-enfermedades`, {});
  }

  public editar(id: string, dato: IUpdateSiembra): Promise<ISiembra> {
    return this.http.put(`/siembras/${id}`, dato);
  }

  public cosechar(id: string, dato: IUpdateSiembra): Promise<ISiembra> {
    return this.http.put(`/siembras/cosechar/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/siembras/${id}`);
  }
}
