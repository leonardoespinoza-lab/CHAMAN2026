import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateEstacion,
  IQueryParam,
  ICreateEstacion,
  UpdateResult,
  DeleteResult,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Estacion, EstacionDocument } from './schema';

@Injectable()
export class EstacionsRepository {
  constructor(
    @InjectModel(Estacion.name)
    private readonly model: Model<EstacionDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Estacion>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Estacion> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateEstacion): Promise<Estacion> {
    return await this.model.create(data);
  }

  async createMany(data: ICreateEstacion[]): Promise<Estacion[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async upsert(data: ICreateEstacion): Promise<Estacion> {
    return await this.model.findOneAndUpdate(
      { idExterno: data.idExterno },
      data,
      { upsert: true, new: true },
    );
  }

  async upsertMany(datos: ICreateEstacion[]) {
    const bulk = this.model.collection.initializeUnorderedBulkOp();
    datos.forEach((dato) => {
      bulk
        .find({
          idExterno: dato.idExterno,
        })
        .upsert()
        .updateOne({ $set: dato });
    });
    return await bulk.execute();
  }

  async update(id: string, data: IUpdateEstacion): Promise<Estacion> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async updateMany(
    query: IQueryParam,
    data: IUpdateEstacion,
  ): Promise<UpdateResult> {
    const filter = JSON.parse(query.filter);
    const update = { $set: data };
    return await this.model.updateMany(filter, update);
  }

  async delete(id: string): Promise<Estacion> {
    return await this.model.findByIdAndDelete(id);
  }

  async deleteMany(query: any): Promise<DeleteResult> {
    const filter = JSON.parse(query.filter);
    return await this.model.deleteMany(filter);
  }
}
