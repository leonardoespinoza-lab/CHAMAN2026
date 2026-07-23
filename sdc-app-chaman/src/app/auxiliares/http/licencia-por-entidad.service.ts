import { Injectable } from '@angular/core';
import {
  IAsignarLicenciaEntidad,
  IEstadoLicenciaEntidad,
  ILicenciaPorEntidad,
  IListado,
  IQueryParam,
  TipoEntidadLicencia,
} from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class LicenciaPorEntidadService {
  constructor(private http: HttpService) {}

  public getFiltered(params?: IQueryParam): Promise<IListado<ILicenciaPorEntidad>> {
    return this.http.get(`/licenciaporentidads`, { params });
  }

  public actual(): Promise<IEstadoLicenciaEntidad> {
    return this.http.get('/licenciaporentidads/actual');
  }

  public getEstadoEntidad(tipo: TipoEntidadLicencia, id: string): Promise<IEstadoLicenciaEntidad> {
    return this.http.get(`/licenciaporentidads/entidad/${tipo}/${id}`);
  }

  public asignar(
    tipo: TipoEntidadLicencia,
    id: string,
    data: IAsignarLicenciaEntidad,
  ): Promise<IEstadoLicenciaEntidad> {
    return this.http.put(`/licenciaporentidads/entidad/${tipo}/${id}`, data);
  }
}
