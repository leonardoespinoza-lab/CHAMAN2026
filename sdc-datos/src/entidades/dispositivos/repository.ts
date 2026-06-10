import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateDispositivo,
  IQueryParam,
  ICreateDispositivo,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Dispositivo, DispositivoDocument } from './modelos/schema';

@Injectable()
export class DispositivosRepository {
  constructor(
    @InjectModel(Dispositivo.name)
    private readonly model: Model<DispositivoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Dispositivo>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Dispositivo> {
    return await this.model
      .findById(id)
      .populate('quimica distribuidor productor')
      .lean();
  }

  async create(data: ICreateDispositivo): Promise<Dispositivo> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateDispositivo): Promise<Dispositivo> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Dispositivo> {
    return await this.model.findByIdAndDelete(id);
  }
}
