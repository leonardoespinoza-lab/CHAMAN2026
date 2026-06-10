import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateQuimica,
  IQueryParam,
  ICreateQuimica,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Quimica, QuimicaDocument } from './modelos/schema';

@Injectable()
export class QuimicasRepository {
  constructor(
    @InjectModel(Quimica.name)
    private readonly model: Model<QuimicaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Quimica>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Quimica> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateQuimica): Promise<Quimica> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateQuimica): Promise<Quimica> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Quimica> {
    return await this.model.findByIdAndDelete(id);
  }
}
