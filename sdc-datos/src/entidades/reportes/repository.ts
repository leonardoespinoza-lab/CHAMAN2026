import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateReporte,
  IQueryParam,
  ICreateReporte,
} from 'modelos/src';
import { Model } from 'mongoose';
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

  async create(data: ICreateReporte): Promise<Reporte> {
    return await this.model.create(data);
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

  async update(id: string, data: IUpdateReporte): Promise<Reporte> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    }).lean();
  }

  async delete(id: string): Promise<Reporte> {
    return await this.model.findByIdAndDelete(id);
  }
}
