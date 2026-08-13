import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateLorawanUplink,
  IListado,
  ILorawanUplink,
  IQueryParam,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { LorawanUplink, LorawanUplinkDocument } from './modelos/schema';

@Injectable()
export class LorawanUplinksRepository {
  constructor(
    @InjectModel(LorawanUplink.name)
    private readonly model: Model<LorawanUplinkDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<LorawanUplink>> {
    return await dbQuery(this.model, params);
  }

  async create(data: ICreateLorawanUplink): Promise<LorawanUplink> {
    return await this.model.create(data);
  }

  async latest(params: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: number;
  }): Promise<ILorawanUplink[]> {
    const filter: Record<string, any> = {};

    if (params.devEUI) {
      filter.devEUI = params.devEUI.toUpperCase();
    }
    if (params.applicationID) {
      filter.applicationID = params.applicationID;
    }
    if (params.gatewayID) {
      filter.gatewayID = params.gatewayID;
    }

    return await this.model
      .find(filter)
      .sort({ timestamp: -1, fechaCreacion: -1 })
      .limit(params.limit || 20)
      .lean();
  }

  /**
   * Devuelve una sola lectura (la mas reciente) por dispositivo. A diferencia
   * de `latest`, un controlador con muchos uplinks no desplaza del inventario
   * a los demas dispositivos o gateways.
   */
  async latestByDevice(limit = 1000): Promise<ILorawanUplink[]> {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 1000, 5000));

    return await this.model.aggregate<ILorawanUplink>([
      {
        $match: {
          devEUI: { $exists: true, $nin: [null, ''] },
        },
      },
      { $sort: { timestamp: -1, fechaCreacion: -1 } },
      {
        $group: {
          _id: { $toUpper: '$devEUI' },
          uplink: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$uplink' } },
      { $sort: { timestamp: -1, fechaCreacion: -1 } },
      { $limit: safeLimit },
    ]);
  }

  async byDevEUI(devEUI: string, limit = 5000): Promise<ILorawanUplink[]> {
    const upper = devEUI.toUpperCase();
    const lower = devEUI.toLowerCase();

    return await this.model
      .find({ devEUI: { $in: [upper, lower, devEUI] } })
      .sort({ timestamp: 1, fechaCreacion: 1 })
      .limit(Math.max(1, Math.min(Number(limit) || 5000, 20000)))
      .lean();
  }
}
