import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateLote,
  IQueryParam,
  ICreateLote,
  DeleteResult,
  ISolicitudArchivado,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Lote, LoteDocument } from './modelos/schema';

@Injectable()
export class LotesRepository {
  constructor(
    @InjectModel(Lote.name)
    private readonly model: Model<LoteDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Lote>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Lote> {
    return await this.model
      .findById(id)
      .populate([
        {
          path: 'establecimiento',
          populate: {
            path: 'estacionMeteorologica',
          },
        },
        { path: 'departamento' },
        { path: 'dispositivos' },
      ])
      .populate({
        path: 'siembra',
        populate: ['semilla', 'crono', 'departamento'],
      })
      .lean();
  }

  async create(data: ICreateLote): Promise<Lote> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateLote): Promise<Lote> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string, audit: ISolicitudArchivado = {}): Promise<Lote> {
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

  async deleteMany(query: IQueryParam): Promise<DeleteResult> {
    const filter = JSON.parse(query.filter);
    const result = await this.model.updateMany(filter, {
      $set: {
        archivado: true,
        fechaArchivado: new Date(),
        archivadoPor: query.archivadoPor || 'sistema',
        motivoArchivado: query.motivoArchivado || 'Archivado masivo desde Chaman',
      },
    });
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.modifiedCount,
    };
  }
}
