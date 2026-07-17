import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ICreateAlerta,
  IFinalizarEventoAlerta,
  IQueryParam,
  IRegistrarEventoAlerta,
  IUpdateAlerta,
} from 'modelos/src';
import { AlertasRepository } from './repository';

@Injectable()
export class AlertasService {
  constructor(private repository: AlertasRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateAlerta) {
    return await this.repository.create(dato);
  }

  async bulk(data: ICreateAlerta[]) {
    return await this.repository.bulk(data);
  }

  async update(id: string, dato: IUpdateAlerta) {
    const updated = await this.repository.update(id, dato);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  async registrarEventoSiembra(comando: IRegistrarEventoAlerta) {
    const alerta = comando?.alerta;
    if (
      !alerta?.idSiembra ||
      !alerta?.dedupeKey ||
      !comando?.eventKey ||
      !comando?.reporte
    ) {
      throw new BadRequestException(
        'idSiembra, dedupeKey, eventKey y reporte son obligatorios',
      );
    }
    if (String(comando.eventKey).length > 512) {
      throw new BadRequestException('eventKey excede 512 caracteres');
    }
    return await this.repository.registrarEventoSiembra(comando);
  }

  async finalizarEventoSiembra(comando: IFinalizarEventoAlerta) {
    if (
      !comando?.idSiembra ||
      !comando?.descripcion ||
      !comando?.comentario ||
      !comando?.fecha
    ) {
      throw new BadRequestException(
        'idSiembra, descripcion, comentario y fecha son obligatorios',
      );
    }
    const modificadas = await this.repository.finalizarEventoSiembra(comando);
    return { finalizada: modificadas > 0, modificadas };
  }

  async finalizarTodasPorSiembra(
    idSiembra: string,
    comentario: string,
    fecha?: string,
  ): Promise<number> {
    if (!idSiembra || !comentario) {
      throw new BadRequestException(
        'idSiembra y comentario son obligatorios para cerrar el ciclo',
      );
    }
    return await this.repository.finalizarTodasPorSiembra(
      idSiembra,
      comentario,
      fecha,
    );
  }
}
