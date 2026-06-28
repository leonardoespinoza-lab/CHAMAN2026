import { Injectable } from '@angular/core';
import {
  ISiembra,
  ICreateSiembra,
  IListado,
  IPrediccion,
  IQueryParam,
  IResultadoPrediccionMalezas,
  IUpdateSiembra,
} from 'modelos/src';
import { HttpService } from './http.service';

export interface HuellaHidricaSeguimiento {
  estado: 'seguimiento' | 'final';
  periodo: {
    desde?: string;
    hasta?: string;
    diasClima: number;
    diasDesdeSiembra: number;
    diasCiclo: number;
    avanceCiclo: number;
  };
  progreso: {
    verde: { mm: number; litrosHa: number; litrosKg?: number; porcentaje: number; detalle: string };
    azul: {
      mm: number;
      litrosHa: number;
      litrosKg?: number;
      porcentaje: number;
      detalle: string;
      deficitPotencialMm?: number;
    };
    gris: { litrosHa: number; litrosKg?: number; aplicaciones: number; porcentaje: number; detalle: string };
    total: { litrosHa: number; litrosKg?: number; porcentaje: number; detalle: string };
  };
  inputs: {
    cultivo?: string;
    rendimientoSecoKgHa?: number;
    fertilizaciones: number;
    fumigaciones: number;
    climaDisponible: boolean;
  };
  parciales: {
    etcTotalMm?: number;
    lluviaTotalMm?: number;
    lluviaEfectivaMm?: number;
    verdeMm?: number;
    azulRealMm?: number;
    deficitPotencialMm?: number;
    riegoRegistradoMm?: number;
    grisLitrosHa?: number;
    grisFertilizantesLitrosHa?: number;
    grisAgroquimicosLitrosHa?: number;
  };
  calidad: {
    nivel: 'alta' | 'media' | 'baja';
    score: number;
    observaciones: string[];
  };
  metodologia: {
    version: string;
    enfoque: string;
    fuenteClima?: string;
    fechaCalculo?: string;
    limites?: string[];
  };
  faltantes: Array<{ campo: string; accion: string; bloque: string }>;
  trazas: string[];
}

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

  public generarPrediccionMalezas(id: string): Promise<IResultadoPrediccionMalezas> {
    return this.http.post(`/siembras/${id}/prediccion-malezas`, {});
  }

  public seguimientoHuellaHidrica(id: string): Promise<HuellaHidricaSeguimiento> {
    return this.http.get(`/siembras/${id}/huella-hidrica/seguimiento`);
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
