import { Injectable } from '@angular/core';
import { IListado, IQueryParam, IReporte } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class ReporteService {
  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<IReporte>> {
    return this.http.get(`/reportes`, { params });
  }

  public getById(id: string): Promise<IReporte> {
    return this.http.get(`/reportes/${id}`);
  }

  /**
   * Obtiene reportes históricos de un dispositivo específico en un rango de fechas
   * @param idDispositivo ID del dispositivo
   * @param fechaInicio Fecha de inicio en formato ISO (YYYY-MM-DD)
   * @param fechaFin Fecha de fin en formato ISO (YYYY-MM-DD)
   * @returns Promise con la lista de reportes
   */
  public getReportesByDispositivoAndDateRange(
    idDispositivo: string,
    fechaInicio: string,
    fechaFin: string
  ): Promise<IListado<IReporte>> {
    const filter = {
      idDispositivo: { $eq: idDispositivo },
      fecha: {
        $gte: fechaInicio,
        $lte: fechaFin,
      },
    };

    const params: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: 'fecha',
      limit: 100, // Limitar para evitar demasiados datos
    };

    return this.http.get(`/reportes`, { params });
  }

  /**
   * Obtiene reportes históricos de un dispositivo en un rango de fechas más amplio
   * para asegurar que encontremos datos aunque no sean de los últimos días exactos
   * @param idDispositivo ID del dispositivo
   * @param fechaInicio Fecha de inicio en formato ISO (YYYY-MM-DD)
   * @param fechaFin Fecha de fin en formato ISO (YYYY-MM-DD)
   * @returns Promise con la lista de reportes
   */
  public getReportesHistoricos(
    idDispositivo: string,
    fechaInicio: string,
    fechaFin: string
  ): Promise<IListado<IReporte>> {
    const filter = {
      idDispositivo: { $eq: idDispositivo },
      fecha: {
        $gte: fechaInicio + 'T00:00:00.000Z',
        $lte: fechaFin + 'T23:59:59.999Z',
      },
    };

    const params: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fecha', // Más recientes primero
      limit: 100,
    };

    console.log('Query de reportes históricos enviada:', { filter, params });
    return this.http.get(`/reportes`, { params });
  }

  /**
   * Método alternativo para probar con fechaCreacion en lugar de fecha
   */
  public getPrimerReporteDiarioAlt(
    idDispositivo: string,
    fechaInicio: string,
    fechaFin: string
  ): Promise<IListado<IReporte>> {
    const filter = {
      idDispositivo: { $eq: idDispositivo },
      fechaCreacion: {
        $gte: fechaInicio + 'T00:00:00.000Z',
        $lte: fechaFin + 'T23:59:59.999Z',
      },
    };

    const params: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: 'fechaCreacion',
      limit: 100,
    };

    console.log('Query alternativa enviada a /reportes:', { filter, params });
    return this.http.get(`/reportes`, { params });
  }

  /**
   * Obtiene reportes diarios de un dispositivo específico
   * @param idDispositivo ID del dispositivo
   * @param dias Número de días a consultar (opcional, por defecto últimos 7 días)
   * @returns Promise con la lista de reportes diarios
   */
  public diario(idDispositivo: string, dias?: number): Promise<IListado<IReporte>> {
    const params: any = {};

    if (dias !== undefined) {
      params.dias = dias.toString();
    }

    return this.http.get(`/reportes/diario/${idDispositivo}`, { params });
  }
}
