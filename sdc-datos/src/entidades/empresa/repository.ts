import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateEmpresa,
  IQueryParam,
  ICreateEmpresa,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Empresa, EmpresaDocument } from './modelos/schema';

@Injectable()
export class EmpresasRepository {
  constructor(
    @InjectModel(Empresa.name)
    private readonly model: Model<EmpresaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Empresa>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Empresa> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateEmpresa): Promise<Empresa> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateEmpresa[]): Promise<Empresa[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateEmpresa): Promise<Empresa> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Empresa> {
    return await this.model.findByIdAndDelete(id);
  }
}
