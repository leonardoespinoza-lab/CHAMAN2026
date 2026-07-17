import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateSiembra,
  IQueryParam,
  ICreateSiembra,
  IRegistroFenologico,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Siembra, SiembraDocument } from './modelos/schema';

@Injectable()
export class SiembrasRepository {
  constructor(
    @InjectModel(Siembra.name)
    private readonly model: Model<SiembraDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Siembra>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Siembra> {
    return await this.model
      .findById(id)
      .populate('semilla departamento lote establecimiento crono')
      .populate([
        {
          path: 'productor',
          select: 'nombre integraciones',
        },
        {
          path: 'distribuidor',
          select: 'nombre integraciones',
        },
        {
          path: 'quimica',
          select: 'nombre integraciones',
        },
        {
          path: 'lote',
        },
      ])
      .lean();
  }

  async create(data: ICreateSiembra): Promise<Siembra> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateSiembra): Promise<Siembra> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async appendPhenologyRecord(
    id: string,
    record: IRegistroFenologico,
  ): Promise<Siembra> {
    const atomicConditions: Record<string, unknown>[] = [
      { 'registrosFenologicos.id': { $ne: record.id } },
    ];
    if (record.reemplazaRegistroId) {
      atomicConditions.push(
        {
          registrosFenologicos: {
            $elemMatch: { id: record.reemplazaRegistroId },
          },
        },
        {
          'registrosFenologicos.reemplazaRegistroId': {
            $ne: record.reemplazaRegistroId,
          },
        },
      );
    }
    return await this.model.findOneAndUpdate(
      {
        _id: id,
        $and: atomicConditions,
      },
      { $push: { registrosFenologicos: record } },
      { new: true },
    );
  }

  async delete(id: string): Promise<Siembra> {
    return await this.model.findByIdAndDelete(id);
  }
}
