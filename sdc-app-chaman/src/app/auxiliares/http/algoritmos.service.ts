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

export interface CatalogoReadinessCultivo {
  cultivo: string;
  ok: boolean;
  semillas: number;
  semillasConResistencia?: number;
  semillasConCrono?: number;
  enfermedades: number;
  enfermedadesMotor?: number;
  fuenteEnfermedades?: string;
  cronos: number;
  malezas: number;
  calidadCatalogo?: 'completa' | 'parcial' | 'incompleta';
  observaciones?: string[];
  faltantes: string[];
}

export interface CatalogosReadiness {
  ok: boolean;
  fecha: string;
  minimos: Record<string, unknown>;
  cultivos: CatalogoReadinessCultivo[];
}

export interface HuellaHidricaSimulacion {
  huella: any;
  inputs: any;
  parciales: any;
  calidad?: any;
  metodologia?: any;
  trazas: string[];
}

export interface AlgoritmoSimulacion {
  motor: string;
  modo?: string;
  resumen: string;
  metricas: Record<string, any>;
  serie: Array<{ label: string; value: number }>;
  trazas: string[];
  enfermedades?: Array<Record<string, any>>;
}

@Injectable({
  providedIn: 'root',
})
export class AlgoritmosHttpService {
  constructor(private http: HttpService) {}

  public catalogo(): Promise<AlgoritmoCatalogo[]> {
    return this.http.get('/algoritmos');
  }

  public catalogosReadiness(): Promise<CatalogosReadiness> {
    return this.http.get('/algoritmos/catalogos/readiness');
  }

  public parametrosHuella(): Promise<any> {
    return this.http.get('/algoritmos/huella-hidrica/parametros');
  }

  public simularHuella(body: any): Promise<HuellaHidricaSimulacion> {
    return this.http.post('/algoritmos/huella-hidrica/simular', body);
  }

  public simularEnfermedades(body: any): Promise<AlgoritmoSimulacion> {
    return this.http.post('/algoritmos/enfermedades/simular', body);
  }

  public simularRiego(body: any): Promise<AlgoritmoSimulacion> {
    return this.http.post('/algoritmos/riego/simular', body);
  }

  public simularMalezas(body: any): Promise<AlgoritmoSimulacion> {
    return this.http.post('/algoritmos/malezas/simular', body);
  }
}
