import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateUsuario,
  IQueryParam,
  ICreateUsuario,
  ISolicitudArchivado,
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
          select: 'nombre logo direccion geojson radioInfluenciaKm',
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
          select: 'nombre logo direccion geojson radioInfluenciaKm',
        },
        {
          path: 'permisos.quimica',
          select: 'nombre logo',
        },
      ])
      .lean();
  }

  async getByUsernameForLogin(username: string): Promise<Usuario> {
    return await this.model
      .findOne({
        username,
        archivado: { $ne: true },
        activo: { $ne: false },
      })
      .select('+hash')
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
          select: 'nombre logo direccion geojson radioInfluenciaKm',
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
          select: 'nombre logo direccion geojson radioInfluenciaKm',
        },
        {
          path: 'permisos.quimica',
          select: 'nombre logo',
        },
      ])
      .lean();
  }

  async create(data: ICreateUsuario): Promise<Usuario> {
    const created = await this.model.create(data);
    const result = created.toObject() as Usuario;
    delete result.hash;
    return result;
  }

  async update(id: string, data: IUpdateUsuario): Promise<Usuario> {
    return await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .select('-hash')
      .lean();
  }

  async delete(id: string, audit: ISolicitudArchivado = {}): Promise<Usuario> {
    return await this.model.findByIdAndUpdate(
      id,
      {
        activo: false,
        archivado: true,
        fechaArchivado: new Date(),
        archivadoPor: audit.archivadoPor || 'sistema',
        motivoArchivado: audit.motivoArchivado || 'Archivado desde Chaman',
      },
      { new: true },
    ).select('-hash').lean();
  }
}
