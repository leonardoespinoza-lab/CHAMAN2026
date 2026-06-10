import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateFertilizacion,
  IQueryParam,
  ICreateFertilizacion,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Fertilizacion, FertilizacionDocument } from './modelos/schema';

@Injectable()
export class FertilizacionsRepository {
  constructor(
    @InjectModel(Fertilizacion.name)
    private readonly model: Model<FertilizacionDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Fertilizacion>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Fertilizacion> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateFertilizacion): Promise<Fertilizacion> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateFertilizacion[]): Promise<Fertilizacion[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateFertilizacion): Promise<Fertilizacion> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Fertilizacion> {
    return await this.model.findByIdAndDelete(id);
  }
}
