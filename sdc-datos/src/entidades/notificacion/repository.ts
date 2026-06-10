import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateNotificacion,
  IQueryParam,
  ICreateNotificacion,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Notificacion, NotificacionDocument } from './modelos/schema';

@Injectable()
export class NotificacionsRepository {
  constructor(
    @InjectModel(Notificacion.name)
    private readonly model: Model<NotificacionDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Notificacion>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Notificacion> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateNotificacion): Promise<Notificacion> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateNotificacion[]): Promise<Notificacion[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateNotificacion): Promise<Notificacion> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async updateMany(query: IQueryParam, dato: IUpdateNotificacion) {
    const filter = JSON.parse(query.filter);
    const update = { $set: dato };
    const doc = await this.model.updateMany(filter, update);
    return doc;
  }

  async delete(id: string): Promise<Notificacion> {
    return await this.model.findByIdAndDelete(id);
  }
}
