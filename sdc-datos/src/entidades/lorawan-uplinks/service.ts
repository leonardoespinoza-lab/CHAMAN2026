import { Injectable } from '@nestjs/common';
import {
  ICreateLorawanUplink,
  IDispositivo,
  IFrioAcumulado,
  IReporte,
  IQueryParam,
  IUpdateDispositivo,
  IValoresV2,
} from 'modelos/src';
import { DispositivosService } from '../dispositivos/service';
import { ReportesService } from '../reportes/service';
import { LorawanUplinksRepository } from './repository';
import { decodeSentekUc501Payload } from './sentek-uc501.decoder';
import {
  decodeUc511SentekPayload,
  decodedUc511ToReporteValores,
} from './uc511-sentek.decoder';

const TEMP_FRIO = Number(process.env.TEMP_FRIO || 7);
const HFE_POR_CHILL_PORTION = Number(process.env.HFE_POR_CHILL_PORTION || 28);
const HFE_TABLE: [number, number][] = [
  [-5, 0],
  [0, 0.2],
  [1, 0.45],
  [2, 0.65],
  [3, 0.799],
  [4, 0.905],
  [5, 0.975],
  [6, 1],
  [7, 0.975],
  [8, 0.905],
  [9, 0.799],
  [10, 0.68],
  [11, 0.54],
  [12, 0.407],
  [13, 0.29],
  [14, 0.18],
  [15, 0.08],
  [16, 0],
  [18, 0],
];

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
    const sentekSynced = await this.syncSentekReport(uplink, dispositivo);
    if (!sentekSynced) {
      await this.syncGenericClimateReport(uplink, dispositivo);
    }
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

  async reprocess(query: { devEUI?: string; limit?: string | number }) {
    const devEUI = query.devEUI?.trim().toUpperCase();
    if (!devEUI) {
      return {
        devEUI: null,
        procesados: 0,
        reportesSentek: 0,
        reportesGenericos: 0,
        errores: 0,
        mensaje: 'devEUI requerido',
      };
    }

    const uplinks = await this.repository.byDevEUI(
      devEUI,
      Math.min(Number(query.limit) || 5000, 20000),
    );
    let reportesSentek = 0;
    let reportesGenericos = 0;
    let errores = 0;

    for (const uplink of uplinks) {
      try {
        const dispositivo = await this.dispositivos.upsertFromLorawanUplink(uplink);
        const sentekSynced = await this.syncSentekReport(uplink, dispositivo);
        if (sentekSynced) {
          reportesSentek += 1;
          continue;
        }

        const genericSynced = await this.syncGenericClimateReport(uplink, dispositivo);
        if (genericSynced) {
          reportesGenericos += 1;
        }
      } catch (error) {
        errores += 1;
        console.error(`Error reprocesando uplink ${devEUI}`, error);
      }
    }

    return {
      devEUI,
      procesados: uplinks.length,
      reportesSentek,
      reportesGenericos,
      errores,
    };
  }

  private async syncSentekReport(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo | null,
  ): Promise<boolean> {
    if (!dispositivo?._id || !uplink.devEUI) {
      return false;
    }

    const decoded =
      this.decodeUc511SentekUplink(uplink) ||
      decodeSentekUc501Payload(uplink.data);
    if (!decoded) {
      return false;
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
    return true;
  }

  private decodeUc511SentekUplink(
    uplink: ICreateLorawanUplink,
  ): { valores: IValoresV2['valores']; canales: number[] } | null {
    const raw = (uplink.rawPayload || {}) as Record<string, any>;
    const payloadHex =
      this.getFirstString(
        raw.FRMPayload,
        raw.frmPayload,
        raw.frmpayload,
        raw.payloadHex,
        raw.hexPayload,
        raw.dataHex,
        raw.decoded?.FRMPayload,
        raw.decoded?.frmPayload,
        raw.MACPayload?.FRMPayload,
        raw.macPayload?.frmPayload,
        raw.macPayload?.FRMPayload,
        raw.uplink?.FRMPayload,
        raw.uplink?.frmPayload,
      ) ||
      (this.isLikelyHexPayload(uplink.data) ? uplink.data : undefined) ||
      this.base64PayloadToHex(uplink.data);

    const decoded = decodeUc511SentekPayload(payloadHex);
    if (!decoded) {
      return null;
    }

    return {
      valores: decodedUc511ToReporteValores(decoded),
      canales: decoded.raw.blocks.map((block) => block.channel),
    };
  }

  private async syncGenericClimateReport(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo | null,
  ): Promise<boolean> {
    if (!dispositivo?._id || !uplink.devEUI) {
      return false;
    }

    const devEUI = uplink.devEUI.toUpperCase();
    const reportDate = this.safeDate(uplink.timestamp);
    const decodedObject = this.extractDecodedObject(uplink);
    const valores = this.parseGenericClimateValues(decodedObject);
    const battery = this.getFirstNumber(
      decodedObject.battery,
      decodedObject.batteryLevel,
      decodedObject.bateria,
      decodedObject.bat,
      (uplink.rawPayload as any)?.batteryLevel,
      (uplink.rawPayload as any)?.battery,
    );

    const updateDispositivo: IUpdateDispositivo = {
      fechaUltimaComunicacion: reportDate.toISOString(),
    };

    if (Number.isFinite(battery)) {
      updateDispositivo.bateria = {
        valor: Number(Number(battery).toFixed(2)),
        unidad: '%',
        fecha: reportDate.toISOString(),
      };
    }

    if (!valores) {
      if (battery !== undefined) {
        await this.dispositivos.update(dispositivo._id, updateDispositivo);
      }
      return false;
    }

    const metadataLora = this.buildMetadataLora(uplink);
    const previous = await this.reportes.getByDeveuiAndFecha(
      devEUI,
      reportDate,
      2,
    );
    let reporte: IReporte;

    if (previous?._id) {
      reporte = await this.reportes.update(previous._id, {
        fecha: reportDate.toISOString(),
        estado: 'completo',
        datos: { valores },
        metadataLora,
      });
    } else {
      reporte = await this.reportes.create({
        idDispositivo: dispositivo._id,
        deveui: devEUI,
        fecha: reportDate.toISOString(),
        estado: 'completo',
        datos: { valores },
        metadataLora,
      });
    }

    updateDispositivo.ultimoReporte = reporte;
    const frioAcumulado = this.calcularFrioAcumulado(
      dispositivo,
      reportDate.toISOString(),
      valores,
    );
    if (frioAcumulado) {
      updateDispositivo.frioAcumulado = frioAcumulado;
    }

    await this.dispositivos.update(dispositivo._id, updateDispositivo);
    return true;
  }

  private safeDate(value?: string | Date): Date {
    const parsed = value ? new Date(value) : new Date();
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }

  private extractDecodedObject(
    uplink: ICreateLorawanUplink,
  ): Record<string, any> {
    const raw = uplink.rawPayload || {};
    const candidates = [
      (raw as any).object,
      (raw as any).decodedData,
      (raw as any).decoded_data,
      (raw as any).decoded,
      (raw as any).objectJSON,
      (raw as any).objectJson,
      (raw as any).object_json,
      (raw as any).payload,
      (raw as any).uplink_message?.decoded_payload,
      (raw as any).data?.object,
    ];

    for (const candidate of candidates) {
      const parsed = this.parseObjectCandidate(candidate);
      if (parsed && Object.keys(parsed).length) {
        return parsed;
      }
    }

    return {};
  }

  private parseObjectCandidate(value: unknown): Record<string, any> | null {
    if (!value) return null;
    if (typeof value === 'object') return value as Record<string, any>;
    if (typeof value !== 'string') return null;

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, any>)
        : null;
    } catch {
      return null;
    }
  }

  private parseGenericClimateValues(
    object: Record<string, any>,
  ): IValoresV2['valores'] | null {
    const valores: IValoresV2['valores'] = {};

    const temperatura = this.getFirstNumber(
      object.temperature,
      object.temp,
      object.airTemperature,
      object.temperatura,
      object.t,
    );
    if (Number.isFinite(temperatura)) {
      valores.Temperatura = [this.valueItem(temperatura, 'C')];
    }

    const humedad = this.getFirstNumber(
      object.humidity,
      object.hum,
      object.relativeHumidity,
      object.humedad,
      object.rh,
    );
    if (Number.isFinite(humedad)) {
      valores.Humedad = [this.valueItem(humedad, '%')];
    }

    const lluvia = this.getFirstNumber(
      object.rain,
      object.rainfall,
      object.precipitation,
      object.lluvia,
      object.rain_mm,
    );
    if (Number.isFinite(lluvia)) {
      valores.Pluviometro = [this.valueItem(lluvia, 'mm')];
    }

    const presion = this.getFirstNumber(
      object.pressure,
      object.barometricPressure,
      object.presion,
      object.pressure_hpa,
    );
    if (Number.isFinite(presion)) {
      valores['Presión'] = [this.valueItem(presion, 'hPa')];
    }

    const viento = this.getFirstNumber(
      object.windSpeed,
      object.wind_speed,
      object.viento,
      object.velocidadViento,
    );
    if (Number.isFinite(viento)) {
      valores['Viento Velocidad'] = [this.valueItem(viento, 'km/h')];
    }

    const direccion = this.getFirstNumber(
      object.windDirection,
      object.wind_direction,
      object.direccionViento,
    );
    if (Number.isFinite(direccion)) {
      valores['Viento Dirección'] = [this.valueItem(direccion, 'deg')];
    }

    const radiacion = this.getFirstNumber(
      object.solarRadiation,
      object.radiacion,
      object.radiacionSolar,
      object.solar,
    );
    if (Number.isFinite(radiacion)) {
      valores['Radiación Solar'] = [this.valueItem(radiacion, 'W/m2')];
    }

    const et0 = this.getFirstNumber(
      object.et0,
      object.eto,
      object.evapotranspiration,
      object.evapotranspiracion,
    );
    if (Number.isFinite(et0)) {
      valores['Evapotranspiración'] = [this.valueItem(et0, 'mm')];
    }

    const bateria = this.getFirstNumber(
      object.battery,
      object.batteryLevel,
      object.bateria,
      object.bat,
    );
    if (Number.isFinite(bateria)) {
      valores['Batería'] = [this.valueItem(bateria, '%')];
    }

    return Object.keys(valores).length ? valores : null;
  }

  private valueItem(value: unknown, unidad: string) {
    return {
      unidad,
      valores: {
        actual: Number(Number(value).toFixed(2)),
      },
    };
  }

  private buildMetadataLora(uplink: ICreateLorawanUplink) {
    return {
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
  }

  private getFirstNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private getFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
  }

  private isLikelyHexPayload(value?: string): boolean {
    if (!value) return false;
    const compact = value.replace(/0x/gi, '').replace(/[^a-fA-F0-9]/g, '');
    const nonSeparators = value.replace(/[\s:,-]/g, '');
    return (
      compact.length >= 8 &&
      compact.length % 2 === 0 &&
      compact.length === nonSeparators.length
    );
  }

  private base64PayloadToHex(value?: string): string | undefined {
    if (!value || this.isLikelyHexPayload(value)) return undefined;

    try {
      const buffer = Buffer.from(value, 'base64');
      if (!buffer.length) return undefined;

      const hasSdi12Block = buffer.some(
        (byte, index) => byte === 0x08 && buffer[index + 1] === 0xdb,
      );
      const hasAnalogBlock = buffer.some(
        (byte, index) =>
          byte === 0x03 &&
          buffer[index + 1] === 0x00 &&
          buffer[index + 2] === 0x00 &&
          buffer[index + 3] === 0x04 &&
          buffer[index + 4] === 0x00 &&
          buffer[index + 5] === 0x00,
      );

      return hasSdi12Block || hasAnalogBlock
        ? buffer.toString('hex').toUpperCase()
        : undefined;
    } catch {
      return undefined;
    }
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

  private calcularFrioAcumulado(
    dispositivo: IDispositivo,
    fecha: string,
    valores?: IValoresV2['valores'],
  ): IFrioAcumulado | undefined {
    const temperaturaActual = this.extraerTemperaturaReferencia(valores);
    if (!Number.isFinite(temperaturaActual)) return undefined;

    const previo = dispositivo.frioAcumulado || {};
    let horasFrio = Number(previo.horasFrio || 0);
    let horasFrioEfectivas = Number(previo.horasFrioEfectivas || 0);
    const fechaPrevia =
      previo.fechaUltimoCalculo || dispositivo.ultimoReporte?.fecha;
    const temperaturaPrevia = Number.isFinite(previo.ultimaTemperatura)
      ? Number(previo.ultimaTemperatura)
      : this.extraerTemperaturaReferencia(dispositivo.ultimoReporte?.datos?.valores);

    if (fechaPrevia && Number.isFinite(temperaturaPrevia)) {
      const diffHours =
        (new Date(fecha).getTime() - new Date(fechaPrevia).getTime()) /
        3600000;

      if (diffHours > 0 && diffHours < 24) {
        if (Number(temperaturaPrevia) <= TEMP_FRIO) {
          horasFrio += diffHours;
        }
        horasFrioEfectivas += diffHours * this.hfeFactor(Number(temperaturaPrevia));
      }
    }

    return {
      fechaInicio: previo.fechaInicio || fecha,
      fechaUltimoCalculo: fecha,
      ultimaTemperatura: Number(Number(temperaturaActual).toFixed(2)),
      horasFrio: Number(horasFrio.toFixed(2)),
      horasFrioEfectivas: Number(horasFrioEfectivas.toFixed(2)),
      porcionesFrio: Number(this.calcularPorcionesFrio(horasFrioEfectivas).toFixed(2)),
      factorEfectivoActual: Number(this.hfeFactor(Number(temperaturaActual)).toFixed(3)),
      modelo: 'HF <= 7C + HFE + CP simplificado',
      fuente: 'Sensor LoRa',
    };
  }

  private calcularPorcionesFrio(horasFrioEfectivas: number): number {
    if (!Number.isFinite(horasFrioEfectivas) || HFE_POR_CHILL_PORTION <= 0) return 0;
    return horasFrioEfectivas / HFE_POR_CHILL_PORTION;
  }

  private extraerTemperaturaReferencia(
    valores?: IValoresV2['valores'],
  ): number | undefined {
    const temperaturasAire = valores?.Temperatura
      ?.map((item) => item?.valores?.actual ?? item?.valores?.promedio)
      .filter((valor) => Number.isFinite(valor));

    if (temperaturasAire?.length) {
      return this.promedio(temperaturasAire.map(Number));
    }

    const temperaturasSuelo = valores?.['Temperatura Suelo']
      ?.map((item) => item?.valores?.actual ?? item?.valores?.promedio)
      .filter((valor) => Number.isFinite(valor));

    if (temperaturasSuelo?.length) {
      return this.promedio(temperaturasSuelo.slice(0, 3).map(Number));
    }

    return undefined;
  }

  private promedio(valores: number[]): number {
    return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
  }

  private hfeFactor(temp: number): number {
    if (!Number.isFinite(temp)) return 0;
    if (temp <= HFE_TABLE[0][0]) return HFE_TABLE[0][1];
    if (temp >= HFE_TABLE[HFE_TABLE.length - 1][0]) {
      return HFE_TABLE[HFE_TABLE.length - 1][1];
    }

    for (let i = 0; i < HFE_TABLE.length - 1; i++) {
      const [t1, f1] = HFE_TABLE[i];
      const [t2, f2] = HFE_TABLE[i + 1];
      if (temp >= t1 && temp <= t2) {
        const ratio = (temp - t1) / (t2 - t1);
        return f1 + ratio * (f2 - f1);
      }
    }
    return 0;
  }
}
