import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateObservacionMeteorologica,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import {
  ObservacionMeteorologica,
  ObservacionMeteorologicaDocument,
} from './modelos/schema';

@Injectable()
export class ObservacionesMeteorologicasRepository {
  constructor(
    @InjectModel(ObservacionMeteorologica.name)
    private readonly model: Model<ObservacionMeteorologicaDocument>,
  ) {}

  async getFilter(
    params: IQueryParam,
  ): Promise<IListado<ObservacionMeteorologica>> {
    return await dbQuery(this.model, params);
  }

  async upsertMany(data: ICreateObservacionMeteorologica[]) {
    if (!data.length)
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    return await this.model.bulkWrite(
      data.map((item) => {
        const { contextosLote: _ignoredContexts, ...payload } = item;
        const update: Record<string, unknown> = { ...payload };
        if (item.idLote) {
          update[`contextosLote.${this.safeContextKey(item.idLote)}`] =
            payload;
        }
        return {
          updateOne: {
            filter: {
              idEstablecimiento: item.idEstablecimiento,
              timestamp: new Date(item.timestamp),
              granularidad: item.granularidad,
            },
            update: { $set: update },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
  }

  private safeContextKey(value: string): string {
    return String(value).replace(/[.$]/g, '_');
  }

  async deleteRange(idEstablecimiento: string, desde: string, hasta: string) {
    return await this.model.deleteMany({
      idEstablecimiento,
      timestamp: { $gte: new Date(desde), $lte: new Date(hasta) },
    });
  }
}
