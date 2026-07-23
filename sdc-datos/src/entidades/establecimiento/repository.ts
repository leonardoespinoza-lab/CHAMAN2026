import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateEstablecimiento,
  IQueryParam,
  ICreateEstablecimiento,
  ISolicitudArchivado,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Establecimiento, EstablecimientoDocument } from './modelos/schema';

@Injectable()
export class EstablecimientosRepository {
  constructor(
    @InjectModel(Establecimiento.name)
    private readonly model: Model<EstablecimientoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Establecimiento>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Establecimiento> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateEstablecimiento): Promise<Establecimiento> {
    return await this.model.create(data);
  }

  async update(
    id: string,
    data: IUpdateEstablecimiento,
  ): Promise<Establecimiento> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string, audit: ISolicitudArchivado = {}): Promise<Establecimiento> {
    return await this.model.findByIdAndUpdate(
      id,
      {
        archivado: true,
        fechaArchivado: new Date(),
        archivadoPor: audit.archivadoPor || 'sistema',
        motivoArchivado: audit.motivoArchivado || 'Archivado desde Chaman',
      },
      { new: true },
    ).lean();
  }
}
