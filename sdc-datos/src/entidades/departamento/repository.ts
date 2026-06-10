import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateDepartamento,
  IQueryParam,
  ICreateDepartamento,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Departamento, DepartamentoDocument } from './modelos/schema';

@Injectable()
export class DepartamentosRepository {
  constructor(
    @InjectModel(Departamento.name)
    private readonly model: Model<DepartamentoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Departamento>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Departamento> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateDepartamento): Promise<Departamento> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateDepartamento[]): Promise<Departamento[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateDepartamento): Promise<Departamento> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Departamento> {
    return await this.model.findByIdAndDelete(id);
  }
}
