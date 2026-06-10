import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateDistribuidor,
  IQueryParam,
  ICreateDistribuidor,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Distribuidor, DistribuidorDocument } from './modelos/schema';

@Injectable()
export class DistribuidorsRepository {
  constructor(
    @InjectModel(Distribuidor.name)
    private readonly model: Model<DistribuidorDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Distribuidor>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Distribuidor> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateDistribuidor): Promise<Distribuidor> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateDistribuidor): Promise<Distribuidor> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Distribuidor> {
    return await this.model.findByIdAndDelete(id);
  }
}
