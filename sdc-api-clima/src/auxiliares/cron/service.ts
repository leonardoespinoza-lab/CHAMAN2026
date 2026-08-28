import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  EstacionsService,
  IEstacionCercana,
} from '../../entidades/estacion/service';
import {
  ICreateEstacion,
  IUpdateLote,
  nivelPrediccion,
  Sensores,
} from 'modelos/src';
import {
  CLIMA_LEGACY_CRONS_ENABLED,
  CRON_TEST,
  FIELD_CLIMATE_PASS,
  FIELD_CLIMATE_USERS,
} from '../../env';
import { FieldClimateService } from '../../entidades/fieldClimate/service';
import { LogService } from '../logsService/service';
import { OmixomService } from 'src/entidades/omixom/service';
import { LotesService } from 'src/entidades/lote/service';
import { ClimaService } from 'src/entidades/clima/service';
import { protectFieldClimateCredential } from '../fieldclimate-credentials';

@Injectable()
export class CronService {
  private logger = new LogService(CronService.name);

  private sensoresFieldClimateMap: { [key: string]: Sensores | null } = {
    time: null,
    rain7d: 'pluviometro',
    rain48h: 'pluviometro',
    rain24h: 'pluviometro',
    rainfall: 'pluviometro',
    volumetricAverage: 'humedad_suelo_superficial',
    soilMoisture: 'humedad_suelo_profundidad',
    soilMoisture1: 'humedad_suelo_profundidad',
    soilMoisture2: 'humedad_suelo_profundidad',
    soilMoisture3: 'humedad_suelo_profundidad',
    airTemp: 'temperatura',
    soilTemp: 'temperatura_suelo',
    rh: 'humedad',
    humidity: 'humedad',
    windSpeed: 'viento_velocidad',
    windDirection: 'viento_direccion',
    pressure: 'presion',
    et0: 'evapotranspiracion',
    evapotranspiration: 'evapotranspiracion',
    solarRadiation: 'radiacion_solar',
  };

  private sensoresOmixomMap: Record<string, Sensores | null> = {
    time: null,
    airTemp: 'temperatura',
    soilTemp: 'temperatura_suelo',
    rh: 'humedad',
    volumetricAverage: 'humedad_suelo_superficial',
    soilMoisture: 'humedad_suelo_profundidad',
    soilMoisture1: 'humedad_suelo_profundidad',
    soilMoisture2: 'humedad_suelo_profundidad',
    windSpeed: 'viento_velocidad',
    windDirection: 'viento_direccion',
    rain7d: 'pluviometro',
    rain48h: 'pluviometro',
    rain24h: 'pluviometro',
    pressure: 'presion',
    et: 'evapotranspiracion',
    solarRadiation: 'radiacion_solar',
    solarPanel: 'otro',
    battery: 'otro',
    windGust: 'otro',
    dewPoint: 'otro',
    signalStrength: 'otro',
    batteryTemperature: 'otro',
  };

  constructor(
    private estacionesService: EstacionsService,
    private fieldClimate: FieldClimateService,
    private omixom: OmixomService,
    private lotesService: LotesService,
    private climasService: ClimaService,
  ) {
    this.logger.verbose('CronService iniciado');
    this.logger.verbose(`CRON_TEST: ${CRON_TEST ? '👍' : '👎'}`);
  }

  // @Cron(CronExpression.EVERY_30_SECONDS)
  // async test() {
  //   Logger.log('Cron test');
  // }

  @Cron(
    CRON_TEST ? CronExpression.EVERY_MINUTE : CronExpression.EVERY_DAY_AT_7AM,
  )
  async actualizarEstacionesAutomaticamente() {
    if (!CLIMA_LEGACY_CRONS_ENABLED) {
      Logger.log('Actualizacion automatica de estaciones deshabilitada');
      return;
    }
    return await this.actualizarEstaciones();
  }

  async actualizarEstaciones() {
    Logger.log(`Iniciando actualización de estaciones`);
    await this.getEstacionesFieldClimate();
    await this.getEstacionesOmixom();
    const res = Logger.log('Estaciones actualizadas');
    return res;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async calcularNivelesAutomaticamente() {
    if (!CLIMA_LEGACY_CRONS_ENABLED) {
      Logger.log('Calculo automatico de semaforo deshabilitado');
      return;
    }
    return await this.calcularNiveles();
  }

  async calcularNiveles() {
    Logger.log(`Iniciando cálculo de semáforo`);
    await this.calcularNivelesPrediccionLotes();
    const res = Logger.log('Semáforo calculado');
    return res;
  }

  private async getEstacionesFieldClimate() {
    const stations: ICreateEstacion[] = [];

    for (let i = 0; i < FIELD_CLIMATE_USERS.length; i++) {
      const user = FIELD_CLIMATE_USERS[i];
      const pass = FIELD_CLIMATE_PASS[i];
      this.logger.debug(`Obteniendo estaciones de ${user}`);
      const stationsUser = await this.fieldClimate.getStations(user, pass);
      this.logger.debug(
        `${stationsUser.length} Estaciones obtenidas de ${user}`,
      );
      for (const station of stationsUser) {
        const idExterno = station.name.original;
        const existe = stations.find((s) => s.idExterno === idExterno);
        if (existe) continue;

        station.dates.max_date = new Date(
          `${station.dates.max_date} GMT-0300`,
        ).toISOString();
        station.dates.min_date = new Date(
          `${station.dates.min_date} GMT-0300`,
        ).toISOString();
        station.dates.last_communication = new Date(
          `${station.dates.last_communication} GMT-0300`,
        ).toISOString();
        station.dates.created_at = new Date(
          `${station.dates.created_at} GMT-0300`,
        ).toISOString();

        const setSensores = new Set<Sensores>(); // Usar Set para evitar duplicados
        const meta = station?.meta;
        if (!meta) {
          this.logger.warn(
            `Estación ${idExterno} no tiene metadatos, se omite.`,
          );
          continue;
        }
        Object.keys(meta).forEach((key) => {
          const sensorType = this.sensoresFieldClimateMap[key];
          if (sensorType) {
            setSensores.add(sensorType); // Agregar sensor si está mapeado
          } else if (key !== 'time') {
            setSensores.add('otro'); // Campos no reconocidos van a 'otro'
          }
        });

        const sensores = Array.from(setSensores); // Convertir Set a array

        const create: ICreateEstacion = {
          origen: 'FieldClimate',
          idExterno,
          user: protectFieldClimateCredential(user),
          pass: protectFieldClimateCredential(pass),
          dates: station.dates,
          info: station.info,
          position: station.position,
          name: station.name,
          sensores,
        };
        stations.push(create);
      }
    }
    this.logger.debug(
      `Estaciones obtenidas de FieldClimate: ${stations.length}`,
    );
    if (stations.length === 0) {
      this.logger.warn('No se encontraron estaciones de FieldClimate');
      return;
    }
    await this.estacionesService.upsertMany(stations);
  }

  private async getEstacionesOmixom() {
    try {
      const estaciones = await this.omixom.getEstaciones();
      const stations: ICreateEstacion[] = [];
      for (const e of estaciones) {
        const idExterno = `${e.code}`;
        const coordenada = {
          lat: +e.latitude,
          lng: +e.longitude,
        };
        // Normalizar sensores
        const setSensores = new Set<Sensores>(); // Usar Set para evitar duplicados
        for (const m of e.modules) {
          const moduleType = ModuleType[m.type as keyof typeof ModuleType];
          if (!moduleType) {
            this.logger.warn(`Tipo de módulo desconocido: ${m.type}`);
            setSensores.add('otro');
            continue;
          }
          const sensorType = this.sensoresOmixomMap[moduleType] || 'otro';
          setSensores.add(sensorType);
        }
        const sensores = Array.from(setSensores); // Convertir Set a array
        const create: ICreateEstacion = {
          origen: 'Omixom',
          idExterno,
          position: {
            geo: {
              type: 'Point',
              coordinates: [coordenada.lng, coordenada.lat],
            },
            altitude: 0,
            hdop: 0,
            measure_time: 0,
            timezoneCode: 'America/Argentina/Buenos_Aires',
          },
          name: {
            original: e.title,
            custom: e.title,
          },
          sensores,
          modulos: e.modules.map((m) => ({
            // Modulos para poder procesar los datos de Omixom
            // id?: number;
            // title?: string;
            // type?: string;
            // tipo?: string; // Temperatura, Humedad, etc para nosotros
            id: m.id,
            title: m.title,
            type: m.type,
            tipo: ModuleType[m.type as keyof typeof ModuleType], // Para compatibilidad con el frontend
          })),
        };
        stations.push(create);
      }
      this.logger.debug(`Estaciones obtenidas de Omixom: ${stations.length}`);
      if (stations.length === 0) {
        this.logger.warn('No se encontraron estaciones de Omixom');
        return;
      }
      // Actualizo las estaciones en la base de datos
      await this.estacionesService.upsertMany(stations);
    } catch (error) {
      this.logger.error(`Error al obtener estaciones de Omixom: ${error}`);
    }
  }

  private async calcularNivelesPrediccionLotes() {
    try {
      /// 1 - Traigo los lotes
      const lotes = await this.lotesService.get({});
      /// 2 - Traigo todas las estaciones
      const estaciones = (await this.estacionesService.getFiltered({}))
        .datos as IEstacionCercana[];
      /// 2.5 Chequeo que esten acticas (reportes recientes)
      // Me fijo que tengan reporte
      for (const e of estaciones) {
        e.actual = await this.checkReporte(e);
      }
      // 2.9 Saco las que no tienen reporte
      const estacionesActivas = estaciones.filter((e) => e.actual);
      this.logger.debug(
        `Estaciones activas: ${estacionesActivas.length} de ${estaciones.length}`,
      );
      /// 3 - Hago promesas por cada lote así puedo hacerlas en paralelo
      const fecha = new Date().toISOString();
      const promesas = lotes.datos.map(async (lote) => {
        // this.logger.debug(`
        //   Lote: ${lote?.nombre} > ${lote?._id} > ${lote?.ubicacion?.centro?.lat} > ${lote?.ubicacion?.centro?.lng}
        //   `);
        // 4 - Calculo el semaforo por lote
        const centro = lote?.ubicacion?.centro;
        if (!centro) {
          this.logger.debug(`No tiene centro`);
          return null;
        }
        const res = await this.climasService.getNivelPrediccion(
          centro,
          estacionesActivas,
        );
        const update: IUpdateLote = {
          calidadClima: {
            fecha,
            nivelPrediccion: res,
            nivel: this.getPeorNivel(res),
          },
        };
        // 5 - Actualizo el lote
        return this.lotesService.update(lote._id, update);
      });
      // 6 - Espero a que todas las promesas se resuelvan
      await Promise.all(promesas);
    } catch (error) {
      console.error(error);
    }
  }

  private getPeorNivel(niveles: nivelPrediccion[]): number {
    // Devuelve el peor nivel de los niveles pasados
    if (!niveles || niveles.length === 0) return 3;
    const peor = niveles.reduce((prev, curr) => {
      return prev.nivel < curr.nivel ? prev : curr;
    });
    return peor.nivel || 3; // Si no tiene nivel, devuelve 3 (Malo)
  }

  private async checkReporte(estacion: IEstacionCercana) {
    // Chequeo que tenga un reporte actual
    const hoyDate = new Date();
    const ayer = new Date(hoyDate);
    ayer.setDate(ayer.getDate() - 1);

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
        const parseado = this.climasService.parsearClimaFieldClimate(
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
      const reporte = await this.omixom.getUltimaMuestraPorIdEstaciones([
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
}

export enum ModuleType {
  'Alertas de Heladas y Agroapp' = 'Alerta de heladas',
  BUI = 'Build Up Index', // Build Up Index
  'Nivel de Batería' = 'Batería',
  DC = 'Drought Code', // Drought Code
  DMC = 'Duff Moisture Code', // Duff Moisture Code
  'Delta T' = 'Delta Temperatura', // Diferencia de Temperatura
  'Delta T - Recomendación' = 'Delta Temperatura - Recomendación',
  'Dirección de Viento' = 'Dirección de Viento',
  Evapotranspiración = 'Evapotranspiración',
  FFMC = 'Fine Fuel Moisture Code', // Fine Fuel Moisture Code
  'Fase Lunar, Amanecer y Ocaso' = 'Fase Lunar, Amanecer y Ocaso',
  Humedad = 'Humedad',
  ISI = 'Initial Spread Index', // Initial Spread Index
  ITH = 'Inicio de Temporada de Heladas', // Inicio de Temporada de Heladas
  'Indice de peligro de incendios' = 'Indice de peligro de incendios',
  'Nivel de agua subterranea' = 'Nivel de Napa Freática',
  'Panel Solar' = 'Panel Solar',
  Presión = 'Presión',
  'Punto de rocío' = 'Punto de rocío',
  'Radiación Solar' = 'Radiación Solar',
  'Registro de lluvia' = 'Registro de lluvia',
  'Rafaga de Viento' = 'Ráfaga de Viento',
  'Señal GPRS' = 'Señal',
  Temperatura = 'Temperatura',
  'Temperatura de suelo' = 'Temperatura de suelo',
  'Velocidad de Viento' = 'Velocidad de Viento',
}

// ESTACIONES DE HORATECH
// numeroMensaje?: number;
// tilt?: boolean;
// /**
//  * @deprecated
//  */
// horaGps?: boolean;
// fechaReporte?: string;
// // Datos Reportados
// temperatura?: number;
// humedad?: number;
// presion?: number;
// intensidadLuminica?: number;
// direccionVientoMinima?: number;
// direccionVientoMaxima?: number;
// direccionVientoPromedio?: number;
// velocidadVientoMinima?: number;
// velocidadVientoMaxima?: number;
// velocidadVientoPromedio?: number;
// lluviaAcumulada?: number;
// duracionLluviaAcumulada?: number;
// /**
//  * @deprecated
//  */
// intensidadLluvia?: number;
// /**
//  * @deprecated
//  */
// intensidadMaximaLluvia?: number;
// // Datos Calculados
// lluviaIntervalo?: number;
// duracionLlueviaIntervalo?: number;
// fechaDesde?: string;

// Freatimetro
// alerta?: boolean;
// nivel?: number;
// bateria?: number;
// bateriaBaja?: boolean;
// alertaNivel?: {
//   nivel?: string;
//   color?: string;
//   nivelAjustado?: number;
// };

// Pluviometro
// pulsos?: number;
// sensibilidad?: number;
// valorAcumulado?: number;
// bateria?: number;
// cargando?: boolean;
// // Calculados
// fechaDesde?: string;
// tiempoInstantaneo?: number; // Diferencia con el reporte anterior
// valorInstantaneo?: number; // Diferencia con el reporte anterior

// Sensor Humedad de Suelo
// humedad: number;
// temperatura: number;

// Lanza de Humedad // Lo mismo que SHS pero con profudidades
// humedad1?: number;
// temperatura1?: number;
// humedad2?: number;
// temperatura2?: number;
// humedad3?: number;
// temperatura3?: number;
// humedad4?: number;
// temperatura4?: number;
// humedad5?: number;
// temperatura5?: number;
// humedad6?: number;
// temperatura6?: number;
// humedad7?: number;
// temperatura7?: number;
// humedad8?: number;
// temperatura8?: number;
// humedad9?: number;
// temperatura9?: number;
// humedad10?: number;
// temperatura10?: number;
