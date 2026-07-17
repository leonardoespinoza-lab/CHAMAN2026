import { Injectable, Logger } from '@nestjs/common';
import {
  ICreateReporte,
  IDispositivo,
  IFilter,
  IMetaDataLora,
  IQueryParam,
  IReporte,
  IUpdateDispositivo,
  IValoresV2,
  IFrioAcumulado,
} from 'modelos/src';
import { ReportesRepository } from './repository';
import { Event, Uplink } from 'src/auxiliares/chirpstack/interfaces';
import { DispositivosService } from '../dispositivos/service';

const MERGE_WINDOW_MINUTES = 5;
const HF_PREVIEW_VERSION = 'hf-field-preview-1.0.0';

// --- CONFIGURACIÓN DE PARSERS ---

// 1. Interfaz que define la estructura de una configuración de parser.
export interface LanzaParserConfig {
  profundidades: number[];
  humedadKeys: string[];
  temperaturaKeys: string[];
}

// 2. Objeto de configuración para la lanza de 9 sensores.
export const SENTEK_9_CONFIG: LanzaParserConfig = {
  profundidades: [5, 15, 25, 35, 45, 55, 65, 75, 85],
  humedadKeys: ['sdi12_1', 'sdi12_2', 'sdi12_3'],
  temperaturaKeys: ['sdi12_4', 'sdi12_5', 'sdi12_6'],
};

// 3. Objeto de configuración para la lanza de 12 sensores.
export const SENTEK_12_CONFIG: LanzaParserConfig = {
  profundidades: [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115],
  humedadKeys: ['sdi12_1', 'sdi12_2', 'sdi12_3', 'sdi12_4'],
  temperaturaKeys: ['sdi12_5', 'sdi12_6', 'sdi12_7', 'sdi12_8'],
};

@Injectable()
export class ReportesService {
  private readonly logger = new Logger(ReportesService.name);

  constructor(
    private readonly repository: ReportesRepository,
    private readonly dispositivos: DispositivosService,
  ) {}

  public async procesarReporte(
    uplink: Uplink,
    event: Event,
    parserConfig?: LanzaParserConfig,
  ): Promise<void> {
    const devEui = this.getDevEui(uplink);
    if (!devEui) {
      this.logger.warn('Uplink recibido sin devEUI.');
      return;
    }

    const dispositivo = await this.dispositivos.getByDeveui(devEui);
    if (!dispositivo) {
      this.logger.error(`Dispositivo con deveui ${devEui} no encontrado.`);
      return;
    }

    switch (event) {
      case 'up':
        if (!parserConfig) {
          this.logger.error(
            `El evento 'up' para ${devEui} fue llamado sin una configuración de parser.`,
          );
          return;
        }

        if (parserConfig === SENTEK_12_CONFIG) {
          return this.handleUplinkEventSentek12(
            uplink,
            dispositivo,
            parserConfig,
          );
        } else {
          return this.handleUplinkEvent(uplink, dispositivo, parserConfig);
        }

      case 'status':
        return this.handleStatusEvent(uplink, dispositivo);

      default:
        this.logger.log(
          `Evento '${event}' para ${devEui} ignorado por no ser relevante.`,
        );
    }
  }

  public async procesarUplinkMqtt(
    uplink: Uplink,
    topic?: string,
  ): Promise<void> {
    const event = this.getEventFromTopic(topic) || 'up';

    if (event === 'status') {
      return this.procesarReporte(uplink, event);
    }

    if (event !== 'up') {
      this.logger.log(
        `Evento MQTT '${event}' para ${uplink.deviceInfo?.devEui || '--'} ignorado.`,
      );
      return;
    }

    const sentekConfig = this.inferirConfiguracionSentek(uplink.object);
    if (sentekConfig) {
      return this.procesarReporte(uplink, 'up', sentekConfig);
    }

    return this.handleGenericClimateUplink(uplink);
  }

  private async handleGenericClimateUplink(uplink: Uplink): Promise<void> {
    const devEui = this.getDevEui(uplink);
    if (!devEui) {
      this.logger.warn('Uplink MQTT generico sin devEUI.');
      return;
    }

    const dispositivo = await this.dispositivos.getByDeveui(devEui);
    if (!dispositivo) {
      this.logger.warn(`Dispositivo con deveui ${devEui} no encontrado.`);
      return;
    }

    const valores = this.parsearDatosClimaticosGenericos(uplink);
    if (!valores) {
      this.logger.log(
        `Uplink MQTT para ${devEui} sin datos climaticos genericos parseables.`,
      );
      return;
    }

    const fecha = new Date(uplink.time || Date.now()).toISOString();
    const reporteCreado = await this.repository.create({
      deveui: dispositivo.deveui,
      idDispositivo: dispositivo._id,
      fecha,
      datos: { valores },
      metadataLora: this.buildMetadataLora(uplink),
      estado: 'completo',
    });

    const updateDispositivo: IUpdateDispositivo = {
      fechaUltimaComunicacion: fecha,
      ultimoReporte: reporteCreado,
    };

    const frioAcumulado = this.calcularFrioAcumulado(
      dispositivo,
      fecha,
      reporteCreado.datos?.valores,
    );
    if (frioAcumulado) {
      updateDispositivo.frioAcumulado = frioAcumulado;
    }

    const bateria = this.getFirstNumber(
      uplink.object?.battery,
      uplink.object?.batteryLevel,
      uplink.batteryLevel,
    );
    if (Number.isFinite(bateria)) {
      updateDispositivo.bateria = {
        valor: Number(bateria),
        unidad: '%',
        fecha,
      };
    }

    await this.dispositivos.update(dispositivo._id, updateDispositivo);
    this.logger.log(
      `Reporte climatico MQTT procesado para ${dispositivo.deveui}.`,
    );
  }

  private async handleStatusEvent(
    uplink: Uplink,
    dispositivo: IDispositivo,
  ): Promise<void> {
    const fecha = new Date(uplink.time).toISOString();
    this.logger.log(`Procesando evento 'status' para ${dispositivo.deveui}`);

    if (uplink.batteryLevel === undefined) {
      this.logger.warn(
        `Evento 'status' para ${dispositivo.deveui} no contenía nivel de batería.`,
      );
      // Aún así actualizamos la fecha de comunicación
      await this.dispositivos.update(dispositivo._id, {
        fechaUltimaComunicacion: fecha,
      });
      return;
    }

    const updatePayload: IUpdateDispositivo = {
      fechaUltimaComunicacion: fecha,
      bateria: {
        valor: uplink.batteryLevel,
        unidad: '%',
        fecha,
      },
    };

    await this.dispositivos.update(dispositivo._id, updatePayload);
    this.logger.log(
      `Dispositivo ${dispositivo.deveui} actualizado. Batería: ${uplink.batteryLevel}%.`,
    );
  }

  private async handleUplinkEvent(
    uplink: Uplink,
    dispositivo: IDispositivo,
    config: LanzaParserConfig,
  ) {
    const fecha = new Date(uplink.time).toISOString();
    this.logger.log(`Procesando reporte completo para ${dispositivo.deveui}`);

    const datosSuelo = this.parsearDatosSuelo(uplink.object, config);
    if (!datosSuelo) {
      this.logger.warn(
        `El uplink para ${dispositivo.deveui} no contenía datos parseables.`,
      );
      return;
    }

    const createReporte: ICreateReporte = {
      deveui: dispositivo.deveui,
      idDispositivo: dispositivo._id,
      fecha,
      datos: { valores: datosSuelo },
      metadataLora: this.buildMetadataLora(uplink),
      estado: 'completo', // Los reportes de este handler siempre son completos
    };

    const reporteCreado = await this.repository.create(createReporte);

    const updateDispositivo: IUpdateDispositivo = {
      fechaUltimaComunicacion: fecha,
      ultimoReporte: reporteCreado,
    };
    const frioAcumulado = this.calcularFrioAcumulado(
      dispositivo,
      fecha,
      reporteCreado.datos?.valores,
    );
    if (frioAcumulado) {
      updateDispositivo.frioAcumulado = frioAcumulado;
    }

    await this.dispositivos.update(dispositivo._id, updateDispositivo);
    this.logger.log(
      `Dispositivo ${dispositivo.deveui} actualizado con nuevo reporte ${reporteCreado._id}.`,
    );
  }

  private async handleUplinkEventSentek12(
    uplink: Uplink,
    dispositivo: IDispositivo,
    config: LanzaParserConfig,
  ) {
    const fecha = new Date(uplink.time).toISOString();
    const { deveui } = dispositivo;
    this.logger.log(`Procesando reporte parcial para Sentek12: ${deveui}`);

    const datosNuevos = this.parsearDatosSuelo(uplink.object, config);
    if (!datosNuevos) {
      this.logger.warn(
        `El uplink para ${deveui} no contenía datos parseables.`,
      );
      return;
    }

    const fechaUplink = new Date(uplink.time);
    const startDate = new Date(
      fechaUplink.getTime() - MERGE_WINDOW_MINUTES * 60 * 1000,
    );
    const endDate = new Date(
      fechaUplink.getTime() + MERGE_WINDOW_MINUTES * 60 * 1000,
    );

    const reporteExistente = await this.ultimoReportePorDeveuiYFecha(
      deveui,
      startDate.toISOString(),
      endDate.toISOString(),
    );

    let reporteFinal: IReporte;

    if (reporteExistente) {
      this.logger.log(
        `Encontrado reporte parcial existente (${reporteExistente._id}). Actualizando...`,
      );
      const datosCombinados = this.combinarDatos(
        reporteExistente.datos.valores,
        datosNuevos,
      );

      const estaCompleto = this.isReporteCompleto(datosCombinados, config);

      const updateReporte: Partial<IReporte> = {
        datos: { valores: datosCombinados },
        estado: estaCompleto ? 'completo' : 'parcial',
        metadataLora: this.buildMetadataLora(uplink),
      };

      // Asumimos que el método update devuelve el documento actualizado
      reporteFinal = await this.repository.update(
        reporteExistente._id,
        updateReporte,
      );
      this.logger.log(
        `Reporte ${reporteFinal._id} actualizado. Estado: ${reporteFinal.estado}`,
      );
    } else {
      this.logger.log(
        `No se encontró reporte parcial. Creando uno nuevo para ${deveui}...`,
      );
      const createReporte: ICreateReporte = {
        deveui: deveui,
        idDispositivo: dispositivo._id,
        fecha,
        datos: { valores: datosNuevos },
        metadataLora: this.buildMetadataLora(uplink),
        estado: 'parcial',
      };
      reporteFinal = await this.repository.create(createReporte);
    }

    // Finalmente, actualizamos el dispositivo una sola vez
    const updateDispositivo: IUpdateDispositivo = {
      fechaUltimaComunicacion: fecha,
      ultimoReporte: reporteFinal,
    };
    const frioAcumulado = this.calcularFrioAcumulado(
      dispositivo,
      fecha,
      reporteFinal.datos?.valores,
    );
    if (frioAcumulado) {
      updateDispositivo.frioAcumulado = frioAcumulado;
    }
    await this.dispositivos.update(dispositivo._id, updateDispositivo);
    this.logger.log(
      `Dispositivo ${deveui} actualizado con reporte ${reporteFinal._id}.`,
    );
  }

  // --- FUNCIONES HELPER ---

  private parsearDatosSuelo(
    datosSuelo: Uplink['object'],
    config: LanzaParserConfig,
  ): IValoresV2['valores'] | null {
    if (!datosSuelo) return null;

    const parseValores = (str: string) =>
      str ? str.split('+').slice(1).map(parseFloat) : [];

    const totalSensores = config.profundidades.length;
    // Creamos arrays pre-llenados con null para asegurar que siempre tengan la longitud correcta.
    const humedades = Array(totalSensores).fill(null);
    const temperaturas = Array(totalSensores).fill(null);

    // Procesamos las keys de humedad
    config.humedadKeys.forEach((key, keyIndex) => {
      if (datosSuelo[key]) {
        const valoresParseados = parseValores(datosSuelo[key]);
        valoresParseados.forEach((valor, valorIndex) => {
          // Calculamos el índice final en el array de 12 sensores.
          const finalIndex = keyIndex * 3 + valorIndex;
          if (finalIndex < totalSensores) {
            humedades[finalIndex] = valor;
          }
        });
      }
    });

    // Hacemos lo mismo para las keys de temperatura
    config.temperaturaKeys.forEach((key, keyIndex) => {
      if (datosSuelo[key]) {
        const valoresParseados = parseValores(datosSuelo[key]);
        valoresParseados.forEach((valor, valorIndex) => {
          const finalIndex = keyIndex * 3 + valorIndex;
          if (finalIndex < totalSensores) {
            temperaturas[finalIndex] = valor;
          }
        });
      }
    });

    // Si después de todo el proceso no se parseó ni un solo valor, retornamos null.
    if (
      humedades.every((v) => v === null) &&
      temperaturas.every((v) => v === null)
    ) {
      return null;
    }

    // Finalmente, construimos el objeto de retorno con los arrays correctamente poblados.
    return {
      'Humedad Suelo Profundidad': config.profundidades.map((p, i) => ({
        profundidad: p,
        unidad: '%',
        valores: { actual: humedades[i] },
      })),
      'Temperatura Suelo': config.profundidades.map((p, i) => ({
        profundidad: p,
        unidad: '°C',
        valores: { actual: temperaturas[i] },
      })),
    };
  }

  private combinarDatos(
    datosViejos: IValoresV2['valores'],
    datosNuevos: IValoresV2['valores'],
  ) {
    // Función helper para combinar dos arrays de sensores por su índice
    const combinarArrayDeSensores = (arrViejo, arrNuevo) => {
      return arrViejo.map((datoViejo, index) => {
        const datoNuevo = arrNuevo[index];
        // Si el nuevo dato para este índice tiene un valor real, lo usamos.
        // Si no, conservamos el dato viejo que ya teníamos.
        if (datoNuevo && datoNuevo.valores.actual !== null) {
          return datoNuevo;
        }
        return datoViejo;
      });
    };

    const humedadCombinada = combinarArrayDeSensores(
      datosViejos['Humedad Suelo Profundidad'],
      datosNuevos['Humedad Suelo Profundidad'],
    );

    const temperaturaCombinada = combinarArrayDeSensores(
      datosViejos['Temperatura Suelo'],
      datosNuevos['Temperatura Suelo'],
    );

    return {
      'Humedad Suelo Profundidad': humedadCombinada,
      'Temperatura Suelo': temperaturaCombinada,
    };
  }

  private isReporteCompleto(
    datos: IValoresV2['valores'],
    config: LanzaParserConfig,
  ) {
    // Un reporte está completo si todas las profundidades tienen un valor
    const totalProfundidades = config.profundidades.length;
    const humedadesCompletas = datos['Humedad Suelo Profundidad'].filter(
      (d) => d.valores.actual !== null,
    ).length;
    const temperaturasCompletas = datos['Temperatura Suelo'].filter(
      (d) => d.valores.actual !== null,
    ).length;

    return (
      humedadesCompletas === totalProfundidades &&
      temperaturasCompletas === totalProfundidades
    );
  }

  private parsearDatosClimaticosGenericos(
    uplink: Uplink,
  ): IValoresV2['valores'] | null {
    const object = uplink.object || {};
    const valores: IValoresV2['valores'] = {};

    const temperatura = this.getFirstNumber(
      object.temperature,
      object.temp,
      object.airTemperature,
      object.temperatura,
    );
    if (Number.isFinite(temperatura)) {
      valores.Temperatura = [
        {
          unidad: 'C',
          valores: { actual: Number(Number(temperatura).toFixed(2)) },
        },
      ];
    }

    const humedad = this.getFirstNumber(
      object.humidity,
      object.hum,
      object.relativeHumidity,
      object.humedad,
    );
    if (Number.isFinite(humedad)) {
      valores.Humedad = [
        {
          unidad: '%',
          valores: { actual: Number(Number(humedad).toFixed(2)) },
        },
      ];
    }

    const lluvia = this.getFirstNumber(
      object.rain,
      object.rainfall,
      object.precipitation,
      object.lluvia,
    );
    if (Number.isFinite(lluvia)) {
      valores.Pluviometro = [
        {
          unidad: 'mm',
          valores: { actual: Number(Number(lluvia).toFixed(2)) },
        },
      ];
    }

    const presion = this.getFirstNumber(
      object.pressure,
      object.barometricPressure,
      object.presion,
    );
    if (Number.isFinite(presion)) {
      valores['PresiÃ³n'] = [
        {
          unidad: 'hPa',
          valores: { actual: Number(Number(presion).toFixed(2)) },
        },
      ];
    }

    return Object.keys(valores).length ? valores : null;
  }

  private inferirConfiguracionSentek(
    object?: Uplink['object'],
  ): LanzaParserConfig | undefined {
    if (!object) return undefined;
    const keys = Object.keys(object);
    const sdi12Keys = keys.filter((key) => /^sdi12_\d+$/i.test(key));
    if (!sdi12Keys.length) return undefined;

    const maxKey = Math.max(
      ...sdi12Keys.map((key) => Number(key.replace(/\D/g, '')) || 0),
    );

    return maxKey > 6 ? SENTEK_12_CONFIG : SENTEK_9_CONFIG;
  }

  private getEventFromTopic(topic?: string): Event | undefined {
    if (!topic) return undefined;
    const parts = topic.split('/');
    const eventIndex = parts.findIndex((part) => part === 'event');
    if (eventIndex >= 0) {
      const event = parts[eventIndex + 1] as Event;
      return event;
    }
    const lastPart = parts[parts.length - 1] as Event;
    return ['up', 'status', 'join', 'ack'].includes(lastPart)
      ? lastPart
      : undefined;
  }

  private getFirstNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private getDevEui(uplink: Uplink): string | undefined {
    const deviceInfo = uplink.deviceInfo as any;
    const devEui =
      deviceInfo?.devEui ||
      deviceInfo?.devEUI ||
      (uplink as any).devEui ||
      (uplink as any).devEUI;

    return devEui ? String(devEui).toUpperCase() : undefined;
  }

  private buildMetadataLora(uplink: Uplink) {
    const rxInfo = uplink.rxInfo?.[0] || ({} as any);
    const ubicacionGWCoord = rxInfo.location;
    const res: IMetaDataLora = {
      dr: uplink.dr,
      rssi: rxInfo.rssi,
      snr: rxInfo.snr,
      ubicacionGW:
        ubicacionGWCoord?.longitude && ubicacionGWCoord?.latitude
          ? {
              type: 'Point',
              coordinates: [
                ubicacionGWCoord.longitude,
                ubicacionGWCoord.latitude,
              ],
            }
          : null,
    };
    return res;
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
    const temperaturaPrevia = mismaTemporada && Number.isFinite(previo.ultimaTemperatura)
      ? Number(previo.ultimaTemperatura)
      : this.extraerTemperaturaReferencia(dispositivo.ultimoReporte?.datos?.valores);

    if (fechaPrevia && Number.isFinite(temperaturaPrevia)) {
      const diffHours =
        (new Date(fecha).getTime() - new Date(fechaPrevia).getTime()) /
        3600000;

      if (diffHours > 0 && diffHours < 24) {
        if (temperaturaPrevia >= 0 && temperaturaPrevia <= 7.2) {
          horasFrio += diffHours;
        }
      }
    }

    return {
      temporadaInicio,
      fechaInicio: mismaTemporada ? previo.fechaInicio || fecha : fecha,
      fechaUltimoCalculo: fecha,
      ultimaTemperatura: Number(temperaturaActual.toFixed(2)),
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
    const temperaturasAire = valores?.Temperatura
      ?.map((item) => item?.valores?.actual ?? item?.valores?.promedio)
      .filter((valor) => Number.isFinite(valor));

    if (temperaturasAire?.length) {
      return this.promedio(temperaturasAire);
    }

    // Los modelos de frio usan temperatura de aire; no se reemplaza con una
    // lectura de suelo aunque sea la unica variable termica disponible.
    return undefined;
  }

  private promedio(valores: number[]): number {
    return valores.reduce((suma, valor) => suma + Number(valor), 0) / valores.length;
  }

  private async ultimoReportePorDeveuiYFecha(
    deveui: string,
    startDate: string,
    endDate: string,
  ): Promise<IReporte> {
    const filter: IFilter<IReporte> = {
      deveui,
      estado: 'parcial',
      fecha: {
        $gte: startDate,
        $lte: endDate,
      },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: JSON.stringify({ fecha: -1 }),
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos[0];
  }
}
