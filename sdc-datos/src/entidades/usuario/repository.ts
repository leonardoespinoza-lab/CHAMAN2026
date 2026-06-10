import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateUsuario,
  IQueryParam,
  ICreateUsuario,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Usuario, UsuarioDocument } from './modelos/schema';

@Injectable()
export class UsuariosRepository {
  constructor(
    @InjectModel(Usuario.name)
    private readonly model: Model<UsuarioDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Usuario>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Usuario> {
    return await this.model
      .findById(id)
      .populate([
        {
          path: 'permisos.establecimiento',
          select: 'nombre',
        },
        {
          path: 'permisos.productor',
          select: 'nombre logo',
        },
        {
          path: 'permisos.distribuidor',
          select: 'nombre logo direccion geojson',
        },
        {
          path: 'permisos.quimica',
          select: 'nombre logo',
        },
      ])
      .lean();
  }

  async getByUsername(username: string): Promise<Usuario> {
    return await this.model
      .findOne({ username })
      .populate([
        {
          path: 'permisos.establecimiento',
          select: 'nombre',
        },
        {
          path: 'permisos.productor',
          select: 'nombre logo',
        },
        {
          path: 'permisos.distribuidor',
          select: 'nombre logo',
        },
        {
          path: 'permisos.quimica',
          select: 'nombre logo',
        },
      ])
      .lean();
  }

  async getByEmail(email: string): Promise<Usuario> {
    return await this.model
      .findOne({ email })
      .populate([
        {
          path: 'permisos.establecimiento',
          select: 'nombre',
        },
        {
          path: 'permisos.productor',
          select: 'nombre logo',
        },
        {
          path: 'permisos.distribuidor',
          select: 'nombre logo',
        },
        {
          path: 'permisos.quimica',
          select: 'nombre logo',
        },
      ])
      .lean();
  }

  async create(data: ICreateUsuario): Promise<Usuario> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateUsuario): Promise<Usuario> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Usuario> {
    return await this.model.findByIdAndDelete(id);
  }
}
