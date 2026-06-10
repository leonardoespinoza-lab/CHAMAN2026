import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateLote,
  IQueryParam,
  ICreateLote,
  DeleteResult,
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
      .populate('establecimiento departamento siembra')
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

  async delete(id: string): Promise<Lote> {
    return await this.model.findByIdAndDelete(id);
  }

  async deleteMany(query: IQueryParam): Promise<DeleteResult> {
    const filter = JSON.parse(query.filter);
    return await this.model.deleteMany(filter);
  }
}
