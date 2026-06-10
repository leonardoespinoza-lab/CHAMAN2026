import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IListado, IUpdateFoto, IQueryParam, ICreateFoto } from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Foto, FotoDocument } from './modelos/schema';

@Injectable()
export class FotosRepository {
  constructor(
    @InjectModel(Foto.name)
    private readonly model: Model<FotoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Foto>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Foto> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateFoto): Promise<Foto> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateFoto): Promise<Foto> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Foto> {
    return await this.model.findByIdAndDelete(id);
  }
}
