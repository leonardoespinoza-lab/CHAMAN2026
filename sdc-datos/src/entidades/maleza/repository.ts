import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateMaleza,
  IListado,
  IQueryParam,
  IUpdateMaleza,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Maleza, MalezaDocument } from './modelos/schema';

@Injectable()
export class MalezasRepository {
  constructor(
    @InjectModel(Maleza.name)
    private readonly model: Model<MalezaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Maleza>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Maleza> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateMaleza): Promise<Maleza> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateMaleza[]): Promise<Maleza[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateMaleza): Promise<Maleza> {
    return await this.model.findByIdAndUpdate(id, data, { new: true });
  }

  async delete(id: string): Promise<Maleza> {
    return await this.model.findByIdAndDelete(id);
  }
}
