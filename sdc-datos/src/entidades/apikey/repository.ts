import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateApikey,
  IQueryParam,
  ICreateApikey,
  IApikey,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Apikey, ApikeyDocument } from './modelos/schema';

@Injectable()
export class ApikeysRepository {
  constructor(
    @InjectModel(Apikey.name)
    private readonly model: Model<ApikeyDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<IApikey>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<IApikey> {
    return await this.model
      .findById(id)
      .populate('productor distribuidor quimica')
      .lean();
  }

  async create(data: ICreateApikey): Promise<IApikey> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateApikey): Promise<IApikey> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<IApikey> {
    return await this.model.findByIdAndDelete(id);
  }
}
