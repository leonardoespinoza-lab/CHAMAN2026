import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateProductor,
  IQueryParam,
  ICreateProductor,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Productor, ProductorDocument } from './modelos/schema';

@Injectable()
export class ProductorsRepository {
  constructor(
    @InjectModel(Productor.name)
    private readonly model: Model<ProductorDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Productor>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Productor> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateProductor): Promise<Productor> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateProductor): Promise<Productor> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Productor> {
    return await this.model.findByIdAndDelete(id);
  }
}
