import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateLicenciaPorEntidad,
  IQueryParam,
  ICreateLicenciaPorEntidad,
  ILicenciaPorEntidad,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import {
  LicenciaPorEntidad,
  LicenciaPorEntidadDocument,
} from './modelos/schema';

@Injectable()
export class LicenciaPorEntidadsRepository {
  constructor(
    @InjectModel(LicenciaPorEntidad.name)
    private readonly model: Model<LicenciaPorEntidadDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<ILicenciaPorEntidad>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<ILicenciaPorEntidad> {
    return await this.model
      .findById(id)
      .populate('productor distribuidor quimica licencia')
      .lean();
  }

  async create(data: ICreateLicenciaPorEntidad): Promise<ILicenciaPorEntidad> {
    return await this.model.create(data);
  }

  async update(
    id: string,
    data: IUpdateLicenciaPorEntidad,
  ): Promise<ILicenciaPorEntidad> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<ILicenciaPorEntidad> {
    return await this.model.findByIdAndDelete(id);
  }
}
