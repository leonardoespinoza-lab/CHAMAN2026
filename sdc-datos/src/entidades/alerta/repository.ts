import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateAlerta,
  IQueryParam,
  ICreateAlerta,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Alerta, AlertaDocument } from './modelos/schema';

@Injectable()
export class AlertasRepository {
  constructor(
    @InjectModel(Alerta.name)
    private readonly model: Model<AlertaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Alerta>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Alerta> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateAlerta): Promise<Alerta> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateAlerta[]): Promise<Alerta[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateAlerta): Promise<Alerta> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Alerta> {
    return await this.model.findByIdAndDelete(id);
  }
}
