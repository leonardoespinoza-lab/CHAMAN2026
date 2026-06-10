import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateSemilla,
  IQueryParam,
  ICreateSemilla,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Semilla, SemillaDocument } from './modelos/schema';

@Injectable()
export class SemillasRepository {
  constructor(
    @InjectModel(Semilla.name)
    private readonly model: Model<SemillaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Semilla>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Semilla> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateSemilla): Promise<Semilla> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateSemilla[]): Promise<Semilla[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateSemilla): Promise<Semilla> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Semilla> {
    return await this.model.findByIdAndDelete(id);
  }
}
