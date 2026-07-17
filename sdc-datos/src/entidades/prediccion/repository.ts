import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdatePrediccion,
  IQueryParam,
  ICreatePrediccion,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Prediccion, PrediccionDocument } from './modelos/schema';
import { PrediccionTombstone } from './modelos/tombstone.schema';
import { Siembra } from '../siembra/modelos/schema';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class PrediccionsRepository {
  constructor(
    @InjectModel(Prediccion.name)
    private readonly model: Model<PrediccionDocument>,
    @InjectModel(PrediccionTombstone.name)
    private readonly tombstoneModel: Model<PrediccionTombstone>,
    @InjectModel(Siembra.name)
    private readonly siembraModel: Model<Siembra>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Prediccion>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Prediccion> {
    return await this.model.findById(id).populate('siembra').lean();
  }

  async create(data: ICreatePrediccion): Promise<Prediccion> {
    await this.assertSowingAcceptsPredictions(String(data.idSiembra));
    const created = await this.model.create(data);
    try {
      await this.assertSowingAcceptsPredictions(String(data.idSiembra));
      return created;
    } catch (error) {
      await this.model
        .deleteOne({ _id: (created as any)._id })
        .catch(() => undefined);
      throw error;
    }
  }

  async update(id: string, data: IUpdatePrediccion): Promise<Prediccion> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Prediccion> {
    return await this.model.findByIdAndDelete(id);
  }

  async deleteByIdSiembra(idSiembra: string): Promise<void> {
    await this.tombstoneModel.updateOne(
      { idSiembra },
      { $set: { idSiembra, eliminadaEn: new Date() } },
      { upsert: true },
    );
    await this.model.deleteMany({ idSiembra });
  }

  async clearByIdSiembra(idSiembra: string): Promise<void> {
    await this.assertSowingAcceptsPredictions(idSiembra);
    await this.model.deleteMany({ idSiembra });
  }

  async replaceByIdSiembra(
    idSiembra: string,
    predicciones: ICreatePrediccion[],
  ): Promise<void> {
    await this.assertSowingAcceptsPredictions(idSiembra);
    await this.model.deleteMany({ idSiembra });
    if (predicciones.length) {
      await this.model.insertMany(predicciones, { ordered: true });
    }
  }

  private async assertSowingAcceptsPredictions(
    idSiembra: string,
  ): Promise<void> {
    const [tombstone, sowing] = await Promise.all([
      this.tombstoneModel.exists({ idSiembra }),
      this.siembraModel.exists({
        _id: idSiembra,
        activa: { $ne: false },
      }),
    ]);
    if (tombstone || !sowing) {
      throw new BadRequestException(
        'La siembra fue eliminada o cerrada y no admite nuevas predicciones.',
      );
    }
  }
}
