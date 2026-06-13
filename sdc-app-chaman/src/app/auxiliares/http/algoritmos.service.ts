import { Injectable } from '@angular/core';
import { HttpService } from './http.service';

export interface AlgoritmoCatalogo {
  id: string;
  nombre: string;
  estado: 'operativo' | 'auditable' | 'configurable';
  descripcion: string;
  inputs: string[];
  outputs: string[];
}

export interface HuellaHidricaSimulacion {
  huella: any;
  inputs: any;
  parciales: any;
  trazas: string[];
}

@Injectable({
  providedIn: 'root',
})
export class AlgoritmosHttpService {
  constructor(private http: HttpService) {}

  public catalogo(): Promise<AlgoritmoCatalogo[]> {
    return this.http.get('/algoritmos');
  }

  public parametrosHuella(): Promise<any> {
    return this.http.get('/algoritmos/huella-hidrica/parametros');
  }

  public simularHuella(body: any): Promise<HuellaHidricaSimulacion> {
    return this.http.post('/algoritmos/huella-hidrica/simular', body);
  }
}
