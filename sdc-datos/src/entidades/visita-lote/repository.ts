import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateVisitaLote,
  IListado,
  IQueryParam,
  IUpdateVisitaLote,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from '../../auxiliares/helper.service';
import { VisitaLote, VisitaLoteDocument } from './modelos/schema';

@Injectable()
export class VisitasLoteRepository {
  constructor(
    @InjectModel(VisitaLote.name)
    private readonly model: Model<VisitaLoteDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<VisitaLote>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<VisitaLote> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateVisitaLote): Promise<VisitaLote> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateVisitaLote): Promise<VisitaLote> {
    return await this.model.findByIdAndUpdate(id, data, { new: true }).lean();
  }
}
