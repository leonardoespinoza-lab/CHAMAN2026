import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateFumigacion,
  IQueryParam,
  ICreateFumigacion,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Fumigacion, FumigacionDocument } from './modelos/schema';

@Injectable()
export class FumigacionsRepository {
  constructor(
    @InjectModel(Fumigacion.name)
    private readonly model: Model<FumigacionDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Fumigacion>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Fumigacion> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateFumigacion): Promise<Fumigacion> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateFumigacion[]): Promise<Fumigacion[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateFumigacion): Promise<Fumigacion> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Fumigacion> {
    return await this.model.findByIdAndDelete(id);
  }
}
