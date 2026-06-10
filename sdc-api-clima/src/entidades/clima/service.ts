import { Injectable } from '@nestjs/common';
import { HelperService, ICoordenadas } from '../../auxiliares/helper';
import { FieldClimateService } from '../fieldClimate/service';
import {
  IStationData,
  TDataReporte,
} from '../fieldClimate/modelos/stationData';
import { API_OPEN_METEO, API_OPEN_METEO_ARCHIVE } from '../../env';
import { LogService } from '../../auxiliares/logsService/service';
import { EstacionsService, IEstacionCercana } from '../estacion/service';
import { IForecast, TDataForecast } from '../fieldClimate/modelos/forecast';
import SunCalc from 'suncalc';
import { IForecastOpenWeather } from '../openWeather/modelos/modelos';
import { MeteoSourceService } from '../meteoSource/service';
import { IForecastMeteoSource } from '../meteoSource/modelos/modelos';
import {
  IValores,
  IClimaEstacionMeteorologica,
  IPronosticoEstacionMeteorologica,
  IPronosticoMeteoSource,
  IFilter,
  IEstacion,
  IQueryParam,
  nivelPrediccion,
  calidadNivel,
} from 'modelos/src';
import { OmixomService } from '../omixom/service';

@Injectable()
export class ClimaService {
  private logger = new LogService(ClimaService.name);
  // En lugar de mandar vacío, mando esto
  private prediccionDefault: nivelPrediccion[] = [
    //DEFAUL (TODO EN 3)
    // SOJA - LLUVIA
    {
      cultivo: 'Soja',
      enfermedad: 'Fin de Ciclo',
      lluvias: { nivel: 3, distancia: null, idEstacion: null },
      nivel: 3,
    },
    // MAIZ - LLUVIA - TEMPERATURA - HUMEDAD - VIENTO
    {
      cultivo: 'Maiz',
      enfermedad: 'Roya del Maiz',
      lluvias: { nivel: 3, distancia: null, idEstacion: null },
      temperatura: { nivel: 3, distancia: null, idEstacion: null },
      humedadRelativa: { nivel: 3, distancia: null, idEstacion: null },
      velocidadViento: { nivel: 3, distancia: null, idEstacion: null },
      nivel: 3,
    },
    // TRIGO - LLUVIA - TEMPERATURA - HUMEDAD - VIENTO
    {
      cultivo: 'Trigo',
      enfermedad: 'Mancha Amarilla',
      lluvias: { nivel: 3, distancia: null, idEstacion: null },
      temperatura: { nivel: 3, distancia: null, idEstacion: null },
      humedadRelativa: { nivel: 3, distancia: null, idEstacion: null },
      velocidadViento: { nivel: 3, distancia: null, idEstacion: null },
      nivel: 3,
    },
    // TRIGO1 - LLUVIA - TEMPERATURA - HUMEDAD - VIENTO
    {
      cultivo: 'Trigo',
      enfermedad: 'Roya de la Hoja',
      lluvias: { nivel: 3, distancia: null, idEstacion: null },
      temperatura: { nivel: 3, distancia: null, idEstacion: null },
      humedadRelativa: { nivel: 3, distancia: null, idEstacion: null },
      velocidadViento: { nivel: 3, distancia: null, idEstacion: null },
      nivel: 3,
    },
    // TRIGO2 - LLUVIA - TEMPERATURA
    {
      cultivo: 'Trigo',
      enfermedad: 'Mancha de la Hoja',
      lluvias: { nivel: 3, distancia: null, idEstacion: null },
      temperatura: { nivel: 3, distancia: null, idEstacion: null },
      humedadRelativa: { nivel: 3, distancia: null, idEstacion: null },
      velocidadViento: { nivel: 3, distancia: null, idEstacion: null },
      nivel: 3,
    },
    // TRIGO4 - LLUVIA - TEMPERATURA
    {
      cultivo: 'Trigo',
      enfermedad: 'Fusarium de la Espiga',
      lluvias: { nivel: 3, distancia: null, idEstacion: null },
      temperatura: { nivel: 3, distancia: null, idEstacion: null },
      humedadRelativa: { nivel: 3, distancia: null, idEstacion: null },
      velocidadViento: { nivel: 3, distancia: null, idEstacion: null },
      nivel: 3,
    },
  ];

  constructor(
    private fieldClimate: FieldClimateService,
    private meteoSourceService: MeteoSourceService,
    private omixomService: OmixomService,
    private estacionsService: EstacionsService,
  ) {
    // this.testSemaforo();
  }

  private async testSemaforo() {
    // await this.wait(5000);
    // const ubicacion: ICoordenadas = {
    //   // "latitude": "-32.7470020000",
    //   // "longitude": "-61.9127530000",
    //   lat: -32.747002,
    //   lng: -61.912753,
    // };
    // const res = await this.getSemaforoClima(ubicacion);
    // this.logger.log(`Semáforo: ${res}`);
  }

  private wait(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private esDiaONoche(fecha: Date, latitud: number, longitud: number) {
    const tiempos = SunCalc.getTimes(fecha, latitud, longitud);
    if (fecha >= tiempos.sunrise && fecha < tiempos.sunset) {
      return 'Día';
    } else {
      return 'Noche';
    }
  }

  /**
   * Fecha de entrada en formato 2024-08-27 11:00:00 hora de ISO, salida en formato Date
   * @param fecha
   * @returns
   */
  private getFechaDia(fecha: string): string {
    const y = fecha.slice(0, 4);
    const m = fecha.slice(5, 7);
    const d = fecha.slice(8, 10);
    const date = new Date(`${y}-${m}-${d} 00:00:00 GMT-0000`);
    return date.toISOString();
  }

  /**
   * Fecha de entrada en formato 2024-08-27 11:00:00 hora de ISO, salida en formato Date
   * @param fecha
   * @returns
   */
  private getFechaHora(fecha: string): string {
    // 2024-08-27 11:00:00
    const y = fecha.slice(0, 4);
    const m = fecha.slice(5, 7);
    const d = fecha.slice(8, 10);
    const h = fecha.slice(11, 13);
    const date = new Date(`${y}-${m}-${d} ${h}:00:00 GMT-0000`);
    date.setHours(date.getHours() + 3);
    return date.toISOString();
  }

  private getFechaOpenMeteo(fecha: string): string {
    return new Date(fecha).toISOString().slice(0, 10);
  }

  private async getOpenMeteoEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
  ): Promise<IClimaEstacionMeteorologica[]> {
    const startDate = this.getFechaOpenMeteo(minDate);
    const endDate = this.getFechaOpenMeteo(maxDate);
    const inicio = new Date(`${startDate}T00:00:00Z`);
    const hoy = new Date(`${this.getFechaOpenMeteo(new Date().toISOString())}T00:00:00Z`);
    const diasHaciaAtras = (hoy.getTime() - inicio.getTime()) / 86400000;
    const baseUrl =
      diasHaciaAtras <= 92
        ? `${API_OPEN_METEO}/forecast`
        : `${API_OPEN_METEO_ARCHIVE}/archive`;

    const url = new URL(baseUrl);
    url.searchParams.set('latitude', `${ubicacion.lat}`);
    url.searchParams.set('longitude', `${ubicacion.lng}`);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);
    url.searchParams.set(
      'daily',
      [
        'temperature_2m_max',
        'temperature_2m_min',
        'temperature_2m_mean',
        'relative_humidity_2m_max',
        'relative_humidity_2m_min',
        'relative_humidity_2m_mean',
        'precipitation_sum',
        'wind_speed_10m_max',
        'wind_speed_10m_mean',
        'wind_direction_10m_dominant',
        'shortwave_radiation_sum',
        'et0_fao_evapotranspiration',
      ].join(','),
    );

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.error(
          `Open-Meteo respondio ${response.status} para ${url.toString()}`,
        );
        return [];
      }
      const data = await response.json();
      return this.parsearClimaOpenMeteo(data, ubicacion);
    } catch (error) {
      this.logger.error(
        `Error al obtener clima Open-Meteo para ${JSON.stringify(ubicacion)}: ${error}`,
      );
      return [];
    }
  }

  private parsearClimaOpenMeteo(
    data: any,
    ubicacion: ICoordenadas,
  ): IClimaEstacionMeteorologica[] {
    const daily = data?.daily;
    const fechas: string[] = daily?.time || [];

    return fechas.map((fecha, index) => {
      const fechaIso = new Date(`${fecha}T12:00:00`).toISOString();
      const date = new Date(fechaIso);
      return {
        fuente: 'OpenMeteo' as any,
        distancia: null,
        estacion: 'Open-Meteo',
        ubicacion,
        fecha: fechaIso,
        diaNoche: this.esDiaONoche(date, ubicacion.lat, ubicacion.lng),
        temperatura: {
          max: daily.temperature_2m_max?.[index],
          min: daily.temperature_2m_min?.[index],
          avg: daily.temperature_2m_mean?.[index],
        },
        humedad: {
          max: daily.relative_humidity_2m_max?.[index],
          min: daily.relative_humidity_2m_min?.[index],
          avg: daily.relative_humidity_2m_mean?.[index],
        },
        lluvia: {
          sum: daily.precipitation_sum?.[index],
          result: daily.precipitation_sum?.[index],
        },
        velocidadViento: {
          max: daily.wind_speed_10m_max?.[index],
          avg: daily.wind_speed_10m_mean?.[index],
        },
        direccionViento: {
          avg: daily.wind_direction_10m_dominant?.[index],
        },
        radiacionSolar: {
          sum: daily.shortwave_radiation_sum?.[index],
        },
        et0: {
          sum: daily.et0_fao_evapotranspiration?.[index],
          result: daily.et0_fao_evapotranspiration?.[index],
        },
      };
    });
  }

  private async getPronosticoOpenMeteo(
    ubicacion: ICoordenadas,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    const url = new URL(`${API_OPEN_METEO}/forecast`);
    url.searchParams.set('latitude', `${ubicacion.lat}`);
    url.searchParams.set('longitude', `${ubicacion.lng}`);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set(
      'daily',
      [
        'temperature_2m_max',
        'temperature_2m_min',
        'temperature_2m_mean',
        'relative_humidity_2m_max',
        'relative_humidity_2m_min',
        'relative_humidity_2m_mean',
        'precipitation_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_speed_10m_mean',
        'wind_direction_10m_dominant',
        'shortwave_radiation_sum',
        'et0_fao_evapotranspiration',
      ].join(','),
    );

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.error(
          `Open-Meteo pronostico respondio ${response.status} para ${url.toString()}`,
        );
        return [];
      }
      const data = await response.json();
      const daily = data?.daily;
      const fechas: string[] = daily?.time || [];
      return fechas.map((fecha, index) => {
        const fechaIso = new Date(`${fecha}T12:00:00`).toISOString();
        const date = new Date(fechaIso);
        return {
          fuente: 'OpenMeteo' as any,
          ubicacion,
          fecha: fechaIso,
          diaNoche: this.esDiaONoche(date, ubicacion.lat, ubicacion.lng),
          temperatura: {
            max: daily.temperature_2m_max?.[index],
            min: daily.temperature_2m_min?.[index],
            avg: daily.temperature_2m_mean?.[index],
          },
          humedad: {
            max: daily.relative_humidity_2m_max?.[index],
            min: daily.relative_humidity_2m_min?.[index],
            avg: daily.relative_humidity_2m_mean?.[index],
          },
          velocidadViento: {
            max: daily.wind_speed_10m_max?.[index],
            avg: daily.wind_speed_10m_mean?.[index],
          },
          lluvia: daily.precipitation_sum?.[index],
          probabilidadLluvia: daily.precipitation_probability_max?.[index],
          direccionViento: daily.wind_direction_10m_dominant?.[index],
          radiacionSolar: daily.shortwave_radiation_sum?.[index],
          et0: daily.et0_fao_evapotranspiration?.[index],
        };
      });
    } catch (error) {
      this.logger.error(
        `Error al obtener pronostico Open-Meteo para ${JSON.stringify(ubicacion)}: ${error}`,
      );
      return [];
    }
  }

  // Parseo de datos de estaciones meteorológicas

  private parseClima1(
    reporte: TDataReporte,
    fechas: string[],
    medicion: { [fecha: string]: IValores },
  ) {
    // SUM
    for (let i = 0; i < reporte.values.sum?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.sum[i];
      if (medicion[fecha]) {
        medicion[fecha].sum = valor;
      } else {
        medicion[fecha] = { sum: valor };
      }
    }
    // AVG
    for (let i = 0; i < reporte.values.avg?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.avg[i];
      if (medicion[fecha]) {
        medicion[fecha].avg = valor;
      } else {
        medicion[fecha] = { avg: valor };
      }
    }
    // MAX
    for (let i = 0; i < reporte.values.max?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.max[i];
      if (medicion[fecha]) {
        medicion[fecha].max = valor;
      } else {
        medicion[fecha] = { max: valor };
      }
    }
    // MIN
    for (let i = 0; i < reporte.values.min?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.min[i];
      if (medicion[fecha]) {
        medicion[fecha].min = valor;
      } else {
        medicion[fecha] = { min: valor };
      }
    }
    // COUNT
    for (let i = 0; i < reporte.values.count?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.count[i];
      if (medicion[fecha]) {
        medicion[fecha].count = valor;
      } else {
        medicion[fecha] = { count: valor };
      }
    }
    // LAST
    for (let i = 0; i < reporte.values.last?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.last[i];
      if (medicion[fecha]) {
        medicion[fecha].last = valor;
      } else {
        medicion[fecha] = { last: valor };
      }
    }
    // RESULT
    for (let i = 0; i < reporte.values.result?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.result[i];
      if (medicion[fecha]) {
        medicion[fecha].result = valor;
      } else {
        medicion[fecha] = { result: valor };
      }
    }
  }

  private parseClima2(
    reporte: TDataReporte,
    fechas: string[],
    medicion: { [fecha: string]: { [nivel: number]: IValores } },
    nivel: number,
  ) {
    // SUM
    for (let i = 0; i < reporte.values.sum?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.sum[i];
      if (medicion[fecha]) {
        if (medicion[fecha][nivel]) {
          medicion[fecha][nivel].sum = valor;
        } else {
          medicion[fecha][nivel] = { sum: valor };
        }
      } else {
        medicion[fecha] = { [nivel]: { sum: valor } };
      }
    }
    // AVG
    for (let i = 0; i < reporte.values.avg?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.avg[i];
      if (medicion[fecha]) {
        if (medicion[fecha][nivel]) {
          medicion[fecha][nivel].avg = valor;
        } else {
          medicion[fecha][nivel] = { avg: valor };
        }
      } else {
        medicion[fecha] = { [nivel]: { avg: valor } };
      }
    }
    // MAX
    for (let i = 0; i < reporte.values.max?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.max[i];
      if (medicion[fecha]) {
        if (medicion[fecha][nivel]) {
          medicion[fecha][nivel].max = valor;
        } else {
          medicion[fecha][nivel] = { max: valor };
        }
      } else {
        medicion[fecha] = { [nivel]: { max: valor } };
      }
    }
    // MIN
    for (let i = 0; i < reporte.values.min?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.min[i];
      if (medicion[fecha]) {
        if (medicion[fecha][nivel]) {
          medicion[fecha][nivel].min = valor;
        } else {
          medicion[fecha][nivel] = { min: valor };
        }
      } else {
        medicion[fecha] = { [nivel]: { min: valor } };
      }
    }
    // COUNT
    for (let i = 0; i < reporte.values.count?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.count[i];
      if (medicion[fecha]) {
        if (medicion[fecha][nivel]) {
          medicion[fecha][nivel].count = valor;
        } else {
          medicion[fecha][nivel] = { count: valor };
        }
      } else {
        medicion[fecha] = { [nivel]: { count: valor } };
      }
    }
    // LAST
    for (let i = 0; i < reporte.values.last?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.last[i];
      if (medicion[fecha]) {
        if (medicion[fecha][nivel]) {
          medicion[fecha][nivel].last = valor;
        } else {
          medicion[fecha][nivel] = { last: valor };
        }
      } else {
        medicion[fecha] = { [nivel]: { last: valor } };
      }
    }
    // RESULT
    for (let i = 0; i < reporte.values.result?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values.result[i];
      if (medicion[fecha]) {
        if (medicion[fecha][nivel]) {
          medicion[fecha][nivel].result = valor;
        } else {
          medicion[fecha][nivel] = { result: valor };
        }
      } else {
        medicion[fecha] = { [nivel]: { result: valor } };
      }
    }
  }

  public parsearClimaFieldClimate(
    estacion: IEstacionCercana,
    reportes: IStationData,
    dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly' = 'daily',
  ): IClimaEstacionMeteorologica[] {
    const fechas: string[] = [];
    const array: IClimaEstacionMeteorologica[] = [];

    const temperaturas: { [fecha: string]: IValores } = {};
    const lluvias: { [fecha: string]: IValores } = {};
    const humedads: { [fecha: string]: IValores } = {};
    const velocidadVientos: { [fecha: string]: IValores } = {};
    const direccionVientos: { [fecha: string]: IValores } = {};
    const temperaturasSuelo: {
      [fecha: string]: { [nivel: number]: IValores };
    } = {};
    const humedadsSuelo: { [fecha: string]: { [nivel: number]: IValores } } =
      {};
    const radiacionSolars: { [fecha: string]: IValores } = {};
    const intensidadLuminicas: { [fecha: string]: IValores } = {};
    const presions: { [fecha: string]: IValores } = {};
    const baterias: { [fecha: string]: IValores } = {};
    const et0s: { [fecha: string]: IValores } = {};
    const panelesSolares: { [fecha: string]: IValores } = {};
    const rafagasVientos: { [fecha: string]: IValores } = {};

    for (const fecha of reportes.dates) {
      switch (dataGroup) {
        case 'daily':
          fechas.push(this.getFechaDia(fecha));
          break;
        case 'hourly':
          fechas.push(this.getFechaHora(fecha));
          break;
        default:
          fechas.push(this.getFechaDia(fecha));
          break;
      }
    }

    for (const reporte of reportes.data) {
      const medicion = reporte.name;
      const medicionOriginal = reporte.name_original;
      // TEMPERATURA
      const sensoresTemperatura = [
        'HC Air temperature',
        'I2C Temperature',
        'Air temperature, high precision',
      ];
      if (sensoresTemperatura.includes(medicion)) {
        this.parseClima1(reporte, fechas, temperaturas);
      }
      // LLUVIA
      if (medicion === 'Precipitation') {
        this.parseClima1(reporte, fechas, lluvias);
      }
      // HUMEDAD
      const sensoresHumedad = [
        'HC Relative humidity',
        'I2C Rel Humidity',
        'Relative humidity',
      ];
      if (sensoresHumedad.includes(medicion)) {
        this.parseClima1(reporte, fechas, humedads);
      }
      // VELOCIDAD VIENTO
      const sensoresVelocidadViento = ['U-sonic wind speed', 'Wind speed'];
      if (sensoresVelocidadViento.includes(medicion)) {
        this.parseClima1(reporte, fechas, velocidadVientos);
      }
      // DIRECCION VIENTO
      const sensoresDireccionViento = ['U-sonic wind dir', 'Wind direction'];
      if (sensoresDireccionViento.includes(medicion)) {
        this.parseClima1(reporte, fechas, direccionVientos);
      }
      // HUMEDAD DEL SUELO
      if (medicionOriginal === 'EAG Soil moisture') {
        // El nivel es el último número de la medición
        const nivel = medicion.split(' ').pop();
        this.parseClima2(reporte, fechas, humedadsSuelo, +nivel);
      }
      // TEMPERATURA DEL SUELO
      if (medicionOriginal === 'Soil temperature') {
        const nivel = medicion.split(' ').pop();
        this.parseClima2(reporte, fechas, temperaturasSuelo, +nivel);
      }
      // RADIACION SOLAR
      if (medicion === 'Solar radiation') {
        this.parseClima1(reporte, fechas, radiacionSolars);
      }
      // INTENSIDAD LUMINICA
      // if (medicion === '') {
      //   this.parseClima1(reporte, fechas, intensidadLuminicas);
      // }
      // PRESION
      // if (medicion === '') {
      //   this.parseClima1(reporte, fechas, presions);
      // }
      // BATERIA
      if (medicion === 'Battery') {
        this.parseClima1(reporte, fechas, baterias);
      }
      // ET0
      const sensoresET0 = ['Daily ET0', 'ET0'];
      if (sensoresET0.includes(medicion)) {
        this.parseClima1(reporte, fechas, et0s);
      }
      // PANEL SOLAR
      if (medicion === 'Solar Panel') {
        this.parseClima1(reporte, fechas, panelesSolares);
      }
      // RAFAGA VIENTO
      if (medicion === 'Wind gust') {
        this.parseClima1(reporte, fechas, rafagasVientos);
      }
    }

    const ubicacion = {
      lat: estacion.position?.geo?.coordinates[1],
      lng: estacion.position?.geo?.coordinates[0],
    };

    for (const fecha of fechas) {
      const date = new Date(fecha);
      const data: IClimaEstacionMeteorologica = {
        fuente: 'FieldClimate',
        distancia: estacion.distancia,
        estacion:
          estacion.name?.custom ||
          estacion.name?.original ||
          estacion.idExterno,
        ubicacion,
        fecha: fecha,
        diaNoche: this.esDiaONoche(date, ubicacion.lat, ubicacion.lng),
        temperatura: temperaturas[fecha],
        lluvia: lluvias[fecha],
        humedad: humedads[fecha],
        velocidadViento: velocidadVientos[fecha],
        direccionViento: direccionVientos[fecha],
        temperaturaSuelo: temperaturasSuelo[fecha],
        humedadSuelo: humedadsSuelo[fecha],
        radiacionSolar: radiacionSolars[fecha],
        intensidadLuminica: intensidadLuminicas[fecha],
        presion: presions[fecha],
        bateria: baterias[fecha],
        et0: et0s[fecha],
        panelSolar: panelesSolares[fecha],
        rafagaViento: rafagasVientos[fecha],
      };
      array.push(data);
    }
    return array;
  }

  // Parseo de pronosticos

  private parsePronostico1(
    reporte: TDataForecast,
    fechas: string[],
    variable: { [fecha: string]: IValores },
    campo: 'min' | 'max' | 'avg',
  ) {
    for (let i = 0; i < reporte.values?.result?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values?.result?.[i];
      if (variable[fecha]) {
        variable[fecha][campo] = valor;
      } else {
        variable[fecha] = { [campo]: valor };
      }
    }
  }

  private parsePronostico2(
    reporte: TDataForecast,
    fechas: string[],
    variable: { [fecha: string]: number },
  ) {
    for (let i = 0; i < reporte.values?.result?.length; i++) {
      const fecha = fechas[i];
      const valor = reporte.values?.result?.[i];
      if (variable[fecha]) {
        variable[fecha] = valor;
      } else {
        variable[fecha] = valor;
      }
    }
  }

  private parsearPronosticoFieldClimate(
    estacion: IEstacionCercana,
    reportes: IForecast,
  ): IPronosticoEstacionMeteorologica[] {
    const fechas: string[] = [];
    const array: IPronosticoEstacionMeteorologica[] = [];

    const temperaturas: { [fecha: string]: IValores } = {};
    const humedads: { [fecha: string]: IValores } = {};
    const velocidadVientos: { [fecha: string]: IValores } = {};

    const lluvias: { [fecha: string]: number } = {};
    const direccionVientos: { [fecha: string]: number } = {};
    const radiacionSolares: { [fecha: string]: number } = {};
    const probabilidadLluvias: { [fecha: string]: number } = {};
    const et0: { [fecha: string]: number } = {};

    for (const fecha of reportes.dates) {
      const date = this.getFechaDia(fecha);
      fechas.push(date);
    }

    for (const reporte of reportes.data) {
      const name = reporte.name;
      // TEMPERATURA
      if (name === 'temperature_min') {
        this.parsePronostico1(reporte, fechas, temperaturas, 'min');
      }
      if (name === 'temperature_max') {
        this.parsePronostico1(reporte, fechas, temperaturas, 'max');
      }
      if (name === 'temperature_mean') {
        this.parsePronostico1(reporte, fechas, temperaturas, 'avg');
      }
      // HUMEDAD
      if (name === 'relativehumidity_min') {
        this.parsePronostico1(reporte, fechas, humedads, 'min');
      }
      if (name === 'relativehumidity_max') {
        this.parsePronostico1(reporte, fechas, humedads, 'max');
      }
      if (name === 'relativehumidity_mean') {
        this.parsePronostico1(reporte, fechas, humedads, 'avg');
      }
      // VELOCIDAD VIENTO
      if (name === 'windspeed_min') {
        this.parsePronostico1(reporte, fechas, velocidadVientos, 'min');
      }
      if (name === 'windspeed_max') {
        this.parsePronostico1(reporte, fechas, velocidadVientos, 'max');
      }
      if (name === 'windspeed_mean') {
        this.parsePronostico1(reporte, fechas, velocidadVientos, 'avg');
      }
      // LLUVIA
      if (name === 'Precipitation') {
        this.parsePronostico2(reporte, fechas, lluvias);
      }
      // DIRECCION VIENTO
      if (name === 'Wind direction') {
        this.parsePronostico2(reporte, fechas, direccionVientos);
      }
      // RADIACION SOLAR
      if (name === 'Global radiation - Sensible Heat Flux') {
        this.parsePronostico2(reporte, fechas, radiacionSolares);
      }
      // PROBABILIDAD LLUVIA
      if (name === 'Probability of Prec.') {
        this.parsePronostico2(reporte, fechas, probabilidadLluvias);
      }
      // ET0
      if (name === 'ET0') {
        this.parsePronostico2(reporte, fechas, et0);
      }
    }

    const ubicacion = {
      lat: estacion.position?.geo?.coordinates[1],
      lng: estacion.position?.geo?.coordinates[0],
    };

    for (const fecha of fechas) {
      const date = new Date(fecha);
      const data: IPronosticoEstacionMeteorologica = {
        fuente: 'FieldClimate',
        distancia: estacion.distancia,
        estacion:
          estacion.name?.custom ||
          estacion.name?.original ||
          estacion.idExterno,
        ubicacion,
        fecha: fecha,
        diaNoche: this.esDiaONoche(date, ubicacion.lat, ubicacion.lng),
        temperatura: temperaturas[fecha],
        lluvia: lluvias[fecha],
        humedad: humedads[fecha],
        velocidadViento: velocidadVientos[fecha],
        direccionViento: direccionVientos[fecha],
        probabilidadLluvia: probabilidadLluvias[fecha],
        radiacionSolar: radiacionSolares[fecha],
        et0: et0[fecha],
      };
      array.push(data);
    }
    return array;
  }

  private parsearPronosticoOpenWeather(
    pronostico: IForecastOpenWeather,
  ): IPronosticoEstacionMeteorologica[] {
    const array: IPronosticoEstacionMeteorologica[] = [];
    const ubicacion = {
      lat: pronostico.city.coord.lat,
      lng: pronostico.city.coord.lon,
    };

    for (const p of pronostico.list) {
      const date = new Date(p.dt * 1000);
      const data: IPronosticoEstacionMeteorologica = {
        fuente: 'FieldClimate',
        distancia: 0,
        ubicacion,
        fecha: date.toISOString(),
        diaNoche: this.esDiaONoche(date, ubicacion.lat, ubicacion.lng),
        temperatura: {
          min: p.temp.min,
          max: p.temp.max,
          avg:
            (p.temp.day +
              p.temp.night +
              p.temp.eve +
              p.temp.morn +
              p.temp.min +
              p.temp.max) /
            6,
        },
        lluvia: p.rain ? p.rain : 0,
        probabilidadLluvia: p.pop ? +(p.pop * 100).toFixed(0) : 0,
        humedad: { avg: p.humidity },
        velocidadViento: { avg: p.speed },
        direccionViento: p.deg,
        // radiacionSolar: 0,
        // et0: et0[fecha],
      };
      array.push(data);
    }

    return array;
  }

  //

  async getEstacionMasCercanaEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
  ): Promise<IClimaEstacionMeteorologica[]> {
    try {
      const res = await this.fieldClimate.getEstacionMasCercanaEntreFechas(
        ubicacion,
        minDate,
        maxDate,
        dataGroup,
      );
      if (res) {
        const parseado = this.parsearClimaFieldClimate(
          res.station,
          res.data,
          dataGroup,
        );
        if (parseado.length > 0) {
          return parseado;
        }
      }
    } catch (error) {
      this.logger.error(
        `No se pudo obtener clima FieldClimate para ${JSON.stringify(ubicacion)}: ${error}`,
      );
    }

    return this.getOpenMeteoEntreFechas(ubicacion, minDate, maxDate);
  }

  async getPluviometroMasCercanoEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
  ): Promise<IClimaEstacionMeteorologica[]> {
    const res = await this.fieldClimate.getPluviometroMasCercanoEntreFechas(
      ubicacion,
      minDate,
      maxDate,
      dataGroup,
    );
    if (!res) return [];

    return this.parsearClimaFieldClimate(res.station, res.data, dataGroup);
  }

  async getSueloMasCercanoEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
  ): Promise<IClimaEstacionMeteorologica[]> {
    const res = await this.fieldClimate.getSueloMasCercanoEntreFechas(
      ubicacion,
      minDate,
      maxDate,
      dataGroup,
    );
    if (!res) return [];

    return this.parsearClimaFieldClimate(res.station, res.data, dataGroup);
  }

  async getSueloPorDispositivoEntreFechas(
    id: string,
    dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly' = 'hourly',
    minDate: string,
    maxDate: string,
  ): Promise<IClimaEstacionMeteorologica[]> {
    const estacion = await this.estacionsService.getById(id);
    if (!estacion) {
      this.logger.error(`Estacion no encontrada: ${id}`);
      return [];
    }

    const res = await this.fieldClimate.getDataBetweenDates(
      estacion.idExterno,
      dataGroup,
      new Date(minDate).getTime(),
      new Date(maxDate).getTime(),
      estacion.user,
      estacion.pass,
    );
    if (!res) return [];

    return this.parsearClimaFieldClimate(estacion, res, dataGroup);
  }

  async getPronosticoMasCercano(ubicacion: ICoordenadas) {
    const openMeteo = await this.getPronosticoOpenMeteo(ubicacion);
    if (openMeteo.length > 0) {
      return openMeteo;
    }

    const forecasts = await this.getForecastMeteoSource(ubicacion);
    if (!forecasts) {
      this.logger.error(
        `Pronostico no encontrado para ubicacion ${JSON.stringify(ubicacion)}`,
      );
      return [];
    }
    const arr: IPronosticoEstacionMeteorologica[] = [];
    for (const forecast of forecasts) {
      const diaNoche = this.esDiaONoche(
        new Date(forecast.fecha),
        ubicacion.lat,
        ubicacion.lng,
      );
      const res: IPronosticoEstacionMeteorologica = {
        fuente: 'MeteoSource',
        ubicacion,
        fecha: forecast?.fecha,
        diaNoche,
        temperatura: forecast?.temperatura,
        lluvia: forecast?.lluvia,
        humedad: forecast?.humedad,
        velocidadViento: forecast?.velocidadViento,
        direccionViento: forecast?.direccionViento,
        probabilidadLluvia: forecast?.probabilidadLluvia,
        radiacionSolar: forecast?.radiacionSolar,
        et0: forecast?.et0,
        distancia: null,
        estacion: null,
      };
      arr.push(res);
    }
    return arr;
  }

  async getForecastMeteoSource(ubicacion: ICoordenadas) {
    try {
      const forecast = await this.meteoSourceService.getForecast(
        ubicacion,
        'hourly,daily',
      );
      return this.parsearPronosticoMeteoSource(forecast, ubicacion);
    } catch (error) {
      this.logger.error(
        `Error al obtener el forecast de ubicacion ${JSON.stringify(
          ubicacion,
        )}: ${error}`,
      );
      return null;
    }
  }

  async getCurrentWeatherMeteoSource(
    ubicacion: ICoordenadas,
  ): Promise<IClimaEstacionMeteorologica | null> {
    try {
      const res = await this.meteoSourceService.getCurrentWeather(ubicacion);
      const current = res?.current;
      if (!current) {
        this.logger.error(
          `No se encontró el clima actual para la ubicación ${JSON.stringify(
            ubicacion,
          )}`,
        );
        return null;
      }
      const diaNoche = this.esDiaONoche(
        new Date(),
        ubicacion.lat,
        ubicacion.lng,
      );
      const data: IClimaEstacionMeteorologica = {
        fuente: 'MeteoSource',
        distancia: current.feels_like,
        icon: current.icon,
        iconNum: current.icon_num,
        summary: current.summary,
        ubicacion,
        fecha: new Date().toISOString(),
        diaNoche,
        temperatura: { last: current.temperature },
        lluvia: { last: current.precipitation?.total },
        probabilidadLluvia: current.probability?.precipitation,
        humedad: { last: current.humidity },
        velocidadViento: { last: current.wind?.speed },
        direccionViento: { last: current.wind?.angle },
        radiacionSolar: { last: current.irradiance },
        presion: { last: current.pressure },
        et0: { last: current.evaporation },
      };
      return data;
    } catch (error) {
      this.logger.error(
        `Error al obtener el clima actual de la ubicación ${JSON.stringify(
          ubicacion,
        )}: ${error}`,
      );
      return null;
    }
  }

  private parsearPronosticoMeteoSource(
    reportes: IForecastMeteoSource,
    ubicacion: ICoordenadas,
    dias: number = 7,
  ): IPronosticoMeteoSource[] {
    const fechas: string[] = [];
    const array: IPronosticoMeteoSource[] = [];

    const temperaturas: { [fecha: string]: IValores } = {};
    const humedads: { [fecha: string]: IValores } = {};
    const velocidadVientos: { [fecha: string]: IValores } = {};
    const lluvias: { [fecha: string]: number } = {};
    const direccionVientos: { [fecha: string]: number } = {};
    const evaporaciones: { [fecha: string]: number } = {};
    const radiacionSolares: { [fecha: string]: number } = {};
    const probabilidadLluvias: { [fecha: string]: number } = {};

    // Nuevas estructuras para agregación de datos horarios de precipitación
    const precipitacionProbabilidades: { [fecha: string]: number[] } = {};
    const precipitacionTotales: { [fecha: string]: number } = {};

    let ubicacionFinal: ICoordenadas;
    if (reportes.lat && reportes.lon) {
      ubicacionFinal = HelperService.transformCoordinates(
        reportes.lat,
        reportes.lon,
      );
    } else {
      ubicacionFinal = ubicacion;
    }

    let count = 0;
    let prevDate = null;
    let date = null;

    // Solo procesar datos horarios si existen
    if (reportes?.hourly?.data && Array.isArray(reportes.hourly.data)) {
      for (const item of reportes.hourly.data) {
        date = this.getFechaDia(item.date);
        if (date != prevDate && count > 0) {
          humedads[prevDate].avg /= count;
          evaporaciones[prevDate] /= count;
          radiacionSolares[prevDate] /= count;
          count = 0;
        }
        prevDate = date;
        count++;

        humedads[date] = {
          max:
            humedads[date]?.max > item.humidity
              ? humedads[date]?.max
              : item.humidity,
          min:
            humedads[date]?.min < item.humidity
              ? humedads[date]?.min
              : item.humidity,
          avg: humedads[date]?.avg
            ? humedads[date].avg + item.humidity
            : item.humidity,
        };
        velocidadVientos[date] =
          velocidadVientos[date]?.min < item.wind.speed
            ? { min: velocidadVientos[date]?.min }
            : { min: item.wind.speed };
        if (evaporaciones[date]) evaporaciones[date] += item.evaporation;
        else evaporaciones[date] = item.evaporation;
        if (radiacionSolares[date]) radiacionSolares[date] += item.irradiance;
        else radiacionSolares[date] = item.irradiance;

        // *** NUEVA LÓGICA: Agregación de datos de precipitación desde datos horarios ***
        // Recolectar probabilidades de precipitación para calcular máximo diario
        if (!precipitacionProbabilidades[date]) {
          precipitacionProbabilidades[date] = [];
        }
        if (item.probability?.precipitation !== undefined) {
          precipitacionProbabilidades[date].push(
            item.probability.precipitation,
          );
        }

        // Sumar precipitación total del día
        if (item.precipitation?.total !== undefined) {
          precipitacionTotales[date] =
            (precipitacionTotales[date] || 0) + item.precipitation.total;
        }
      }
    }

    // Calcular máximos diarios de probabilidades desde datos horarios
    for (const fecha in precipitacionProbabilidades) {
      if (precipitacionProbabilidades[fecha].length > 0) {
        probabilidadLluvias[fecha] = Math.max(
          ...precipitacionProbabilidades[fecha],
        );
      }
    }

    // Usar totales calculados para lluvias desde datos horarios
    for (const fecha in precipitacionTotales) {
      lluvias[fecha] = precipitacionTotales[fecha];
    }

    if (reportes?.daily?.data) {
      for (let i = 0; i < dias && i < reportes?.daily?.data?.length; i++) {
        const item = reportes.daily.data[i];
        const date = this.getFechaDia(item.day);
        fechas.push(date);
        temperaturas[date] = {
          max: item.all_day.temperature_max,
          min: item.all_day.temperature_min,
          avg: item.all_day.temperature,
        };
        velocidadVientos[date] = {
          max: item.statistics?.wind.max_speed,
          min: velocidadVientos[date]?.min,
          avg: item.statistics?.wind.avg_speed,
        };
        direccionVientos[date] = item.statistics?.wind?.avg_angle;

        // Solo usar datos diarios para lluvia/probabilidad si NO tenemos datos horarios agregados
        if (
          !lluvias[date] &&
          item.statistics?.precipitation?.avg !== undefined
        ) {
          lluvias[date] = item.statistics.precipitation.avg;
        }
        if (
          !probabilidadLluvias[date] &&
          item.statistics?.precipitation?.probability !== undefined
        ) {
          probabilidadLluvias[date] = item.statistics.precipitation.probability;
        }
      }
    }

    for (const fecha of fechas) {
      const date = this.getFechaDia(fecha);
      const data: IPronosticoMeteoSource = {
        fuente: 'MeteoSource',
        ubicacion: ubicacionFinal,
        fecha: fecha,
        temperatura: temperaturas[date],
        lluvia: lluvias[date],
        humedad: humedads[date],
        velocidadViento: velocidadVientos[date],
        direccionViento: direccionVientos[date],
        probabilidadLluvia: probabilidadLluvias[date],
        radiacionSolar: radiacionSolares[date],
        et0: evaporaciones[date],
      };
      array.push(data);
    }
    return array;
  }

  async getNivelPrediccion(
    ubicacion: ICoordenadas,
    estaciones: IEstacionCercana[],
  ): Promise<nivelPrediccion[]> {
    if (!estaciones?.length) {
      this.logger.error(
        `Estaciones no encontradas para ubicacion ${JSON.stringify(ubicacion)}`,
      );
      return [];
    }

    const estacionesConDistancia: IEstacionCercana[] = [];
    for (const estacion of estaciones) {
      if (
        !estacion.position?.geo?.coordinates?.[0] ||
        !estacion.position?.geo?.coordinates?.[1]
      ) {
        this.logger.error(
          `Estacion sin coordenadas ${JSON.stringify(estacion.name)}`,
        );
        continue;
      }
      const ubiacionEstacion: ICoordenadas = {
        lat: estacion.position?.geo?.coordinates?.[1],
        lng: estacion.position?.geo?.coordinates?.[0],
      };
      const distanciaEnMetros = HelperService.distanciaEnMetros(
        ubicacion,
        ubiacionEstacion,
      );
      const distancia = Math.floor(distanciaEnMetros / 1000); // Paso a kms
      this.logger.log(
        `Distancia estacion ${
          estacion.name?.custom || estacion.name?.original
        }: ${distancia} km`,
      );
      estacionesConDistancia.push({
        ...estacion,
        distancia,
      });
    }

    // Ordeno por distancia
    estacionesConDistancia.sort((a, b) => a.distancia - b.distancia);

    // Saco las que están muy lejos (> 30km)
    const estacionesCercanas = estacionesConDistancia.filter(
      (estacion) => estacion.distancia <= 30,
    );

    // // Me fijo que tengan reporte
    // for (const e of estacionesCercanas) {
    //   e.actual = await this.checkReporte(e);
    // }

    if (estacionesCercanas.length === 0) {
      this.logger.error(
        `No hay estaciones cercanas a ${JSON.stringify(ubicacion)}, defaulteando.`,
      );
      return this.prediccionDefault;
    }

    // this.logger.log(
    //   `#${
    //     estacionesCercanas?.length
    //   } Estaciones encontradas para ubicación ${JSON.stringify(ubicacion)}`,
    // );

    const niveles: nivelPrediccion[] = [];

    // Cosas a chequear
    const variedades = [
      'Soja', // EFC
      'Maiz', // ROYA DEL MAIZ
      'Trigo', // MANCHA AMARILLA
      'Trigo1', // ROYA DE LA HOJA
      'Trigo2', // MANCHA DE LA HOJA
      // 'Trigo3', //  ROYA ANARANJADA
      'Trigo4', // FUSARIUM DE LA ESPIGA
    ];

    for (const v of variedades) {
      const update: nivelPrediccion = {};
      switch (v) {
        case 'Soja': {
          // LLUVIA
          update.cultivo = 'Soja';
          update.enfermedad = 'Fin de Ciclo';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.nivel = update.lluvias.nivel;
          niveles.push(update);
          break;
        }
        case 'Maiz': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Maiz';
          update.enfermedad = 'Roya del Maiz';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'velocidadViento',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        case 'Trigo': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Mancha Amarilla';
          update.lluvias = this.getNivel(estacionesCercanas, v, 'lluvias');
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'lluvias',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        case 'Trigo1': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Roya de la Hoja';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'lluvias',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        case 'Trigo2': {
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Mancha de la Hoja';
          update.lluvias = this.getNivel(estacionesCercanas, v, 'lluvias');
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        // case 'Trigo3': {
        //   // Temperatura
        //   // Humedad
        //   // Velocidad del viento
        //   update.cultivo = 'Trigo';
        //   update.enfermedad = 'Roya Anaranjada';
        //   update.lluvias = this.getNivel(estacionesCercanas, v);
        //   update.temperatura = this.getNivel(
        //     estacionesCercanas,
        //     v,
        //     'temperatura',
        //   );
        //   update.humedadRelativa = this.getNivel(
        //     estacionesCercanas,
        //     v,
        //     'humedadRelativa',
        //   );
        //   update.velocidadViento = this.getNivel(
        //     estacionesCercanas,
        //     v,
        //     'velocidadViento',
        //   );
        //   // el más bajo de todos los niveles
        //   update.nivel = Math.min(
        //     update.lluvias?.nivel,
        //     update.temperatura?.nivel,
        //     update.humedadRelativa?.nivel,
        //   );
        // niveles.push(update);
        // break;
        // }
        case 'Trigo4': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Fusarium de la Espiga';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'lluvias',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
      }
    }
    return niveles;
  }

  private getNivel(
    estaciones: IEstacionCercana[],
    variedad:
      | 'Soja'
      | 'Maiz'
      | 'Trigo'
      | 'Trigo1'
      | 'Trigo2'
      | 'Trigo3'
      | 'Trigo4',
    tipo?: 'temperatura' | 'humedadRelativa' | 'velocidadViento' | 'lluvias',
  ) {
    if (variedad === 'Soja') {
      // Distancias
      // Excelente < 5km
      // Bueno < 10km
      // Malo < 20km
      // Agarro la distancia más cercana
      const estacion = estaciones?.[0];
      const distancia = estacion?.distancia;
      const actual = estacion?.actual;
      // Si no es actual es siempre malo
      if (!actual) {
        return {
          distancia,
          idEstacion: estacion._id,
          nivel: SemaforoClima.Malo,
        };
      }
      // Si es actual, le calculo el nivel
      const nivel: calidadNivel = {
        distancia,
        idEstacion: estacion._id,
        nivel:
          distancia < 5
            ? SemaforoClima.Excelente
            : distancia < 10
              ? SemaforoClima.Bueno
              : distancia < 20
                ? SemaforoClima.Malo
                : SemaforoClima.Malo,
      };
      return nivel;
    }
    if (variedad === 'Maiz') {
      if (tipo === 'lluvias') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'humedadRelativa') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'temperatura') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
    }
    if (variedad === 'Trigo') {
      // Temperatura
      // Humedad
      // Lluvias
      if (tipo === 'lluvias') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'humedadRelativa') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'temperatura') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
    }
    if (variedad === 'Trigo1') {
      // Temperatura
      // Humedad
      // Lluvias
      if (tipo === 'lluvias') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'humedadRelativa') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'temperatura') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
    }
    if (variedad === 'Trigo2') {
      // Humedad
      // Lluvias
      if (tipo === 'lluvias') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'humedadRelativa') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
    }
    if (variedad === 'Trigo4') {
      // Temperatura
      // Humedad
      // Lluvias
      if (tipo === 'lluvias') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'humedadRelativa') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
      if (tipo === 'temperatura') {
        const estacion = estaciones[0];
        const distancia = estacion.distancia;
        const actual = estacion.actual;
        // Si no es actual es siempre malo
        if (!actual) {
          return {
            distancia,
            idEstacion: estacion._id,
            nivel: SemaforoClima.Malo,
          };
        }
        // Si es actual, le calculo el nivel
        const nivel: calidadNivel = {
          distancia,
          idEstacion: estacion._id,
          nivel:
            distancia < 5
              ? SemaforoClima.Excelente
              : distancia < 10
                ? SemaforoClima.Bueno
                : distancia < 20
                  ? SemaforoClima.Malo
                  : SemaforoClima.Malo,
        };
        return nivel;
      }
    }
  }

  private async checkReporte(estacion: IEstacionCercana) {
    // Chequeo que tenga un reporte actual
    const hoyDate = new Date();
    const ayer = new Date(hoyDate.setDate(hoyDate.getDate() - 1));

    let fechaUltimoReporte;
    if (estacion.origen === 'FieldClimate') {
      // this.logger.log(`Estación FieldClimate: ${estacion.idExterno}`);
      const reporte = await this.fieldClimate.getDataBetweenDates(
        estacion.idExterno,
        'daily',
        ayer.getTime(),
        hoyDate.getTime(),
        estacion.user,
        estacion.pass,
      );
      if (reporte) {
        if (!reporte.data?.length) {
          // this.logger.log(
          //   `No hay reportes para la estación ${estacion.idExterno}`,
          // );
          return false;
        }
        const parseado = this.parsearClimaFieldClimate(
          estacion,
          reporte,
          'daily',
        );
        if (parseado.length > 0) {
          fechaUltimoReporte = new Date(parseado[0].fecha).toISOString();
        }
      }
    }
    if (estacion.origen === 'Omixom') {
      // this.logger.log(`Estación Omixom: ${estacion.idExterno}`);
      const reporte = await this.omixomService.getUltimaMuestraPorIdEstaciones([
        +estacion.idExterno,
      ]);
      if (reporte) {
        fechaUltimoReporte = new Date(reporte[0].date).toISOString();
      }
    }
    if (estacion.origen === 'Chaman') {
      // No hay todavía
      return false;
    }
    const actual = this.chequearFecha(fechaUltimoReporte);
    return actual;
  }

  private chequearFecha(fecha: string) {
    // true si la fecha esta a menos de 24 horas de hoy
    const hoy = new Date();
    const fechaDate = new Date(fecha);
    const diff = Math.abs(hoy.getTime() - fechaDate.getTime());
    const diffHours = diff / (1000 * 60 * 60);
    return diffHours < 24;
  }

  async getNivelPrediccionPorUbicacion(
    ubicacion: ICoordenadas,
  ): Promise<nivelPrediccion[]> {
    /// Traigo las estaciones a menos de 50km
    const filter: IFilter<IEstacion> = {
      'position.geo': {
        $geoWithin: {
          $centerSphere: [[+ubicacion.lng, +ubicacion.lat], 50 / 6378.1], // 50 km
        },
      },
    } as any;
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 1000,
    };
    const estaciones = (await this.estacionsService.getFiltered(query)).datos;
    if (!estaciones) {
      this.logger.error(
        `Estaciones no encontradas para ubicacion ${JSON.stringify(ubicacion)}`,
      );
      return [];
    }

    const estacionesConDistancia: IEstacionCercana[] = [];
    for (const estacion of estaciones) {
      const ubiacionEstacion: ICoordenadas = {
        lat: estacion.position.geo.coordinates[1],
        lng: estacion.position.geo.coordinates[0],
      };
      const distanciaEnMetros = HelperService.distanciaEnMetros(
        ubicacion,
        ubiacionEstacion,
      );
      const distancia = Math.floor(distanciaEnMetros / 1000); // Paso a kms
      estacionesConDistancia.push({
        ...estacion,
        distancia,
      });
    }

    // Ordeno por distancia
    estacionesConDistancia.sort((a, b) => a.distancia - b.distancia);

    // Saco las que están muy lejos (> 30km)
    const estacionesCercanas = estacionesConDistancia.filter(
      (estacion) => estacion.distancia <= 30,
    );

    // Me fijo que tengan reporte
    for (const e of estacionesCercanas) {
      e.actual = await this.checkReporte(e);
    }

    // this.logger.log(
    //   `#${
    //     estacionesCercanas?.length
    //   } Estaciones encontradas para ubicación ${JSON.stringify(ubicacion)}`,
    // );

    const niveles: nivelPrediccion[] = [];

    // Cosas a chequear
    const variedades = [
      'Soja', // EFC
      'Maiz', // ROYA DEL MAIZ
      'Trigo', // MANCHA AMARILLA
      'Trigo1', // ROYA DE LA HOJA
      'Trigo2', // MANCHA DE LA HOJA
      // 'Trigo3', //  ROYA ANARANJADA
      'Trigo4', // FUSARIUM DE LA ESPIGA
    ];

    for (const v of variedades) {
      const update: nivelPrediccion = {};
      switch (v) {
        case 'Soja': {
          // LLUVIA
          update.cultivo = 'Soja';
          update.enfermedad = 'Fin de Ciclo';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.nivel = update.lluvias.nivel;
          niveles.push(update);
          break;
        }
        case 'Maiz': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Maiz';
          update.enfermedad = 'Roya del Maiz';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'velocidadViento',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        case 'Trigo': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Mancha Amarilla';
          update.lluvias = this.getNivel(estacionesCercanas, v, 'lluvias');
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'lluvias',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        case 'Trigo1': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Roya de la Hoja';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'lluvias',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        case 'Trigo2': {
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Mancha de la Hoja';
          update.lluvias = this.getNivel(estacionesCercanas, v, 'lluvias');
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
        // case 'Trigo3': {
        //   // Temperatura
        //   // Humedad
        //   // Velocidad del viento
        //   update.cultivo = 'Trigo';
        //   update.enfermedad = 'Roya Anaranjada';
        //   update.lluvias = this.getNivel(estacionesCercanas, v);
        //   update.temperatura = this.getNivel(
        //     estacionesCercanas,
        //     v,
        //     'temperatura',
        //   );
        //   update.humedadRelativa = this.getNivel(
        //     estacionesCercanas,
        //     v,
        //     'humedadRelativa',
        //   );
        //   update.velocidadViento = this.getNivel(
        //     estacionesCercanas,
        //     v,
        //     'velocidadViento',
        //   );
        //   // el más bajo de todos los niveles
        //   update.nivel = Math.min(
        //     update.lluvias?.nivel,
        //     update.temperatura?.nivel,
        //     update.humedadRelativa?.nivel,
        //   );
        // niveles.push(update);
        // break;
        // }
        case 'Trigo4': {
          // Temperatura
          // Humedad
          // Lluvias
          update.cultivo = 'Trigo';
          update.enfermedad = 'Fusarium de la Espiga';
          update.lluvias = this.getNivel(estacionesCercanas, v);
          update.temperatura = this.getNivel(
            estacionesCercanas,
            v,
            'temperatura',
          );
          update.humedadRelativa = this.getNivel(
            estacionesCercanas,
            v,
            'humedadRelativa',
          );
          update.velocidadViento = this.getNivel(
            estacionesCercanas,
            v,
            'lluvias',
          );
          // el más bajo de todos los niveles
          update.nivel = Math.min(
            update.lluvias?.nivel || 3,
            update.temperatura?.nivel || 3,
            update.humedadRelativa?.nivel || 3,
          );
          niveles.push(update);
          break;
        }
      }
    }
    return niveles;
  }
}

export enum SemaforoClima {
  Excelente = 1,
  Bueno = 2,
  Malo = 3,
}
