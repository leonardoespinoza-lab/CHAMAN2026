import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateFertilizante,
  IQueryParam,
  ICreateFertilizante,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Fertilizante, FertilizanteDocument } from './modelos/schema';

@Injectable()
export class FertilizantesRepository {
  constructor(
    @InjectModel(Fertilizante.name)
    private readonly model: Model<FertilizanteDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Fertilizante>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Fertilizante> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateFertilizante): Promise<Fertilizante> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateFertilizante): Promise<Fertilizante> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Fertilizante> {
    return await this.model.findByIdAndDelete(id);
  }
}
