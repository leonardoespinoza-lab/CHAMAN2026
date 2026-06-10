import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateAgroquimico,
  IQueryParam,
  ICreateAgroquimico,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Agroquimico, AgroquimicoDocument } from './modelos/schema';

@Injectable()
export class AgroquimicosRepository {
  constructor(
    @InjectModel(Agroquimico.name)
    private readonly model: Model<AgroquimicoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Agroquimico>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Agroquimico> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateAgroquimico): Promise<Agroquimico> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateAgroquimico[]): Promise<Agroquimico[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateAgroquimico): Promise<Agroquimico> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Agroquimico> {
    return await this.model.findByIdAndDelete(id);
  }
}
