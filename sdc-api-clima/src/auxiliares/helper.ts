import { PRIVATE_KEY, PUBLIC_KEY } from '../env';
import crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { IStation } from '../entidades/fieldClimate/modelos/station';
import { IStationData } from '../entidades/fieldClimate/modelos/stationData';
import { RawAxiosRequestHeaders } from 'axios';
import { IDispositivo, IEstacion, Sensores, SensoresV2 } from 'modelos/src';
import * as fs from 'fs';
import * as path from 'path';

export interface ICoordenadas {
  lat: number;
  lng: number;
}

export class HelperService {
  static getFieldClimateHeaders(
    method: string,
    request: string,
  ): RawAxiosRequestHeaders {
    const timestamp = new Date().toUTCString();
    const contentToSign = `${method}${request}${timestamp}${PUBLIC_KEY}`;

    const signature = crypto
      .createHmac('sha256', PRIVATE_KEY)
      .update(contentToSign)
      .digest()
      .toString('hex');

    const headers: RawAxiosRequestHeaders = {
      Accept: 'application/json',
      Authorization: `hmac ${PUBLIC_KEY}:${signature}`,
      Date: timestamp,
    };

    return headers;
  }

  static getFieldClimateHeadersLogin(token: string): RawAxiosRequestHeaders {
    const headers: RawAxiosRequestHeaders = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: 'https://www.fieldclimate.com',
      Referer: 'https://www.fieldclimate.com/',
    };

    return headers;
  }

  static distanciaEnMetros(punto1: ICoordenadas, punto2: ICoordenadas) {
    if (+punto1?.lat && +punto1?.lng && +punto2?.lat && +punto2?.lng) {
      const R = 6371e3; // metres
      const φ1 = punto1.lat * (Math.PI / 180); // φ, λ in radians
      const φ2 = punto2.lat * (Math.PI / 180);
      const Δφ = (punto2.lat - punto1.lat) * (Math.PI / 180);
      const Δλ = (punto2.lng - punto1.lng) * (Math.PI / 180);

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const d = R * c; // in metres
      return d;
    }
    throw new BadRequestException(
      `Error en los parametros de distancia, ${JSON.stringify({
        punto1,
        punto2,
      })}`,
    );
  }

  static distanciaStationEnMetros(punto: ICoordenadas, estacion: IStation) {
    const coordEstacion: ICoordenadas = {
      lng: estacion.position.geo.coordinates[0],
      lat: estacion.position.geo.coordinates[1],
    };
    return Math.trunc(this.distanciaEnMetros(punto, coordEstacion));
  }

  static distanciaEstacionEnMetros(punto: ICoordenadas, estacion: IEstacion) {
    const coordEstacion: ICoordenadas = {
      lng: estacion.position.geo.coordinates[0],
      lat: estacion.position.geo.coordinates[1],
    };
    return Math.trunc(this.distanciaEnMetros(punto, coordEstacion));
  }

  static distanciaDispositivoEnMetros(
    punto: ICoordenadas,
    dispositivo: IDispositivo,
  ) {
    const coordEstacion: ICoordenadas = {
      lng: dispositivo.geojson.coordinates[0],
      lat: dispositivo.geojson.coordinates[1],
    };
    return Math.trunc(this.distanciaEnMetros(punto, coordEstacion));
  }

  static horasTranscurridasDesde(fecha: Date) {
    const horaActual = new Date();
    const horaFecha = new Date(fecha);
    const diferencia = horaActual.getTime() - horaFecha.getTime();
    const horasTranscurridas = Math.floor(diferencia / (1000 * 60 * 60));
    return horasTranscurridas;
  }

  static getHR(data: IStationData, fecha: Date) {
    const indexFecha = data.dates.indexOf(
      HelperService.fechaToClimaDate(fecha),
    );
    const nombreSensores = ['I2C Rel Humidity', 'HC Relative humidity'];
    const dataHR = data.data.find((d) =>
      nombreSensores.includes(d.name_original),
    );
    const HR = dataHR?.values?.avg[indexFecha];
    return HR;
  }

  static getTAvg(data: IStationData, fecha: Date) {
    const indexFecha = data.dates.indexOf(
      HelperService.fechaToClimaDate(fecha),
    );
    const nombreSensores = ['I2C Temperature', 'HC Air temperature'];
    const dataTemp = data.data.find((d) =>
      nombreSensores.includes(d.name_original),
    );
    const temp = dataTemp?.values?.avg[indexFecha];
    return temp;
  }

  static getTMin(data: IStationData, fecha: Date) {
    const indexFecha = data.dates.indexOf(
      HelperService.fechaToClimaDate(fecha),
    );
    const nombreSensores = ['I2C Temperature', 'HC Air temperature'];
    const dataTemp = data.data.find((d) =>
      nombreSensores.includes(d.name_original),
    );
    const temp = dataTemp?.values?.min[indexFecha];
    return temp;
  }

  static getTMax(data: IStationData, fecha: Date) {
    const indexFecha = data.dates.indexOf(
      HelperService.fechaToClimaDate(fecha),
    );
    const nombreSensores = ['I2C Temperature', 'HC Air temperature'];
    const dataTemp = data.data.find((d) =>
      nombreSensores.includes(d.name_original),
    );
    const temp = dataTemp?.values?.max[indexFecha];
    return temp;
  }

  static getPrecip(data: IStationData, fecha: Date) {
    const indexFecha = data.dates.indexOf(
      HelperService.fechaToClimaDate(fecha),
    );
    const dataPrecip = data.data.find(
      (d) => d.name_original === 'Precipitation',
    );
    const precip = dataPrecip?.values?.sum[indexFecha];
    return precip;
  }

  static fechaToClimaDate(fecha: Date) {
    const year = fecha.getUTCFullYear();
    const month = `0${fecha.getUTCMonth() + 1}`.slice(-2);
    const day = `0${fecha.getUTCDate()}`.slice(-2);
    const date = `${year}-${month}-${day} 00:00:00`;
    return date;
  }

  static fechasUltimoDias(dias: number) {
    const fechaHasta = new Date().toISOString();
    const fechaDesde = new Date();
    fechaDesde.setDate(fechaDesde.getDate() - dias);
    return { fechaDesde: fechaDesde.toISOString(), fechaHasta };
  }

  static diffHoras(date1: Date, date2: Date) {
    const diffMs = Math.abs(date1.getTime() - date2.getTime());
    const diffHoras = Math.round(diffMs / 3600000);
    return diffHoras;
  }

  // Calculo de ET0
  // Funciones auxiliares para calcular los componentes de la ecuación
  static calcularEs(tMax: number, tMin: number): number {
    // e_s = (e_s(Tmax) + e_s(Tmin)) / 2
    const esMax = 0.6108 * Math.exp((17.27 * tMax) / (tMax + 237.3));
    const esMin = 0.6108 * Math.exp((17.27 * tMin) / (tMin + 237.3));
    return (esMax + esMin) / 2;
  }

  static calcularEa(es: number, humedadRelativa: number): number {
    // e_a = e_s * (humedad relativa media / 100)
    return es * (humedadRelativa / 100);
  }

  static calcularDelta(tMedia: number): number {
    // Δ = (4098 * (0.6108 * exp((17.27 * T) / (T + 237.3)))) / (T + 237.3)^2
    const expTerm = Math.exp((17.27 * tMedia) / (tMedia + 237.3));
    return (4098 * 0.6108 * expTerm) / Math.pow(tMedia + 237.3, 2);
  }

  static calcularConstantePsicrometrica(presionAtmosferica: number): number {
    // γ = 0.665 * 10^-3 * presion atmosférica
    return 0.000665 * presionAtmosferica;
  }

  // Función principal para calcular ET0 con Penman-Monteith FAO-56
  static calcularET0PenmanMonteith(
    tMax: number, // Temperatura máxima en °C
    tMin: number, // Temperatura mínima en °C
    humedadRelativa: number, // Humedad relativa media en %
    velocidadViento: number, // Velocidad del viento a 2m en m/s
    rn: number, // Radiación neta en la superficie en MJ/m²/día
    presionAtmosferica: number, // Presión atmosférica en kPa
  ): number {
    const tMedia = (tMax + tMin) / 2; // Temperatura media
    const es = HelperService.calcularEs(tMax, tMin); // Presión de vapor de saturación
    const ea = HelperService.calcularEa(es, humedadRelativa); // Presión de vapor actual
    const delta = HelperService.calcularDelta(tMedia); // Pendiente de la curva de presión de vapor
    const gamma =
      HelperService.calcularConstantePsicrometrica(presionAtmosferica); // Constante psicrométrica

    // Calcular ET0
    const numerador =
      0.408 * delta * rn +
      gamma * (900 / (tMedia + 273)) * velocidadViento * (es - ea);
    const denominador = delta + gamma * (1 + 0.34 * velocidadViento);

    return numerador / denominador;
  }

  // Coordenadas
  static transformCoordinates(
    lat: string,
    lon: string,
  ): { lat: number; lng: number } {
    // Function to parse the coordinate string and convert it to a number with the correct sign
    const parseCoordinate = (
      coord: string,
      positiveDirection: string,
    ): number => {
      const direction = coord.slice(-1); // Get the last character (N, S, E, W)
      const value = parseFloat(coord.slice(0, -1)); // Get the numeric part

      // If the direction is not the positive direction, negate the value
      return direction === positiveDirection ? value : -value;
    };

    // Parse latitude (N/S) and longitude (E/W)
    const latitude = parseCoordinate(lat, 'N');
    const longitude = parseCoordinate(lon, 'E');

    // Return the coordinates in EPSG:4326 format
    return { lat: latitude, lng: longitude };
  }

  static polyToGeojson(p: ICoordenadas[]) {
    const geojson: [number, number][] = [];
    for (const punto of p) {
      geojson.push([punto.lng, punto.lat]);
    }
    geojson.push(geojson[0]);
    return geojson;
  }

  static coorToGeoJson(c: ICoordenadas): [number, number] {
    return [c.lng, c.lat];
  }

  /**
   * Guarda de forma asíncrona un array de objetos en un archivo .json dentro del sistema de archivos del pod.
   * Es ideal para depurar requests en el backend.
   *
   * @param directoryPath La ruta de la carpeta donde se guardará el archivo (ej: 'src/debug-files').
   * @param fileName El nombre del archivo (ej: 'request-data.json'). Debe incluir la extensión .json.
   * @param data El array de objetos a guardar.
   * @returns Una promesa que se resuelve cuando el archivo se ha escrito correctamente.
   */
  static async saveJsonToFile(
    directoryPath: string,
    fileName: string,
    data: any[],
  ): Promise<void> {
    try {
      // 1. Resuelve la ruta completa del directorio de forma segura
      const absoluteDirPath = path.resolve(process.cwd(), directoryPath);

      // 2. Crea el directorio si no existe.
      //    El flag { recursive: true } asegura que se creen todas las carpetas anidadas necesarias.
      if (!fs.existsSync(absoluteDirPath)) {
        fs.mkdirSync(absoluteDirPath, { recursive: true });
        console.log(`Directorio creado: ${absoluteDirPath}`);
      }

      // 3. Convierte el objeto a una cadena JSON formateada
      const jsonString = JSON.stringify(data, null, 2);

      // 4. Define la ruta completa del archivo
      const filePath = path.join(absoluteDirPath, fileName);

      // 5. Escribe el archivo de forma asíncrona
      await fs.promises.writeFile(filePath, jsonString, 'utf8');

      console.log(`✅ Archivo JSON guardado exitosamente en: ${filePath}`);
    } catch (error) {
      console.error('❌ Error al guardar el archivo JSON:', error);
      // Lanza el error para que el código que llama a la función pueda manejarlo
      throw error;
    }
  }

  /**
   * Verifica si un array tiene elementos.
   * @param a - El array a verificar.
   * @returns `true` si el array no es nulo/indefinido y tiene elementos, `false` en caso contrario.
   * @example
   * HelperService.checkArray([1, 2, 3]); // true
   * HelperService.checkArray([]); // false
   * HelperService.checkArray(null); // false
   */
  static checkArray(a: any[] | null | undefined): boolean {
    return !!a && a.length > 0;
  }

  public static sensorMap: Record<Sensores, SensoresV2> = {
    temperatura: 'Temperatura',
    temperatura_suelo: 'Temperatura Suelo',
    humedad: 'Humedad',
    humedad_suelo_superficial: 'Humedad Suelo Superficial',
    humedad_suelo_profundidad: 'Humedad Suelo Profundidad',
    viento_velocidad: 'Viento Velocidad',
    viento_direccion: 'Viento Dirección',
    pluviometro: 'Pluviometro',
    presion: 'Presión',
    evapotranspiracion: 'Evapotranspiración',
    radiacion_solar: 'Radiación Solar',
    napa: 'Napa',
    otro: 'Otro',
  };

  public static toSensoresV2 = (sensor: Sensores): SensoresV2 => {
    return this.sensorMap[sensor] || 'Otro'; // Devuelve 'Otro' si no encuentra el sensor
  };
}
