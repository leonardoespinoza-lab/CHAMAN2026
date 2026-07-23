import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ICreateUsuario, IQueryParam, ISolicitudArchivado, IUpdateUsuario } from 'modelos/src';
import { UsuariosRepository } from './repository';

@Injectable()
export class UsuariosService {
  constructor(private repository: UsuariosRepository) {}

  async getFilter(query: IQueryParam) {
    const result = await this.repository.getFilter(query);
    for (const dato of result.datos) {
      delete dato.hash;
    }
    return result;
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      delete data.hash;
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async getByEmail(email: string) {
    const data = await this.repository.getByEmail(email);
    if (data) {
      delete data.hash;
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async getByUsername(username: string) {
    const data = await this.repository.getByUsername(username);
    if (data) {
      delete data.hash;
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async getByUsernameForLogin(username: string) {
    const data = await this.repository.getByUsernameForLogin(username);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async getForLogin(username: string) {
    const data = await this.repository.getByUsernameForLogin(username);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateUsuario) {
    try {
      return await this.repository.create(dato);
    } catch (error) {
      this.rethrowDuplicateUsername(error);
    }
  }

  async update(id: string, dato: IUpdateUsuario) {
    let updated;
    try {
      updated = await this.repository.update(id, dato);
    } catch (error) {
      this.rethrowDuplicateUsername(error);
    }
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string, audit: ISolicitudArchivado = {}) {
    const deleted = await this.repository.delete(id, audit);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  private rethrowDuplicateUsername(error: unknown): never {
    const mongoError = error as {
      code?: number;
      keyPattern?: Record<string, number>;
      keyValue?: Record<string, unknown>;
    };
    if (
      mongoError?.code === 11000 &&
      (mongoError.keyPattern?.['username'] || mongoError.keyValue?.['username'])
    ) {
      throw new ConflictException(
        'Ese nombre de usuario ya existe. Elegí otro nombre de acceso.',
      );
    }
    throw error;
  }
}
