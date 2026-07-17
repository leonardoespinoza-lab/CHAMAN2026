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
    // La fecha por siembra es la clave natural del calculo. Los procesos
    // programados pueden reintentarse o solaparse; persistir con upsert evita
    // que un reintento deje la siembra sin su actualizacion por E11000.
    return await this.model.findOneAndUpdate(
      {
        idSiembra: data.idSiembra,
        fechaPrediccion: data.fechaPrediccion,
      },
      { $set: data },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
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
