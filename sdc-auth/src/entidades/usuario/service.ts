import { Injectable, Logger } from '@nestjs/common';
import {
  IUsuario,
  IListado,
  IQueryParam,
  ICreateUsuario,
  IUpdateUsuario,
} from 'modelos/src';
import * as bcrypt from 'bcrypt';
import { SessionEligibility, UsuariosRepository } from './repository';
import { ProductorsService } from '../productor/service';

@Injectable()
export class UsuariosService {
  constructor(
    private repository: UsuariosRepository,
    private productorService: ProductorsService,
  ) {}

  async getById(id: string): Promise<IUsuario> {
    const data = await this.repository.getById(id);
    // Comprobar que el usuario tiene permisos
    return data;
  }

  async getByUsername(nombre: string): Promise<IUsuario | undefined> {
    try {
      return await this.repository.getByUsername(nombre);
    } catch (error) {
      const status = error?.getStatus?.() || error?.status;
      if (status === 404) return undefined;
      throw error;
    }
  }

  async getByEmail(email: string): Promise<IUsuario> {
    try {
      return await this.repository.getByEmail(email);
    } catch (error) {
      Logger.error('Error al obtener el usuario por email');
      Logger.error(error);
    }
  }

  async getSessionEligibility(
    idUsuario: string,
  ): Promise<SessionEligibility> {
    return await this.repository.getSessionEligibility(idUsuario);
  }

  async get(params: IQueryParam): Promise<IListado<IUsuario>> {
    return await this.repository.get(params);
  }

  async create(data: ICreateUsuario): Promise<IUsuario> {
    data.hash = await this.hashClave(data.password);
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateUsuario): Promise<IUsuario> {
    await this.getById(id);
    if (data.password) {
      data.hash = await this.hashClave(data.password);
    }
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IUsuario> {
    await this.getById(id);
    return await this.repository.delete(id);
  }

  async desactivar(id: string): Promise<IUsuario> {
    return await this.update(id, { activo: false });
  }

  async activar(id: string): Promise<IUsuario> {
    return await this.update(id, { activo: true });
  }

  async cambiarPassword(id: string, password: string): Promise<IUsuario> {
    // El hash se hacen en el metodo updateUsuario
    return await this.update(id, { password });
  }

  // Private

  private async hashClave(clave: string): Promise<string> {
    return await bcrypt.hash(clave, 10);
  }
}
