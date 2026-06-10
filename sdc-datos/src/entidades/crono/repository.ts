import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IListado, IUpdateCrono, IQueryParam, ICreateCrono } from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Crono, CronoDocument } from './modelos/schema';

@Injectable()
export class CronosRepository {
  constructor(
    @InjectModel(Crono.name)
    private readonly model: Model<CronoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Crono>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Crono> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateCrono): Promise<Crono> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateCrono[]): Promise<Crono[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateCrono): Promise<Crono> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Crono> {
    return await this.model.findByIdAndDelete(id);
  }
}
