import { Injectable } from '@nestjs/common';
import {
  IAlerta,
  ICreateAlerta,
  IListado,
  IQueryParam,
  IUpdateAlerta,
} from 'modelos/src';
import { AlertasRepository } from './repository';

interface EventoSiembra {
  idSiembra: string;
  descripcion: string;
  fecha: string;
  eventKey: string;
  reporte: Record<string, any>;
  tenant: {
    idQuimica?: string;
    idDistribuidor?: string;
    idProductor?: string;
    idEstablecimiento?: string;
  };
}

@Injectable()
export class AlertasService {
  constructor(private repository: AlertasRepository) {}

  async getById(id: string): Promise<IAlerta> {
    return await this.repository.getById(id);
  }

  async getByIdSiembraActiva(
    id: string,
    descripcion?: string,
  ): Promise<IAlerta> {
    const query: IQueryParam = {
      filter: JSON.stringify({
        idSiembra: id,
        activa: true,
        ...(descripcion ? { descripcion } : {}),
      }),
      sort: '-fecha',
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  async get(filtro: IQueryParam): Promise<IListado<IAlerta>> {
    return await this.repository.get(filtro);
  }

  async update(id: string, data: IUpdateAlerta): Promise<IAlerta> {
    return await this.repository.update(id, data);
  }

  async create(data: IAlerta): Promise<IAlerta> {
    return await this.repository.create(data);
  }

  async registrarEventoSiembra(
    evento: EventoSiembra,
  ): Promise<{ alerta?: IAlerta; creada: boolean; duplicada: boolean }> {
    const alerta = await this.getByIdSiembraActiva(
      evento.idSiembra,
      evento.descripcion,
    );
    const reporte = {
      ...evento.reporte,
      fecha: evento.fecha,
      eventKey: evento.eventKey,
    };

    if (alerta) {
      const reportes = alerta.reportes || [];
      const duplicada = reportes.some((r) => r?.eventKey === evento.eventKey);
      if (duplicada) {
        return { alerta, creada: false, duplicada: true };
      }
      const update: IUpdateAlerta = {
        reportes: [...reportes, reporte],
      };
      return {
        alerta: await this.update(alerta._id, update),
        creada: false,
        duplicada: false,
      };
    }

    const create: ICreateAlerta = {
      idSiembra: evento.idSiembra,
      activa: true,
      reportes: [reporte],
      estadoActual: 'Nueva',
      estados: [
        {
          fecha: evento.fecha,
          estado: 'Nueva',
        },
      ],
      fecha: evento.fecha,
      idDistribuidor: evento.tenant.idDistribuidor,
      idEstablecimiento: evento.tenant.idEstablecimiento,
      idProductor: evento.tenant.idProductor,
      idQuimica: evento.tenant.idQuimica,
      descripcion: evento.descripcion,
    };
    return {
      alerta: await this.create(create),
      creada: true,
      duplicada: false,
    };
  }
}
