import { ForbiddenException, Injectable } from '@nestjs/common';
import { IReporte, IListado, IQueryParam, IFilter, IUsuario } from 'modelos/src';
import { ReportesRepository } from './repository';
import { DispositivosService } from '../dispositivos/service';
import { HelperService } from '../../auxiliares/helper';

@Injectable()
export class ReportesService {
  constructor(
    private repository: ReportesRepository,
    private dispositivosService: DispositivosService,
  ) {}

  async getById(id: string, user?: IUsuario): Promise<IReporte> {
    const reporte = await this.repository.getById(id);
    if (user && reporte?.idDispositivo) {
      await this.dispositivosService.assertPuedeVer(
        reporte.idDispositivo,
        user,
        'Sensores',
      );
    }
    return reporte;
  }

  async get(filtro: IQueryParam, user?: IUsuario): Promise<IListado<IReporte>> {
    if (user && !user.permisos?.some((permiso) => permiso.nivel === 'Admin')) {
      const filter = HelperService.filtroToObject(filtro.filter);
      const idDispositivo = this.extraerIdDispositivo(filter);
      if (!idDispositivo) {
        throw new ForbiddenException(
          'Debe consultar reportes por un dispositivo asignado',
        );
      }
      await this.dispositivosService.assertPuedeVer(
        idDispositivo,
        user,
        'Sensores',
      );
    }
    return await this.repository.get(filtro);
  }

  async historico(
    idDispositivo: string,
    dias = 7,
    limit = 2000,
    user?: IUsuario,
  ): Promise<IListado<IReporte>> {
    if (user) {
      await this.dispositivosService.assertPuedeVer(
        idDispositivo,
        user,
        'Sensores',
      );
    }
    return await this.repository.historico(idDispositivo, dias, limit);
  }

  async diario(
    dias = 7,
    idDispositivo: string,
    user?: IUsuario,
  ): Promise<IListado<IReporte>> {
    if (user) {
      await this.dispositivosService.assertPuedeVer(
        idDispositivo,
        user,
        'Sensores',
      );
    }
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

  private extraerIdDispositivo(filter: any): string | undefined {
    if (!filter || typeof filter !== 'object') {
      return undefined;
    }
    if (typeof filter.idDispositivo === 'string') {
      return filter.idDispositivo;
    }
    if (filter.idDispositivo?.$eq) {
      return filter.idDispositivo.$eq;
    }
    const andItems = Array.isArray(filter.$and) ? filter.$and : [];
    const orItems = Array.isArray(filter.$or) ? filter.$or : [];
    for (const item of [...andItems, ...orItems]) {
      const value = this.extraerIdDispositivo(item);
      if (value) {
        return value;
      }
    }
    return undefined;
  }
}
