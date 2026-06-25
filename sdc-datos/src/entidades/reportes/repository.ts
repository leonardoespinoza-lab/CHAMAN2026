import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateReporte,
  IQueryParam,
  ICreateReporte,
} from 'modelos/src';
import { FilterQuery, Model, Types } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Reporte, ReporteDocument } from './modelos/schema';

@Injectable()
export class ReportesRepository {
  constructor(
    @InjectModel(Reporte.name)
    private readonly model: Model<ReporteDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Reporte>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Reporte> {
    return await this.model.findById(id).populate('dispositivo').lean();
  }

  async historico(
    dispositivo: string,
    options: { dias: number; limit: number },
  ): Promise<IListado<Reporte>> {
    const since = new Date();
    since.setDate(since.getDate() - options.dias);

    const devEuis = new Set([dispositivo, dispositivo.toUpperCase()]);
    const matchDispositivo: FilterQuery<Reporte>[] = [...devEuis].map(
      (deveui) => ({ deveui }),
    );

    if (Types.ObjectId.isValid(dispositivo)) {
      matchDispositivo.push({ idDispositivo: new Types.ObjectId(dispositivo) });
    }

    const filter: FilterQuery<Reporte> = {
      $and: [
        { $or: matchDispositivo },
        {
          $or: [
            { fecha: { $gte: since } },
            { fechaCreacion: { $gte: since } },
          ],
        },
      ],
    };

    const datos = await this.model
      .find(filter)
      .sort({ fecha: 1, fechaCreacion: 1 })
      .limit(options.limit)
      .lean();

    return {
      totalCount: datos.length,
      datos,
    };
  }

  async create(data: ICreateReporte): Promise<Reporte> {
    return await this.model.create(data);
  }

  async deleteByDeveui(deveui: string): Promise<number> {
    const result = await this.model.deleteMany({
      deveui: { $in: [deveui, deveui.toUpperCase(), deveui.toLowerCase()] },
    });

    return result.deletedCount || 0;
  }

  async getRecentPartialByDeveui(
    deveui: string,
    referenceDate: Date,
    windowMinutes = 20,
  ): Promise<Reporte | null> {
    const minDate = new Date(referenceDate.getTime() - windowMinutes * 60 * 1000);
    const maxDate = new Date(referenceDate.getTime() + windowMinutes * 60 * 1000);

    return await this.model
      .findOne({
        deveui,
        estado: 'parcial',
        fecha: { $gte: minDate, $lte: maxDate },
      })
      .sort({ fecha: -1, fechaCreacion: -1 })
      .lean();
  }

  async getByDeveuiAndFecha(
    deveui: string,
    referenceDate: Date,
    windowSeconds = 1,
  ): Promise<Reporte | null> {
    const minDate = new Date(referenceDate.getTime() - windowSeconds * 1000);
    const maxDate = new Date(referenceDate.getTime() + windowSeconds * 1000);

    return await this.model
      .findOne({
        deveui,
        fecha: { $gte: minDate, $lte: maxDate },
      })
      .sort({ fecha: -1, fechaCreacion: -1 })
      .lean();
  }

  async update(id: string, data: IUpdateReporte): Promise<Reporte> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    }).lean();
  }

  async delete(id: string): Promise<Reporte> {
    return await this.model.findByIdAndDelete(id);
  }
}
