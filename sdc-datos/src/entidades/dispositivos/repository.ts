import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateDispositivo,
  IQueryParam,
  ICreateDispositivo,
  IAsignacionDispositivoLote,
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
    const fechaAsignacionLote = data.fechaAsignacionLote || (data.idLote ? new Date().toISOString() : undefined);
    const historialAsignacionesLote =
      data.historialAsignacionesLote ||
      (data.idLote && fechaAsignacionLote
        ? [this.crearSegmentoAsignacion(data, fechaAsignacionLote)]
        : []);

    return await this.model.create({
      ...data,
      fechaAsignacionLote,
      historialAsignacionesLote,
    });
  }

  private inferDeviceFromLorawanUplink(uplink: ILorawanUplink): {
    tipo: TipoDispositivo;
    sensores: SensoresV2[];
  } {
    const text = `${uplink.deviceName || ''} ${uplink.applicationName || ''}`.toLowerCase();

    if (
      this.isUc511SentekUplink(uplink) ||
      text.includes('sentek') ||
      text.includes('lanza') ||
      text.includes('humedad de suelo') ||
      text.includes('soil moisture') ||
      text.includes('uc501') ||
      text.includes('uc511') ||
      text.includes('milesight') ||
      text.includes('napa')
    ) {
      return {
        tipo: 'Sensor de Humedad de Suelo',
        sensores: [
          'Humedad Suelo Profundidad',
          'Temperatura Suelo',
          'Salinidad Suelo',
          'Napa',
          'Batería',
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

  private isUc511SentekUplink(uplink: ILorawanUplink): boolean {
    if (uplink.fPort !== 85) {
      return false;
    }

    const payload = this.getUplinkPayloadText(uplink);
    if (!payload) {
      return false;
    }

    const hex = payload.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (hex.length < 24) {
      return false;
    }

    // UC501/UC511 + Sentek llega por fPort 85 con bloques SDI-12 y/o analogicos.
    // Este patron evita clasificar otros LoRaWAN genericos como lanza.
    return hex.includes('08db') || hex.includes('9c48') || hex.length >= 70;
  }

  private getUplinkPayloadText(uplink: ILorawanUplink): string | undefined {
    const rawPayload = (uplink as any).rawPayload || {};
    const candidates = [
      uplink.data,
      rawPayload.FRMPayload,
      rawPayload.frmPayload,
      rawPayload.frmpayload,
      rawPayload.payloadHex,
      rawPayload.hexPayload,
      rawPayload.dataHex,
      rawPayload.MACPayload?.FRMPayload,
      rawPayload.macPayload?.FRMPayload,
      rawPayload.uplink?.frmPayload,
      rawPayload.object?.frmPayload,
    ];

    return candidates.find((value) => typeof value === 'string' && value.trim());
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
    const inferredName =
      inferred.tipo === 'Sensor de Humedad de Suelo' && this.isUc511SentekUplink(uplink)
        ? `Lanza Sentek / Napa ${devEUI}`
        : devEUI;
    const existing = await this.model.findOne({ deveui: devEUI }).lean();
    const update: IUpdateDispositivo = {
      deveui: devEUI,
      nombre: uplink.deviceName || inferredName,
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
    const updateData: IUpdateDispositivo = { ...data };
    const unsetData: Record<string, 1> = {};
    const cambiaLote = Object.prototype.hasOwnProperty.call(data, 'idLote');
    const cambiaFechaAsignacion = Object.prototype.hasOwnProperty.call(data, 'fechaAsignacionLote');

    if (cambiaLote || cambiaFechaAsignacion) {
      const actual = await this.model
        .findById(id)
        .select('idLote idProductor idEstablecimiento fechaAsignacionLote historialAsignacionesLote')
        .lean();
      const loteAnterior = actual?.idLote ? String(actual.idLote) : '';
      const loteNuevo = cambiaLote ? (data.idLote ? String(data.idLote) : '') : loteAnterior;
      const fechaAsignacion = data.fechaAsignacionLote || actual?.fechaAsignacionLote || new Date().toISOString();

      if (loteAnterior !== loteNuevo) {
        if (loteNuevo) {
          updateData.fechaAsignacionLote = fechaAsignacion;
          updateData.historialAsignacionesLote = this.actualizarHistorialPorCambioDeLote(
            actual,
            data,
            fechaAsignacion,
            loteAnterior,
            loteNuevo,
          );
        } else {
          delete updateData.fechaAsignacionLote;
          unsetData.fechaAsignacionLote = 1;
          updateData.historialAsignacionesLote = this.actualizarHistorialPorCambioDeLote(
            actual,
            data,
            fechaAsignacion,
            loteAnterior,
            loteNuevo,
          );
        }
      } else if (cambiaFechaAsignacion && loteNuevo && data.fechaAsignacionLote) {
        updateData.historialAsignacionesLote = this.actualizarFechaSegmentoActivo(
          actual,
          data,
          data.fechaAsignacionLote,
          loteNuevo,
        );
      }
    }

    const update = Object.keys(unsetData).length
      ? { $set: updateData, $unset: unsetData }
      : updateData;

    return await this.model.findByIdAndUpdate(id, update, {
      new: true,
    });
  }

  async delete(id: string): Promise<Dispositivo> {
    return await this.model.findByIdAndDelete(id);
  }

  private actualizarHistorialPorCambioDeLote(
    actual: Partial<Dispositivo> | null,
    data: IUpdateDispositivo,
    fechaAsignacion: string,
    loteAnterior: string,
    loteNuevo: string,
  ): IAsignacionDispositivoLote[] {
    const fecha = this.normalizarFecha(fechaAsignacion);
    const historial = this.clonarHistorial(actual?.historialAsignacionesLote);

    for (const segmento of historial) {
      const idLoteSegmento = segmento.idLote ? String(segmento.idLote) : '';
      const esSegmentoActual =
        segmento.activa || (!!loteAnterior && idLoteSegmento === loteAnterior && !segmento.fechaHasta);

      if (esSegmentoActual) {
        segmento.activa = false;
        segmento.fechaHasta = segmento.fechaHasta || fecha;
      }
    }

    if (loteNuevo) {
      historial.push(
        this.crearSegmentoAsignacion(
          {
            ...actual,
            ...data,
            idLote: loteNuevo,
          },
          fecha,
        ),
      );
    }

    return historial;
  }

  private actualizarFechaSegmentoActivo(
    actual: Partial<Dispositivo> | null,
    data: IUpdateDispositivo,
    fechaAsignacion: string,
    loteActual: string,
  ): IAsignacionDispositivoLote[] {
    const fecha = this.normalizarFecha(fechaAsignacion);
    const historial = this.clonarHistorial(actual?.historialAsignacionesLote);
    let index = -1;

    for (let i = historial.length - 1; i >= 0; i--) {
      const segmento = historial[i];
      const idLoteSegmento = segmento.idLote ? String(segmento.idLote) : '';
      if (idLoteSegmento === loteActual && (segmento.activa || !segmento.fechaHasta)) {
        index = i;
        break;
      }
    }

    if (index >= 0) {
      historial[index] = {
        ...historial[index],
        activa: true,
        fechaDesde: fecha,
      };
      return historial;
    }

    historial.push(
      this.crearSegmentoAsignacion(
        {
          ...actual,
          ...data,
          idLote: loteActual,
        },
        fecha,
      ),
    );
    return historial;
  }

  private crearSegmentoAsignacion(
    data: Partial<IUpdateDispositivo>,
    fechaDesde: string,
  ): IAsignacionDispositivoLote {
    return {
      idLote: data.idLote ? String(data.idLote) : undefined,
      idProductor: data.idProductor ? String(data.idProductor) : undefined,
      idEstablecimiento: data.idEstablecimiento ? String(data.idEstablecimiento) : undefined,
      fechaDesde: this.normalizarFecha(fechaDesde),
      activa: true,
    };
  }

  private clonarHistorial(historial?: IAsignacionDispositivoLote[]): IAsignacionDispositivoLote[] {
    return Array.isArray(historial) ? historial.map((segmento) => ({ ...segmento })) : [];
  }

  private normalizarFecha(fecha?: string): string {
    const parsed = fecha ? new Date(fecha) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }
}
