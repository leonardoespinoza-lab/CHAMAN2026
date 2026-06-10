import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateUsuario, IQueryParam, IUpdateUsuario } from 'modelos/src';
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
    const data = await this.repository.getByUsername(username);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async getForLogin(username: string) {
    const data = await this.repository.getByUsername(username);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateUsuario) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateUsuario) {
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
}
