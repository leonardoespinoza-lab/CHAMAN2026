import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ICreateCamara, IListado, IQueryParam, IUpdateCamara } from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Camara, CamaraDocument } from './modelos/schema';

@Injectable()
export class CamarasRepository {
  constructor(
    @InjectModel(Camara.name)
    private readonly model: Model<CamaraDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Camara>> {
    return await dbQuery(this.model, params);
  }

  async getBySerial(serialCamara: string): Promise<Camara> {
    return await this.model.findOne({ serialCamara: this.normalizarSerial(serialCamara) }).lean();
  }

  async upsertMany(camaras: ICreateCamara[]): Promise<IListado<Camara>> {
    const datos = camaras
      .map((camara) => ({
        ...camara,
        serialCamara: this.normalizarSerial(camara.serialCamara),
      }))
      .filter((camara) => !!camara.serialCamara);

    if (!datos.length) {
      return { datos: [], totalCount: 0 };
    }

    await this.model.bulkWrite(
      datos.map((camara) => ({
        updateOne: {
          filter: { serialCamara: camara.serialCamara },
          update: {
            $set: camara,
            $setOnInsert: { fechaCreacion: new Date().toISOString() },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const seriales = datos.map((camara) => camara.serialCamara);
    const registros = await this.model
      .find({ serialCamara: { $in: seriales } })
      .sort('nombre')
      .lean();

    return {
      datos: registros,
      totalCount: registros.length,
    };
  }

  async update(serialCamara: string, data: IUpdateCamara): Promise<Camara> {
    return await this.model
      .findOneAndUpdate(
        { serialCamara: this.normalizarSerial(serialCamara) },
        { $set: data },
        { new: true },
      )
      .lean();
  }

  private normalizarSerial(value: unknown): string {
    return String(value || '').trim().toUpperCase();
  }
}
