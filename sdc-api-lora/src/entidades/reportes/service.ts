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
const TEMP_FRIO = Number(process.env.TEMP_FRIO || 7);
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
    const { devEui } = uplink.deviceInfo;

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

  private buildMetadataLora(uplink: Uplink) {
    const ubicacionGWCoord = uplink.rxInfo[0]?.location;
    const res: IMetaDataLora = {
      dr: uplink.dr,
      rssi: uplink.rxInfo[0].rssi,
      snr: uplink.rxInfo[0].snr,
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
        if (temperaturaPrevia <= TEMP_FRIO) {
          horasFrio += diffHours;
        }
        horasFrioEfectivas += diffHours * this.hfeFactor(temperaturaPrevia);
      }
    }

    return {
      fechaInicio: previo.fechaInicio || fecha,
      fechaUltimoCalculo: fecha,
      ultimaTemperatura: Number(temperaturaActual.toFixed(2)),
      horasFrio: Number(horasFrio.toFixed(2)),
      horasFrioEfectivas: Number(horasFrioEfectivas.toFixed(2)),
      factorEfectivoActual: Number(this.hfeFactor(temperaturaActual).toFixed(3)),
      modelo: 'HF <= 7C + HFE Utah simplificado',
      fuente: 'Sensor LoRa',
    };
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

    const temperaturasSuelo = valores?.['Temperatura Suelo']
      ?.map((item) => item?.valores?.actual ?? item?.valores?.promedio)
      .filter((valor) => Number.isFinite(valor));

    if (temperaturasSuelo?.length) {
      return this.promedio(temperaturasSuelo.slice(0, 3));
    }

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
