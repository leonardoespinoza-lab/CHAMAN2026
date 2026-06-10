import { Injectable } from '@nestjs/common';
import {
  IUsuario,
  IListado,
  IQueryParam,
  ICreateUsuario,
  IUpdateUsuario,
  ICreateProductor,
  IPermiso,
  IFilter,
} from 'modelos/src';
import bcrypt from 'bcryptjs';
import { UsuariosRepository } from './repository';
import { HelperService } from '../../auxiliares/helper';
import { ProductorsService } from '../productor/service';
import { AuthenticationService } from '../../auxiliares/authentication/authentication.service';

@Injectable()
export class UsuariosService {
  constructor(
    private repository: UsuariosRepository,
    private productorService: ProductorsService,
    private authenticationService: AuthenticationService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IUsuario> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new Error('No tiene permiso para ver este usuario');
    }
    return res;
  }

  async getByUsername(nombre: string, permiso: IPermiso): Promise<IUsuario> {
    const res = await this.repository.getByUsername(nombre);
    if (!this.puedeVer(res, permiso)) {
      throw new Error('No tiene permiso para ver este usuario');
    }
    return res;
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IUsuario>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async create(data: ICreateUsuario): Promise<IUsuario> {
    data.hash = await this.hashClave(data.password);
    return await this.repository.create(data);
  }

  async crearFront(data: ICreateUsuario): Promise<IUsuario> {
    data.hash = await this.hashClave(data.password);
    // Default a una quimica y distribuidora
    // "65f044fe3584e3c22061f786" Chamán Química
    // "67ebecf924d876504503a647" Chamán Distribuidora
    const createProductor: ICreateProductor = {
      idDistribuidor: '67ebecf924d876504503a647',
      idQuimica: '65f044fe3584e3c22061f786',
      nombre: data.username,
      gratis: true,
    };
    const productor =
      await this.productorService.createInternal(createProductor);
    const permisos: IPermiso[] = [
      {
        nivel: 'Productor',
        idProductor: productor._id,
        idQuimica: '65f044fe3584e3c22061f786',
        idDistribuidor: '67ebecf924d876504503a647',
        rol: 'Admin',
      },
    ];
    data.permisos = permisos;
    data.activo = true;
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateUsuario,
    permiso: IPermiso,
  ): Promise<IUsuario> {
    await this.getById(id, permiso);
    if (data.password) {
      data.hash = await this.hashClave(data.password);
    }
    return await this.repository.update(id, data);
  }

  async delete(id: string, permiso: IPermiso): Promise<IUsuario> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  async desactivar(id: string, permiso: IPermiso): Promise<IUsuario> {
    return await this.update(id, { activo: false }, permiso);
  }

  async activar(id: string, permiso: IPermiso): Promise<IUsuario> {
    return await this.update(id, { activo: true }, permiso);
  }

  async cambiarPassword(
    id: string,
    password: string,
    permiso: IPermiso,
  ): Promise<IUsuario> {
    // El hash se hacen en el metodo updateUsuario
    return await this.update(id, { password }, permiso);
  }

  async cambiarPasswordPropio(
    oldPassword: string,
    newPassword: string,
    permiso: IPermiso,
    user: IUsuario,
  ): Promise<IUsuario> {
    const res = await this.authenticationService.validatePassword(
      user.username,
      oldPassword,
    );
    if (!res.valid) {
      throw new Error('La contraseña actual es incorrecta');
    }
    // El hash se hacen en el metodo updateUsuario
    return await this.update(user._id, { password: newPassword }, permiso);
  }

  // Private

  private async hashClave(clave: string): Promise<string> {
    return await bcrypt.hash(clave, 10);
  }

  private puedeVer(data: IUsuario, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return data.permisos.some((p) => p.idQuimica === permiso.idQuimica);
    }
    if (permiso.nivel === 'Distribuidor') {
      return data.permisos.some(
        (p) => p.idDistribuidor === permiso.idDistribuidor,
      );
    }
    if (permiso.nivel === 'Productor') {
      return data.permisos.some((p) => p.idProductor === permiso.idProductor);
    }
    if (permiso.nivel === 'Establecimiento') {
      return data.permisos.some(
        (p) => p.idEstablecimiento === permiso.idEstablecimiento,
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<any> = HelperService.filtroToObject(query.filter);
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ 'permisos.idQuimica': permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ 'permisos.idDistribuidor': permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ 'permisos.idProductor': permiso.idProductor });
    }
    if (permiso.nivel === 'Establecimiento') {
      $and.push({ 'permisos.idEstablecimiento': permiso.idEstablecimiento });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
