import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdatePrincipioActivo,
  IQueryParam,
  ICreatePrincipioActivo,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { PrincipioActivo, PrincipioActivoDocument } from './modelos/schema';

@Injectable()
export class PrincipioActivosRepository {
  constructor(
    @InjectModel(PrincipioActivo.name)
    private readonly model: Model<PrincipioActivoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<PrincipioActivo>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<PrincipioActivo> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreatePrincipioActivo): Promise<PrincipioActivo> {
    return await this.model.create(data);
  }

  async bulk(data: ICreatePrincipioActivo[]): Promise<PrincipioActivo[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(
    id: string,
    data: IUpdatePrincipioActivo,
  ): Promise<PrincipioActivo> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<PrincipioActivo> {
    return await this.model.findByIdAndDelete(id);
  }
}
