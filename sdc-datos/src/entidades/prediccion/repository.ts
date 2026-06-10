import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdatePrediccion,
  IQueryParam,
  ICreatePrediccion,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Prediccion, PrediccionDocument } from './modelos/schema';

@Injectable()
export class PrediccionsRepository {
  constructor(
    @InjectModel(Prediccion.name)
    private readonly model: Model<PrediccionDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Prediccion>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Prediccion> {
    return await this.model.findById(id).populate('siembra').lean();
  }

  async create(data: ICreatePrediccion): Promise<Prediccion> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdatePrediccion): Promise<Prediccion> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Prediccion> {
    return await this.model.findByIdAndDelete(id);
  }

  async deleteByIdSiembra(idSiembra: string): Promise<void> {
    await this.model.deleteMany({ idSiembra });
  }
}
