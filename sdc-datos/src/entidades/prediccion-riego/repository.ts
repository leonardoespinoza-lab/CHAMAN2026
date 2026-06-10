import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdatePrediccionRiego,
  IQueryParam,
  ICreatePrediccionRiego,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { PrediccionRiego, PrediccionRiegoDocument } from './modelos/schema';

@Injectable()
export class PrediccionRiegosRepository {
  constructor(
    @InjectModel(PrediccionRiego.name)
    private readonly model: Model<PrediccionRiegoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<PrediccionRiego>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<PrediccionRiego> {
    return await this.model.findById(id).populate('siembra lote').lean();
  }

  async create(data: ICreatePrediccionRiego): Promise<PrediccionRiego> {
    return await this.model.create(data);
  }

  async update(
    id: string,
    data: IUpdatePrediccionRiego,
  ): Promise<PrediccionRiego> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<PrediccionRiego> {
    return await this.model.findByIdAndDelete(id);
  }

  async deleteByIdSiembra(idSiembra: string): Promise<void> {
    await this.model.deleteMany({ idSiembra });
  }
}
