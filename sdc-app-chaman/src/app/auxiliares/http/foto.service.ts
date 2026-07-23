import { Injectable } from '@angular/core';
import { IFoto, IListado, IQueryParam, IUpdateFoto } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class FotoService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IFoto>> {
    return this.http.get(`/fotos`, { params });
  }

  public listarPorLote(idLote: string): Promise<IListado<IFoto>> {
    return this.http.get(`/fotos/lote/${idLote}`);
  }

  public getImagen(id: string): Promise<Blob> {
    return this.http.get<Blob>(`/fotos/imagen`, {
      params: { id },
      responseType: 'blob',
    });
  }

  public listarPorId(id: string): Promise<IFoto> {
    return this.http.get(`/fotos/${id}`);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/fotos/${id}`);
  }

  public subirCampo(
    files: File[],
    data: {
      idLote: string;
      idVisita?: string;
      fechaCaptura?: string;
      titulo?: string;
      descripcion?: string;
      etiquetas?: string[];
      latitud?: number;
      longitud?: number;
      precisionMetros?: number;
    }
  ): Promise<IFoto[]> {
    const form = new FormData();
    files.forEach((file) => form.append('images', file, file.name));
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      form.append(key, Array.isArray(value) ? value.join(',') : String(value));
    });
    return this.http.post<IFoto[]>('/fotos/campo/upload', form);
  }

  public actualizar(id: string, data: IUpdateFoto): Promise<IFoto> {
    return this.http.put<IFoto>(`/fotos/${id}`, data);
  }
}
