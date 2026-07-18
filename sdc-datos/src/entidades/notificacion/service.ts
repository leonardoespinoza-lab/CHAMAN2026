import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ICreateNotificacion,
  IFinalizarEntregaPushNotificacion,
  IQueryParam,
  IUpdateNotificacion,
} from 'modelos/src';
import { NotificacionsRepository } from './repository';

const LEASE_PUSH_MS = 5 * 60 * 1000;
const RETRY_PUSH_MS = 5 * 60 * 1000;
const MAX_EVENT_KEY = 512;
const MAX_DETALLE = 1000;

@Injectable()
export class NotificacionsService {
  constructor(private repository: NotificacionsRepository) {}

  async getFilter(query: IQueryParam) {
    const includeHidden = String((query as any)?.includeHidden) === 'true';
    if (!includeHidden) {
      let filter: Record<string, any> = {};
      try {
        filter = query?.filter ? JSON.parse(query.filter) : {};
      } catch {
        throw new BadRequestException('filter no es JSON valido');
      }
      filter.oculta = { $ne: true };
      query = { ...query, filter: JSON.stringify(filter) };
    }
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateNotificacion) {
    return await this.repository.createIdempotent(this.normalizar(dato));
  }

  async bulk(data: ICreateNotificacion[]) {
    return await Promise.all(data.map((dato) => this.create(dato)));
  }

  async claimPush(dato: ICreateNotificacion) {
    const normalizada = this.normalizar(dato, true);
    const ahora = new Date();
    return await this.repository.claimPush(
      normalizada,
      randomUUID(),
      ahora,
      new Date(ahora.getTime() + LEASE_PUSH_MS),
    );
  }

  async finalizarEntregaPush(
    id: string,
    dato: IFinalizarEntregaPushNotificacion,
  ) {
    const claimId = String(dato?.claimId || '').trim();
    if (!claimId) {
      throw new BadRequestException('claimId es obligatorio');
    }
    if (!['enviada', 'fallida', 'omitida'].includes(dato?.resultado)) {
      throw new BadRequestException('resultado de entrega push invalido');
    }
    const ahora = new Date();
    const actualizada = await this.repository.finalizarEntregaPush(
      id,
      {
        claimId,
        resultado: dato.resultado,
        detalle: this.limitarDetalle(dato.detalle),
      },
      ahora,
      new Date(ahora.getTime() + RETRY_PUSH_MS),
    );
    if (!actualizada) {
      throw new ConflictException(
        'El claim de entrega no existe, vencio o ya fue finalizado',
      );
    }
    return actualizada;
  }

  async update(id: string, dato: IUpdateNotificacion) {
    const updated = await this.repository.update(
      id,
      this.protegerIdentidad(dato),
    );
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async updateMany(query: IQueryParam, data: IUpdateNotificacion) {
    return await this.repository.updateMany(
      query,
      this.protegerIdentidad(data),
    );
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  private normalizar(
    dato: ICreateNotificacion,
    requireEventKey = false,
  ): ICreateNotificacion {
    const topLevel = String(dato?.eventKey || '').trim();
    const nested = String(dato?.data?.eventKey || '').trim();
    if (topLevel && nested && topLevel !== nested) {
      throw new BadRequestException(
        'eventKey no coincide con data.eventKey',
      );
    }
    const eventKey = topLevel || nested;
    if (requireEventKey && !eventKey) {
      throw new BadRequestException('eventKey es obligatorio para el claim');
    }
    if (eventKey.length > MAX_EVENT_KEY) {
      throw new BadRequestException(
        `eventKey excede ${MAX_EVENT_KEY} caracteres`,
      );
    }
    const idUsuario = String(dato?.tenant?.idUsuario || '').trim();
    if (eventKey && !idUsuario) {
      throw new BadRequestException(
        'tenant.idUsuario es obligatorio cuando se informa eventKey',
      );
    }

    const { entregaPush: _ignorarEstadoCliente, ...base } = dato || {};
    return {
      ...base,
      tenant: dato?.tenant ? { ...dato.tenant, idUsuario } : dato?.tenant,
      eventKey: eventKey || undefined,
      data: eventKey
        ? { ...(dato?.data || {}), eventKey }
        : { ...(dato?.data || {}) },
    };
  }

  private limitarDetalle(detalle?: string): string | undefined {
    const value = String(detalle || '').trim();
    return value ? value.slice(0, MAX_DETALLE) : undefined;
  }

  private protegerIdentidad(
    dato: IUpdateNotificacion,
  ): IUpdateNotificacion {
    const {
      eventKey: _eventKey,
      entregaPush: _entregaPush,
      data: _data,
      tenant: _tenant,
      oculta: _oculta,
      fechaEliminacion: _fechaEliminacion,
      ...seguro
    } = dato || {};
    return seguro;
  }
}
