import { Injectable } from '@angular/core';
import { ICreateUsuario, IListado, IQueryParam, IUpdateUsuario, IUsuario } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class UsuarioService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IUsuario>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/usuarios`, { params });
  }

  public crear(dato: ICreateUsuario): Promise<IUsuario> {
    return this.http.post(`/usuarios`, dato);
  }

  public listarPorId(id: string): Promise<IUsuario> {
    return this.http.get(`/usuarios/${id}`);
  }

  public listarPropio(): Promise<IUsuario> {
    return this.http.get(`/usuarios/propio`);
  }

  public editar(id: string, dato: IUpdateUsuario): Promise<IUsuario> {
    return this.http.put(`/usuarios/${id}`, dato);
  }

  public cambiarPassword(dato: { oldPassword: string; newPassword: string }): Promise<IUsuario> {
    return this.http.put(`/usuarios/password`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/usuarios/${id}`);
  }
}
