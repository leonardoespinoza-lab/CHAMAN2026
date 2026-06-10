import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateEnfermedad,
  IQueryParam,
  ICreateEnfermedad,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Enfermedad, EnfermedadDocument } from './modelos/schema';

@Injectable()
export class EnfermedadsRepository {
  constructor(
    @InjectModel(Enfermedad.name)
    private readonly model: Model<EnfermedadDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Enfermedad>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Enfermedad> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateEnfermedad): Promise<Enfermedad> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateEnfermedad[]): Promise<Enfermedad[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateEnfermedad): Promise<Enfermedad> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Enfermedad> {
    return await this.model.findByIdAndDelete(id);
  }
}
