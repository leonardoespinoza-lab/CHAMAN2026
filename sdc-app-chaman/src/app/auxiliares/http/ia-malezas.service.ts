import { Injectable } from '@angular/core';
import { IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

export type IaMalezaEstado = 'pendiente' | 'procesando' | 'completado' | 'error';

export interface IaMalezaDetection {
  class: string;
  confidence: number;
  label?: string;
  group?: string;
  agronomicNote?: string;
  recommendation?: string;
  severity?: 'informativo' | 'bajo' | 'medio' | 'alto';
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface IaMalezaAnalisis {
  _id?: string;
  ensayoId?: string;
  loteId?: string;
  loteNombre?: string;
  cultivo?: string;
  campania?: string;
  fecha?: string;
  tipoAnalisis?: string;
  estado?: IaMalezaEstado;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  originalImageUrl?: string;
  processedImageUrl?: string;
  sourceType?: 'upload' | 'chaman_camera';
  sourcePhotoId?: string;
  cameraSerial?: string;
  cameraUrl?: string;
  modelVersion?: string;
  detections?: IaMalezaDetection[];
  summary?: Record<string, any>;
  resultJson?: Record<string, any>;
  error?: string;
  analyzedAt?: string;
  experimental?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IaMalezasUploadPayload {
  ensayoId?: string;
  loteId?: string;
  loteNombre?: string;
  cultivo?: string;
  campania?: string;
  fecha?: string;
  tipoAnalisis?: string;
}

@Injectable({ providedIn: 'root' })
export class IaMalezasService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IaMalezaAnalisis>> {
    return this.http.get<IListado<IaMalezaAnalisis>>('/ia-malezas', { params: params as any });
  }

  public health(): Promise<Record<string, any>> {
    return this.http.get<Record<string, any>>('/ia-malezas/health');
  }

  public subir(files: File[], payload: IaMalezasUploadPayload): Promise<IaMalezaAnalisis[]> {
    const form = new FormData();
    files.forEach((file) => form.append('images', file, file.name));
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    });
    return this.http.post<IaMalezaAnalisis[]>('/ia-malezas/upload', form);
  }

  public analizar(id: string): Promise<IaMalezaAnalisis> {
    return this.http.post<IaMalezaAnalisis>(`/ia-malezas/${id}/analyze`, {});
  }

  public importarFoto(payload: IaMalezasUploadPayload & { fotoId: string }): Promise<IaMalezaAnalisis> {
    return this.http.post<IaMalezaAnalisis>('/ia-malezas/importar-foto', payload);
  }

  public imagen(id: string, tipo: 'original' | 'procesada'): Promise<Blob> {
    return this.http.get<Blob>(`/ia-malezas/${id}/imagen/${tipo}`, {
      responseType: 'blob' as any,
    });
  }
}
