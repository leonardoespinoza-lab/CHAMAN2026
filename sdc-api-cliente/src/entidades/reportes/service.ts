import { Injectable } from '@nestjs/common';
import { IReporte, IListado, IQueryParam, IFilter } from 'modelos/src';
import { ReportesRepository } from './repository';

@Injectable()
export class ReportesService {
  constructor(private repository: ReportesRepository) {}

  async getById(id: string): Promise<IReporte> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IReporte>> {
    return await this.repository.get(filtro);
  }

  async historico(
    idDispositivo: string,
    dias = 7,
    limit = 2000,
  ): Promise<IListado<IReporte>> {
    const desde = new Date();
    desde.setDate(desde.getDate() - Number(dias || 7));
    const filtro: IFilter<IReporte> = {
      idDispositivo,
      fecha: {
        $gte: desde.toISOString(),
      },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
      sort: 'fecha fechaCreacion',
      limit: Number(limit || 2000),
    };
    return await this.repository.get(query);
  }

  async diario(dias = 7, idDispositivo: string): Promise<IListado<IReporte>> {
    // Obtiene un reporte por día para el dispositivo, específicamente el más cercano a las 06:00 AM
    const filtro: IFilter<IReporte> = {
      idDispositivo,
      fechaCreacion: {
        $gte: new Date(
          new Date().setDate(new Date().getDate() - dias),
        ).toISOString(),
      },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
      sort: JSON.stringify({ fechaCreacion: 1 }), // Orden ascendente para procesamiento cronológico
      limit: 0,
    };
    const reportes = await this.repository.get(query);

    // Agrupamos reportes por día y seleccionamos el más cercano a las 06:00 AM
    const reportesPorDia: Map<string, IReporte> = new Map();
    const horaObjetivo = 6; // 06:00 AM

    for (const reporte of reportes.datos) {
      const fechaReporte = new Date(reporte.fechaCreacion);
      const dia = fechaReporte.toISOString().split('T')[0]; // YYYY-MM-DD
      const horaReporte =
        fechaReporte.getHours() + fechaReporte.getMinutes() / 60; // Hora en formato decimal

      if (!reportesPorDia.has(dia)) {
        // Primer reporte del día
        reportesPorDia.set(dia, reporte);
      } else {
        // Comparar cual está más cerca de las 06:00 AM
        const reporteActual = reportesPorDia.get(dia);
        const fechaActual = new Date(reporteActual.fechaCreacion);
        const horaActual =
          fechaActual.getHours() + fechaActual.getMinutes() / 60;

        const diferenciaActual = Math.abs(horaActual - horaObjetivo);
        const diferenciaNueva = Math.abs(horaReporte - horaObjetivo);

        // Si el nuevo reporte está más cerca de las 06:00 AM, lo reemplazamos
        if (diferenciaNueva < diferenciaActual) {
          reportesPorDia.set(dia, reporte);
        }
      }
    }

    // Convertir el Map a array y ordenar por fecha descendente para mostrar los más recientes primero
    const reportesFinales = Array.from(reportesPorDia.values()).sort(
      (a, b) =>
        new Date(b.fechaCreacion).getTime() -
        new Date(a.fechaCreacion).getTime(),
    );

    return {
      datos: reportesFinales,
      totalCount: reportesFinales.length,
    };
  }
}
