import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateIndicadorAgrometeorologico,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import {
  IndicadorAgrometeorologico,
  IndicadorAgrometeorologicoDocument,
} from './modelos/schema';

@Injectable()
export class IndicadoresAgrometeorologicosRepository {
  constructor(
    @InjectModel(IndicadorAgrometeorologico.name)
    private readonly model: Model<IndicadorAgrometeorologicoDocument>,
  ) {}

  async getFilter(
    params: IQueryParam,
  ): Promise<IListado<IndicadorAgrometeorologico>> {
    return await dbQuery(this.model, params);
  }

  async upsertMany(data: ICreateIndicadorAgrometeorologico[]) {
    if (!data.length)
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    return await this.model.bulkWrite(
      data.map((item) => ({
        updateOne: {
          filter: {
            idSiembra: item.idSiembra,
            fecha: item.fecha,
            versionCalculo: item.versionCalculo,
          },
          update: { $set: item },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async deleteBySowing(idSiembra: string) {
    return await this.model.deleteMany({ idSiembra });
  }
}
