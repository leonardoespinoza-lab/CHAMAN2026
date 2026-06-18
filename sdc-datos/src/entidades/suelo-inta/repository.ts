import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateSueloInta,
  IListado,
  IQueryParam,
  IUpdateSueloInta,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { SueloInta, SueloIntaDocument } from './modelos/schema';

@Injectable()
export class SuelosIntaRepository {
  constructor(
    @InjectModel(SueloInta.name)
    private readonly model: Model<SueloIntaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<SueloInta>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<SueloInta> {
    return await this.model.findById(id).lean();
  }

  async getByPoint(lat: number, lng: number): Promise<SueloInta> {
    return await this.model
      .findOne({
        geometry: {
          $geoIntersects: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
          },
        },
      })
      .lean();
  }

  async create(data: ICreateSueloInta): Promise<SueloInta> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateSueloInta): Promise<SueloInta> {
    return await this.model.findByIdAndUpdate(id, data, { new: true });
  }

  async delete(id: string): Promise<SueloInta> {
    return await this.model.findByIdAndDelete(id);
  }
}
