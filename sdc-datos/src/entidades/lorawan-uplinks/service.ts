import { Injectable } from '@nestjs/common';
import {
  ICreateLorawanUplink,
  IDispositivo,
  IReporte,
  IQueryParam,
  IValoresV2,
} from 'modelos/src';
import { DispositivosService } from '../dispositivos/service';
import { ReportesService } from '../reportes/service';
import { LorawanUplinksRepository } from './repository';
import { decodeSentekUc501Payload } from './sentek-uc501.decoder';

@Injectable()
export class LorawanUplinksService {
  constructor(
    private readonly repository: LorawanUplinksRepository,
    private readonly dispositivos: DispositivosService,
    private readonly reportes: ReportesService,
  ) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async create(data: ICreateLorawanUplink) {
    const uplink = await this.repository.create(data);
    const dispositivo = await this.dispositivos.upsertFromLorawanUplink(uplink);
    await this.syncSentekReport(uplink, dispositivo);
    return uplink;
  }

  async latest(query: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: string | number;
  }) {
    return await this.repository.latest({
      devEUI: query.devEUI,
      applicationID: query.applicationID,
      gatewayID: query.gatewayID,
      limit: Math.min(Number(query.limit) || 20, 200),
    });
  }

  private async syncSentekReport(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo | null,
  ): Promise<void> {
    if (!dispositivo?._id || !uplink.devEUI) {
      return;
    }

    const decoded = decodeSentekUc501Payload(uplink.data);
    if (!decoded) {
      return;
    }

    const devEUI = uplink.devEUI.toUpperCase();
    const reportDate = this.safeDate(uplink.timestamp);
    const previous = await this.reportes.getRecentPartialByDeveui(
      devEUI,
      reportDate,
      20,
    );
    const valores = previous?.datos?.valores
      ? this.mergeSentekValues(previous.datos.valores, decoded.valores)
      : decoded.valores;
    const estado = this.isSentekReportComplete(valores) ? 'completo' : 'parcial';
    const metadataLora = {
      applicationID: uplink.applicationID,
      applicationName: uplink.applicationName,
      gatewayID: uplink.gatewayID,
      frequency: uplink.frequency,
      fCnt: uplink.fCnt,
      fPort: uplink.fPort,
      rssi: uplink.rssi,
      snr: uplink.snr,
      dr: uplink.dr,
    };

    let reporte: IReporte;
    if (previous?._id) {
      reporte = await this.reportes.update(previous._id, {
        fecha: reportDate.toISOString(),
        estado,
        datos: { valores },
        metadataLora,
      });
    } else {
      reporte = await this.reportes.create({
        idDispositivo: dispositivo._id,
        deveui: devEUI,
        fecha: reportDate.toISOString(),
        estado,
        datos: { valores },
        metadataLora,
      });
    }

    await this.dispositivos.update(dispositivo._id, {
      ultimoReporte: reporte,
      fechaUltimaComunicacion: reportDate.toISOString(),
    });
  }

  private safeDate(value?: string): Date {
    const parsed = value ? new Date(value) : new Date();
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }

  private mergeSentekValues(
    previous: IValoresV2['valores'],
    current: IValoresV2['valores'],
  ): IValoresV2['valores'] {
    const sensors = new Set([...Object.keys(previous), ...Object.keys(current)]);
    const result: IValoresV2['valores'] = {};

    sensors.forEach((sensor) => {
      const oldValues = previous[sensor];
      const newValues = current[sensor];
      const maxLength = Math.max(oldValues?.length || 0, newValues?.length || 0);
      result[sensor] = Array.from({ length: maxLength }, (_, index) => {
        const incoming = newValues?.[index];
        const existing = oldValues?.[index];
        const incomingValue = incoming?.valores?.actual;

        if (incoming && incomingValue !== null && incomingValue !== undefined) {
          return incoming;
        }

        return existing || incoming;
      }).filter(Boolean) as any;
    });

    return result;
  }

  private isSentekReportComplete(valores: IValoresV2['valores']): boolean {
    const countValid = (sensor: keyof IValoresV2['valores']) =>
      (valores[sensor] || []).filter(
        (item) => item?.valores?.actual !== null && item?.valores?.actual !== undefined,
      ).length;

    return (
      countValid('Temperatura Suelo') >= 12 &&
      countValid('Salinidad Suelo') >= 10 &&
      countValid('Humedad Suelo Profundidad') >= 9
    );
  }
}
