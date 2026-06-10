import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateLicencia,
  IQueryParam,
  ICreateLicencia,
  ILicencia,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Licencia, LicenciaDocument } from './modelos/schema';

@Injectable()
export class LicenciasRepository {
  constructor(
    @InjectModel(Licencia.name)
    private readonly model: Model<LicenciaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<ILicencia>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<ILicencia> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateLicencia): Promise<ILicencia> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateLicencia): Promise<ILicencia> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<ILicencia> {
    return await this.model.findByIdAndDelete(id);
  }
}
