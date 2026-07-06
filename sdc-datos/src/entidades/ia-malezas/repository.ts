import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IQueryParam } from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import {
  IaMalezaAnalisis,
  IaMalezaAnalisisDocument,
} from './modelos/schema';

@Injectable()
export class IaMalezasRepository {
  constructor(
    @InjectModel(IaMalezaAnalisis.name)
    private readonly model: Model<IaMalezaAnalisisDocument>,
  ) {}

  async getFilter(params: IQueryParam) {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<IaMalezaAnalisis> {
    return await this.model.findById(id).lean();
  }

  async create(data: Partial<IaMalezaAnalisis>): Promise<IaMalezaAnalisis> {
    return await this.model.create(data);
  }

  async update(
    id: string,
    data: Partial<IaMalezaAnalisis>,
  ): Promise<IaMalezaAnalisis> {
    return await this.model.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  async delete(id: string): Promise<IaMalezaAnalisis> {
    return await this.model.findByIdAndDelete(id).lean();
  }
}
