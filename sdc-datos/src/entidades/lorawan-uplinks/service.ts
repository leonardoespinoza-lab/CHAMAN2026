import { Injectable } from '@nestjs/common';
import {
  ICreateLorawanUplink,
  IDispositivo,
  IFrioAcumulado,
  ILorawanRawFrame,
  IReporte,
  IQueryParam,
  IUpdateDispositivo,
  IValoresV2,
} from 'modelos/src';
import { DispositivosService } from '../dispositivos/service';
import { ReportesService } from '../reportes/service';
import { LorawanUplinksRepository } from './repository';
import { decodeControllerUplink } from './controller-decoder.registry';

const HF_PREVIEW_VERSION = 'hf-field-preview-1.0.0';

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

  async latestByDevice(limit?: string | number) {
    return await this.repository.latestByDevice(
      Math.min(Number(limit) || 1000, 5000),
    );
  }

  async rawHistory(query: {
    devEUI?: string;
    days?: string | number;
    limit?: string | number;
  }): Promise<ILorawanRawFrame[]> {
    const devEUI = query.devEUI?.trim().toUpperCase();
    if (!devEUI) return [];
    const days = Math.max(1, Math.min(Number(query.days) || 7, 365));
    const limit = Math.max(1, Math.min(Number(query.limit) || 5000, 20000));
    const since = Date.now() - days * 86_400_000;
    const uplinks = await this.repository.recentByDevEUI(devEUI, limit);
    const dispositivo = await this.dispositivos
      .getFilter({ filter: JSON.stringify({ deveui: devEUI }), limit: 1 })
      .then((result: any) => result?.datos?.[0] as IDispositivo | undefined)
      .catch(() => undefined);

    return uplinks
      .filter(
        (uplink) =>
          this.safeDate(uplink.timestamp || uplink.fechaCreacion).getTime() >=
          since,
      )
      .map((uplink) => this.toRawFrame(uplink, dispositivo));
  }

  async reprocess(query: {
    devEUI?: string;
    limit?: string | number;
    replace?: string | boolean;
  }) {
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
    const replace = query.replace === true || query.replace === 'true';
    const reportesEliminados = replace
      ? await this.reportes.deleteByDeveui(devEUI)
      : 0;
    let reportesSentek = 0;
    let reportesGenericos = 0;
    let errores = 0;

    for (const uplink of uplinks) {
      try {
        const dispositivo =
          await this.dispositivos.upsertFromLorawanUplink(uplink);
        const sentekSynced = await this.syncSentekReport(uplink, dispositivo);
        if (sentekSynced) {
          reportesSentek += 1;
          continue;
        }

        const genericSynced = await this.syncGenericClimateReport(
          uplink,
          dispositivo,
        );
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
      reportesEliminados,
    };
  }

  private async syncSentekReport(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo | null,
  ): Promise<boolean> {
    if (!dispositivo?._id || !uplink.devEUI) {
      return false;
    }

    const decoded = decodeControllerUplink(uplink, dispositivo);
    if (!decoded) {
      return false;
    }

    const devEUI = uplink.devEUI.toUpperCase();
    const reportDate = this.safeDate(uplink.timestamp);
    const existing = await this.reportes.getByDeveuiAndFecha(
      devEUI,
      reportDate,
      2,
    );
    const recent = await this.reportes.getRecentByDeveui(
      devEUI,
      reportDate,
      360,
    );
    const previous =
      existing || this.reporteCompatibleConCiclo(recent, decoded.cycleChannels);
    const valores = previous?.datos?.valores
      ? this.mergeSentekValues(previous.datos.valores, decoded.valores)
      : decoded.valores;
    const estado = this.isSentekReportComplete(valores)
      ? 'completo'
      : 'parcial';
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
      payloadDecoderId: decoded.decoderId,
      payloadDecoderVersion: decoded.decoderVersion,
      controllerManufacturer: decoded.manufacturer,
      controllerModel: decoded.model,
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

    const updateDispositivo: IUpdateDispositivo = {
      fechaUltimaComunicacion: reportDate.toISOString(),
    };

    if (this.shouldPromoteSentekReport(reporte, dispositivo.ultimoReporte)) {
      updateDispositivo.ultimoReporte = reporte;
    }

    await this.dispositivos.update(dispositivo._id, updateDispositivo);
    return true;
  }

  private shouldPromoteSentekReport(
    reporte: IReporte,
    ultimoReporte?: IReporte,
  ): boolean {
    if (!ultimoReporte) {
      return true;
    }

    const calidadNueva = this.sentekReportQuality(reporte);
    const calidadActual = this.sentekReportQuality(ultimoReporte);

    if (reporte.estado === 'completo') {
      return true;
    }

    if (ultimoReporte.estado !== 'completo') {
      return calidadNueva.total >= calidadActual.total;
    }

    const pierdeHumedad =
      calidadActual.humedad > 0 && calidadNueva.humedad === 0;

    return !pierdeHumedad && calidadNueva.total >= calidadActual.total;
  }

  private sentekReportQuality(reporte?: IReporte): {
    humedad: number;
    salinidad: number;
    temperatura: number;
    total: number;
  } {
    const valores = reporte?.datos?.valores || {};
    const countValid = (sensor: keyof IValoresV2['valores']) =>
      (valores[sensor] || []).filter(
        (item) =>
          item?.valores?.actual !== null && item?.valores?.actual !== undefined,
      ).length;
    const humedad = countValid('Humedad Suelo Profundidad');
    const salinidad = countValid('Salinidad Suelo');
    const temperatura = countValid('Temperatura Suelo');

    return {
      humedad,
      salinidad,
      temperatura,
      total: humedad + salinidad + temperatura,
    };
  }

  private toRawFrame(
    uplink: ICreateLorawanUplink & { _id?: string; fechaCreacion?: string },
    dispositivo?: IDispositivo,
  ): ILorawanRawFrame {
    const decoded = decodeControllerUplink(uplink, dispositivo);
    const readings = decoded?.readings || [];
    return {
      id: (uplink as any)._id?.toString?.() || (uplink as any)._id,
      devEUI: String(uplink.devEUI || '').toUpperCase(),
      timestamp: this.safeDate(
        uplink.timestamp || (uplink as any).fechaCreacion,
      ).toISOString(),
      fCnt: uplink.fCnt,
      fPort: uplink.fPort,
      gatewayID: uplink.gatewayID,
      rssi: uplink.rssi,
      snr: uplink.snr,
      frequency: uplink.frequency,
      dr: uplink.dr,
      payloadHex: decoded?.payloadHex,
      payloadBase64: uplink.data,
      decoderId: decoded?.decoderId,
      decoderVersion: decoded?.decoderVersion,
      controllerManufacturer: decoded?.manufacturer,
      controllerModel: decoded?.model,
      decodeStatus: readings.length ? 'decoded' : 'unrecognized',
      readings,
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
          (byte === 0x05 || byte === 0x06) &&
          (buffer[index + 1] === 0xe2 || buffer[index + 1] === 0x02),
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
    const sensors = new Set([
      ...Object.keys(previous),
      ...Object.keys(current),
    ]);
    const result: IValoresV2['valores'] = {};

    sensors.forEach((sensor) => {
      const oldValues = previous[sensor];
      const newValues = current[sensor];
      const maxLength = Math.max(
        oldValues?.length || 0,
        newValues?.length || 0,
      );
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

  private reporteCompatibleConCiclo(
    reporte: IReporte | null,
    incomingChannels: number[],
  ): IReporte | null {
    if (!reporte) {
      return null;
    }

    // La entrada 4-20 mA es otro sensor fisico del mismo controlador.
    // Puede completar el reporte reciente sin participar del ciclo de 12 canales SDI-12.
    if (!incomingChannels.length) return reporte;

    const previousChannels = this.sentekChannelsInReport(reporte);
    const repeatedChannel = incomingChannels.some((channel) =>
      previousChannels.has(channel),
    );
    return repeatedChannel ? null : reporte;
  }

  private sentekChannelsInReport(reporte: IReporte): Set<number> {
    const channels = new Set<number>();
    const valores = reporte.datos?.valores || {};
    const groups: Array<{
      sensor: keyof IValoresV2['valores'];
      offset: number;
    }> = [
      { sensor: 'Humedad Suelo Profundidad', offset: 0 },
      { sensor: 'Salinidad Suelo', offset: 4 },
      { sensor: 'Temperatura Suelo', offset: 8 },
    ];

    groups.forEach(({ sensor, offset }) => {
      const rows = valores[sensor] || [];
      for (let group = 0; group < 4; group += 1) {
        const start = group * 3;
        const hasValue = rows
          .slice(start, start + 3)
          .some(
            (row) =>
              row?.valores?.actual !== null &&
              row?.valores?.actual !== undefined,
          );
        if (hasValue) channels.add(offset + group);
      }
    });

    return channels;
  }

  private isSentekReportComplete(valores: IValoresV2['valores']): boolean {
    const countValid = (sensor: keyof IValoresV2['valores']) =>
      (valores[sensor] || []).filter(
        (item) =>
          item?.valores?.actual !== null && item?.valores?.actual !== undefined,
      ).length;

    return (
      countValid('Temperatura Suelo') >= 12 &&
      countValid('Salinidad Suelo') >= 12 &&
      countValid('Humedad Suelo Profundidad') >= 12
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
    const temporadaInicio = this.inicioTemporadaFrio(fecha);
    const mismaTemporada =
      previo.versionModelo === HF_PREVIEW_VERSION &&
      previo.temporadaInicio === temporadaInicio;
    let horasFrio = mismaTemporada ? Number(previo.horasFrio || 0) : 0;
    const fechaPrevia = mismaTemporada
      ? previo.fechaUltimoCalculo || dispositivo.ultimoReporte?.fecha
      : undefined;
    const temperaturaPrevia =
      mismaTemporada && Number.isFinite(previo.ultimaTemperatura)
        ? Number(previo.ultimaTemperatura)
        : this.extraerTemperaturaReferencia(
            dispositivo.ultimoReporte?.datos?.valores,
          );

    if (fechaPrevia && Number.isFinite(temperaturaPrevia)) {
      const diffHours =
        (new Date(fecha).getTime() - new Date(fechaPrevia).getTime()) / 3600000;

      if (diffHours > 0 && diffHours < 24) {
        if (
          Number(temperaturaPrevia) >= 0 &&
          Number(temperaturaPrevia) <= 7.2
        ) {
          horasFrio += diffHours;
        }
      }
    }

    return {
      temporadaInicio,
      fechaInicio: mismaTemporada ? previo.fechaInicio || fecha : fecha,
      fechaUltimoCalculo: fecha,
      ultimaTemperatura: Number(Number(temperaturaActual).toFixed(2)),
      horasFrio: Number(horasFrio.toFixed(2)),
      modelo:
        'Vista previa HF 0-7,2 C del sensor; Utah y Dynamic Model se calculan con la serie horaria canonica.',
      versionModelo: HF_PREVIEW_VERSION,
      estadoCalculo: 'preview',
      fuente: 'Sensor LoRa',
    };
  }

  private inicioTemporadaFrio(fechaIso: string): string {
    const fecha = new Date(fechaIso);
    const year =
      fecha.getUTCMonth() >= 4
        ? fecha.getUTCFullYear()
        : fecha.getUTCFullYear() - 1;
    return `${year}-05-01`;
  }

  private extraerTemperaturaReferencia(
    valores?: IValoresV2['valores'],
  ): number | undefined {
    const temperaturasAire = valores?.Temperatura?.map(
      (item) => item?.valores?.actual ?? item?.valores?.promedio,
    ).filter((valor) => Number.isFinite(valor));

    if (temperaturasAire?.length) {
      return this.promedio(temperaturasAire.map(Number));
    }

    // Los modelos de frio requieren temperatura de aire. Una sonda de suelo
    // puede alimentar el modulo edafico, pero nunca sustituye esta variable.
    return undefined;
  }

  private promedio(valores: number[]): number {
    return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
  }
}
