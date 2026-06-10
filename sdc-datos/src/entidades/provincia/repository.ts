import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateProvincia,
  IQueryParam,
  ICreateProvincia,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Provincia, ProvinciaDocument } from './modelos/schema';

@Injectable()
export class ProvinciasRepository {
  constructor(
    @InjectModel(Provincia.name)
    private readonly model: Model<ProvinciaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Provincia>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Provincia> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateProvincia): Promise<Provincia> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateProvincia[]): Promise<Provincia[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateProvincia): Promise<Provincia> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Provincia> {
    return await this.model.findByIdAndDelete(id);
  }
}
