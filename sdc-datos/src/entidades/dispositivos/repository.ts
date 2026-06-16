import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateDispositivo,
  IQueryParam,
  ICreateDispositivo,
  ILorawanUplink,
  SensoresV2,
  TipoDispositivo,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Dispositivo, DispositivoDocument } from './modelos/schema';

@Injectable()
export class DispositivosRepository {
  constructor(
    @InjectModel(Dispositivo.name)
    private readonly model: Model<DispositivoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Dispositivo>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Dispositivo> {
    return await this.model
      .findById(id)
      .populate('quimica distribuidor productor')
      .lean();
  }

  async create(data: ICreateDispositivo): Promise<Dispositivo> {
    return await this.model.create(data);
  }

  private inferDeviceFromLorawanUplink(uplink: ILorawanUplink): {
    tipo: TipoDispositivo;
    sensores: SensoresV2[];
  } {
    const text = `${uplink.deviceName || ''} ${uplink.applicationName || ''}`.toLowerCase();

    if (
      text.includes('sentek') ||
      text.includes('lanza') ||
      text.includes('humedad de suelo') ||
      text.includes('soil moisture')
    ) {
      return {
        tipo: 'Sensor de Humedad de Suelo',
        sensores: [
          'Humedad Suelo Profundidad',
          'Temperatura Suelo',
          'Salinidad Suelo',
        ],
      };
    }

    if (text.includes('pluvio') || text.includes('lluvia') || text.includes('rain')) {
      return {
        tipo: 'Pluviometro',
        sensores: ['Pluviometro'],
      };
    }

    if (
      text.includes('meteo') ||
      text.includes('weather') ||
      text.includes('estacion') ||
      text.includes('abrigo') ||
      text.includes('temp y hum') ||
      text.includes('temperatura') ||
      text.includes('humidity') ||
      text.includes('humedad ambiente')
    ) {
      return {
        tipo: 'Estacion Meteorologica',
        sensores: ['Temperatura', 'Humedad', 'Batería'],
      };
    }

    return {
      tipo: 'Otro',
      sensores: ['Otro'],
    };
  }

  async upsertFromLorawanUplink(
    uplink: ILorawanUplink,
  ): Promise<Dispositivo | null> {
    if (!uplink.devEUI) {
      return null;
    }

    const devEUI = uplink.devEUI.toUpperCase();
    const timestamp = uplink.timestamp || new Date().toISOString();
    const inferred = this.inferDeviceFromLorawanUplink(uplink);
    const existing = await this.model.findOne({ deveui: devEUI }).lean();
    const update: IUpdateDispositivo = {
      deveui: devEUI,
      nombre: uplink.deviceName || devEUI,
      tipo: inferred.tipo,
      sensores: inferred.sensores,
      fechaUltimaComunicacion: timestamp,
      metadata: {
        applicationID: uplink.applicationID,
        applicationName: uplink.applicationName,
        gatewayID: uplink.gatewayID,
        frequency: uplink.frequency,
        fCnt: uplink.fCnt,
        fPort: uplink.fPort,
        rssi: uplink.rssi,
        snr: uplink.snr,
        dr: uplink.dr,
      },
    };

    const $set: IUpdateDispositivo = {
      fechaUltimaComunicacion: update.fechaUltimaComunicacion,
      metadata: update.metadata,
    };

    if (existing && !existing.nombre && update.nombre) {
      $set.nombre = update.nombre;
    }

    if (existing && (!existing.tipo || existing.tipo === 'Otro') && update.tipo !== 'Otro') {
      $set.tipo = update.tipo;
    }

    if (existing) {
      const existingSensors = existing.sensores || [];
      const mergedSensors = [
        ...new Set([...existingSensors, ...(update.sensores || [])]),
      ];
      if (mergedSensors.length !== existingSensors.length) {
        $set.sensores = mergedSensors;
      }
    }

    if (existing) {
      return await this.model
        .findOneAndUpdate({ deveui: devEUI }, { $set }, { new: true })
        .lean();
    }

    return await this.model.create(update);
  }

  async update(id: string, data: IUpdateDispositivo): Promise<Dispositivo> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<Dispositivo> {
    return await this.model.findByIdAndDelete(id);
  }
}
