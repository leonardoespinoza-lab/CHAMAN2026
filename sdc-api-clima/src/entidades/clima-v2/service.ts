import { BadRequestException, Injectable } from '@nestjs/common';
import { HelperService, ICoordenadas } from '../../auxiliares/helper';
import { FieldClimateService } from '../fieldClimate/service';
import {
  IStationData,
  TDataReporte,
} from '../fieldClimate/modelos/stationData';
import { LogService } from '../../auxiliares/logsService/service';
import { EstacionsService, IEstacionCercana } from '../estacion/service';
import SunCalc from 'suncalc';
import { MeteoSourceService } from '../meteoSource/service';
import {
  DataPoint,
  IForecastMeteoSource,
  ITimeMachineMeteoSource,
} from '../meteoSource/modelos/modelos';
import {
  IValores,
  IClimaEstacionMeteorologica,
  IPronosticoEstacionMeteorologica,
  IPronosticoMeteoSource,
  Sensores,
  Sample,
  SensoresV2,
  IReporte,
} from 'modelos/src';
import { OmixomService } from '../omixom/service';
import { HoratechService } from '../horatech/service';
import { IReporteHoratech } from '../horatech/modelos';
import {
  DispositivosService,
  IDispositivoCercano,
} from '../dispositivos/service';
import { ReportesService } from '../reportes/service';

@Injectable()
export class ClimaV2Service {
  private logger = new LogService(ClimaV2Service.name);

  constructor(
    private fieldClimate: FieldClimateService,
    private meteoSourceService: MeteoSourceService,
    private omixomService: OmixomService,
    private estacionsService: EstacionsService,
    private horatechService: HoratechService,
    private dispositivosService: DispositivosService,
    private reportesService: ReportesService,
  ) {
    // this.testSemaforo();
    // this.testClima();
  }

  public async testClima() {
    const ubicacion: ICoordenadas = {
      lat: -34.6037,
      lng: -58.3816,
    };
    const fechaDesde = '2023-10-01';
    const fechaHasta = '2023-10-02';
    const sensores: Sensores[] = ['pluviometro', 'radiacion_solar'];

    const clima = await this.getClima(
      ubicacion,
      'daily',
      fechaDesde,
      fechaHasta,
      sensores,
    );
    console.log('Clima obtenido:', clima);
  }

  public async getSuelo(
    idDispositivo: string,
    desde: string,
    hasta: string,
    agrupacion: 'hourly' | 'daily' = 'daily',
  ) {
    this.logger.log(
      `Obteniendo datos de suelo para el dispositivo ${idDispositivo} entre ${desde} y ${hasta}`,
    );

    const reportes = await this.reportesService.getByIdDispositivoEntreFechas(
      idDispositivo,
      desde,
      hasta,
    );

    if (!HelperService.checkArray(reportes.datos)) {
      this.logger.warn(
        `No se encontraron reportes de suelo para el dispositivo ${idDispositivo} entre ${desde} y ${hasta}.`,
      );
      return [];
    }

    const reportesNormalizados = this.parsearReportes(reportes.datos);

    // Aplicar la agrupación deseada con el switch
    switch (agrupacion) {
      case 'hourly':
        return this.agruparPorHora(reportesNormalizados);
      case 'daily':
      default:
        return this.agruparPorDia(reportesNormalizados);
    }
  }

  public async getClima(
    ubicacion: ICoordenadas,
    agrupacion: 'hourly' | 'daily' = 'daily',
    fechaDesde?: string,
    fechaHasta?: string,
    sensores?: Sensores[],
    distancia?: number,
  ): Promise<IClimaEstacionMeteorologica[]> {
    if (!ubicacion) {
      throw new BadRequestException(
        'No se ha proporcionado una ubicación válida.',
      );
    }

    // Flujo 1: Se solicitaron sensores específicos.
    if (HelperService.checkArray(sensores)) {
      this.logger.log(
        `Iniciando búsqueda con sensores: ${sensores.join(', ')}`,
      );

      // Intento 1: Buscar en estaciones físicas externas (FieldClimate, Omixom, Horatech).
      this.logger.log('Intentando obtener clima de estaciones físicas...');
      const climaEstaciones = await this.climaDeEstaciones(
        ubicacion,
        agrupacion,
        fechaDesde,
        fechaHasta,
        sensores,
        distancia,
      );

      if (HelperService.checkArray(climaEstaciones)) {
        this.logger.log(
          `Éxito: Se encontraron ${climaEstaciones.length} reportes de estaciones.`,
        );
        return climaEstaciones;
      }

      // Intento 2: Si no hay estaciones, buscar en nuestros reportes internos.
      this.logger.warn(
        'No se encontraron datos en estaciones. Buscando en reportes de dispositivos internos...',
      );
      const climaReportes = await this.climaDeReportes(
        ubicacion,
        agrupacion,
        fechaDesde,
        fechaHasta,
        sensores,
        distancia,
      );

      if (HelperService.checkArray(climaReportes)) {
        this.logger.log(
          `Éxito: Se encontraron ${climaReportes.length} reportes de dispositivos internos.`,
        );
        return climaReportes;
      }

      // Intento 3 (Fallback): Si no hay datos de sensores en ninguna fuente, usar Meteosource.
      this.logger.warn(
        'No se encontraron datos de sensores. Usando MeteoSource como fallback.',
      );
      return this.handleMeteoSource(
        ubicacion,
        agrupacion,
        fechaDesde,
        fechaHasta,
      );
    }
    // Flujo 2: No se solicitaron sensores, ir directamente a Meteosource.
    else {
      this.logger.log(
        'No se especificaron sensores. Obteniendo datos de pronóstico de MeteoSource.',
      );
      return this.handleMeteoSource(
        ubicacion,
        agrupacion,
        fechaDesde,
        fechaHasta,
      );
    }
  }

  public async getPronostico(
    lat: number,
    lng: number,
    dias: number = 7,
    agrupacion: 'hourly' | 'daily' = 'daily',
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    if (!lat || !lng) {
      throw new BadRequestException(
        'No se ha proporcionado una ubicación válida.',
      );
    }
    const ubicacion: ICoordenadas = { lat, lng };

    // 1. Obtener el pronóstico completo de MeteoSource
    const forecast = await this.meteoSourceService.getForecast(
      ubicacion,
      'daily',
    );
    if (!forecast) {
      this.logger.error(
        `Pronóstico no encontrado para ubicación ${JSON.stringify(ubicacion)}`,
      );
      return [];
    }

    let pronosticoCompleto: IPronosticoEstacionMeteorologica[];

    // 2. Usar el parser correspondiente según la agrupación
    switch (agrupacion) {
      case 'hourly':
        pronosticoCompleto = this._parsearPronosticoHorario(forecast);
        break;
      case 'daily':
      default:
        pronosticoCompleto = this._parsearPronosticoDiario(forecast);
        break;
    }

    // 3. Filtrar el resultado para la cantidad de días solicitada
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Establecer al inicio del día actual

    const fechaLimite = new Date(hoy);
    fechaLimite.setDate(hoy.getDate() + dias); // Fecha límite para el filtro

    const resultadoFiltrado = pronosticoCompleto.filter((p) => {
      const fechaPronostico = new Date(p.fecha);
      return fechaPronostico >= hoy && fechaPronostico < fechaLimite;
    });

    return resultadoFiltrado;
  }

  /**
   * Parsea la sección 'daily' de la respuesta de MeteoSource.
   */
  private _parsearPronosticoDiario(
    forecast: IForecastMeteoSource,
  ): IPronosticoEstacionMeteorologica[] {
    if (!forecast?.daily?.data) {
      return [];
    }

    const ubicacion: ICoordenadas = {
      lat: parseFloat(forecast.lat),
      lng: parseFloat(forecast.lon),
    };

    return forecast.daily.data.map((dia) => {
      const fecha = new Date(dia.day);
      return {
        fuente: 'MeteoSource',
        fecha: dia.day,
        estacion: 'MeteoSource',
        ubicacion,
        diaNoche: this.esDiaONoche(fecha, ubicacion.lat, ubicacion.lng),
        summary: dia.summary,
        iconNum: dia.icon,
        // Para datos diarios, IValores contiene el resumen del día
        temperatura: {
          avg: dia.all_day.temperature,
          min: dia.all_day.temperature_min,
          max: dia.all_day.temperature_max,
        },
        humedad: { avg: dia.all_day.humidity },
        velocidadViento: {
          avg: dia.statistics.wind.avg_speed,
          max: dia.statistics.wind.max_speed,
        },
        direccionViento: dia.statistics.wind.avg_angle,
        lluvia: dia.statistics.precipitation.avg,
        probabilidadLluvia: dia.statistics.precipitation.probability,
      };
    });
  }

  /**
   * Parsea la sección 'hourly' de la respuesta de MeteoSource.
   */
  private _parsearPronosticoHorario(
    forecast: IForecastMeteoSource,
  ): IPronosticoEstacionMeteorologica[] {
    if (!forecast?.hourly?.data) {
      return [];
    }

    const ubicacion: ICoordenadas = {
      lat: parseFloat(forecast.lat),
      lng: parseFloat(forecast.lon),
    };

    return forecast.hourly.data.map((hora) => {
      const fecha = new Date(hora.date);
      return {
        fuente: 'MeteoSource',
        fecha: hora.date,
        estacion: 'MeteoSource',
        ubicacion,
        diaNoche: this.esDiaONoche(fecha, ubicacion.lat, ubicacion.lng),
        // Para datos horarios, IValores solo tiene el valor 'last'
        temperatura: { last: hora.temperature },
        humedad: { last: hora.humidity },
        velocidadViento: { last: hora.wind.speed },
        rafagaViento: { last: hora.wind.gusts },
        direccionViento: hora.wind.angle,
        lluvia: hora.precipitation.total,
        probabilidadLluvia: hora.probability.precipitation,
        radiacionSolar: hora.irradiance,
        et0: hora.evaporation,
      };
    });
  }

  private async handleMeteoSource(
    ubicacion: ICoordenadas,
    agrupacion: 'hourly' | 'daily' = 'daily',
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    // El historico se pida por día
    // Si no viene fecha es el de hoy
    // Si vienen dos días (24hs debería ser el máximo) hay que armar la respuesta con dos requests

    if (!fechaDesde || !fechaHasta) {
      // Si no vienen fechas, uso el día de hoy

      const hoy = this.getFechaDia(new Date().toISOString());
      this.logger.log(
        `No se especificaron fechas, usando el día de hoy: ${fechaDesde} a ${fechaHasta}`,
      );
      const historico = await this.meteoSourceService.getHistorico(
        ubicacion,
        hoy,
      );
      const parseados = this.parsearRespuestaTimeMachine(historico);
      if (agrupacion === 'hourly') {
        // Agrupo por hora
        return this.agruparPorHora(parseados);
      } else {
        // Agrupo por día
        return this.agruparPorDia(parseados);
      }
    } else {
      // Si vienen fechas, las uso
      const fechaDesdeDate = new Date(fechaDesde);
      const fechaHastaDate = new Date(fechaHasta);

      if (fechaDesdeDate > fechaHastaDate) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor que la fecha de fin.',
        );
      }

      this.logger.log(
        `Obteniendo datos de MeteoSource desde ${fechaDesde} hasta ${fechaHasta}`,
      );

      // Obtengo los datos de MeteoSource para el rango
      const res = await this.obtenerDatosMeteosourceParaRango(
        fechaDesdeDate,
        fechaHastaDate,
        ubicacion,
      );

      if (agrupacion === 'hourly') {
        // Agrupo por hora
        return this.agruparPorHora(res);
      } else {
        // Agrupo por día
        return this.agruparPorDia(res);
      }
    }
  }

  /**
   * Adapta la respuesta de la API Meteosource Time Machine a un array IClimaEstacionMeteorologica[].
   * @param respuestaApi El objeto completo recibido de la API de Meteosource.
   * @returns Un array de reportes normalizados al formato estándar.
   */
  private parsearRespuestaTimeMachine(
    respuestaApi: ITimeMachineMeteoSource,
  ): IClimaEstacionMeteorologica[] {
    const { lat, lon, data } = respuestaApi;

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((puntoHorario: DataPoint) => {
      const resultado: IClimaEstacionMeteorologica = {
        fuente: 'MeteoSource', // Identificamos la fuente de datos
        fecha: puntoHorario.date,
        estacion: 'Meteosource',
        summary: puntoHorario.summary,
        iconNum: puntoHorario.icon,
        diaNoche: this.esDiaONoche(
          new Date(puntoHorario.date),
          parseFloat(lat),
          parseFloat(lon),
        ),
        ubicacion: {
          lat: parseFloat(lat),
          lng: parseFloat(lon),
        },
        temperatura: { last: puntoHorario.temperature },
        humedad: { last: puntoHorario.humidity },
        presion: { last: puntoHorario.pressure },
        lluvia: { last: puntoHorario.precipitation.total },
        radiacionSolar: { last: puntoHorario.irradiance },
        velocidadViento: { last: puntoHorario.wind.speed },
        direccionViento: { last: puntoHorario.wind.angle },
        rafagaViento: { last: puntoHorario.wind.gusts },
        et0: { last: puntoHorario.evaporation },
        intensidadLuminica: { last: puntoHorario.irradiance },

        // Inicializamos los de suelo
        temperaturaSuelo: {},
        humedadSuelo: {}, // Meteosource no provee humedad de suelo
      };

      if (puntoHorario.soil_temperature != null) {
        resultado.temperaturaSuelo![0] = {
          last: puntoHorario.soil_temperature,
        };
      }

      return resultado;
    });
  }

  /**
   * Orquesta la obtención y parseo de datos de Meteosource para un rango de fechas.
   * @param fechaDesde La fecha/hora de inicio del rango.
   * @param fechaHasta La fecha/hora de fin del rango.
   * @returns Una promesa que resuelve a un array de reportes normalizados y filtrados.
   */
  private async obtenerDatosMeteosourceParaRango(
    fechaDesde: Date,
    fechaHasta: Date,
    ubicacion: ICoordenadas,
  ): Promise<IClimaEstacionMeteorologica[]> {
    // 1. Determinar los días únicos necesarios
    const diasUnicos = new Set<string>();
    const fechaActual = new Date(fechaDesde);

    while (fechaActual <= fechaHasta) {
      diasUnicos.add(fechaActual.toISOString().substring(0, 10)); // 'YYYY-MM-DD'
      fechaActual.setDate(fechaActual.getDate() + 1);
    }

    console.log('Días a consultar:', Array.from(diasUnicos));

    // 2. Crear una promesa de llamada a la API para cada día
    const promesasDeLlamadas = Array.from(diasUnicos).map((dia) => {
      // En una aplicación real, aquí llamarías a tu servicio de API
      // return this.apiService.getTimeMachine(dia);
      return this.getHistoricoMeteoSource(ubicacion, dia);
    });

    // Ejecutar todas las llamadas en paralelo
    const respuestasPorDia = await Promise.all(promesasDeLlamadas);

    // 3. Combinar y parsear todos los resultados
    let reportesCombinados: IClimaEstacionMeteorologica[] = [];
    for (const respuesta of respuestasPorDia) {
      if (respuesta) {
        // Chequea por si alguna llamada falló y devolvió null/undefined
        const reportesParseados = this.parsearRespuestaTimeMachine(respuesta);
        reportesCombinados = reportesCombinados.concat(reportesParseados);
      }
    }

    // 4. Filtrar el array combinado para ajustarse al rango exacto
    const resultadoFinal = reportesCombinados.filter((r) => {
      const fechaReporte = new Date(r.fecha!);
      return fechaReporte >= fechaDesde && fechaReporte <= fechaHasta;
    });

    return resultadoFinal;
  }

  private async climaDeEstaciones(
    ubicacion: ICoordenadas,
    agrupacion: 'hourly' | 'daily',
    fechaDesde: string,
    fechaHasta: string,
    sensores: Sensores[],
    distancia?: number,
  ) {
    const estaciones: IEstacionCercana[] =
      await this.estacionsService.getCercana2({
        ubicacion,
        sensores,
        minDate: fechaDesde,
        maxDate: fechaHasta,
        distancia,
      });

    this.logger.log(`Estaciones encontradas: ${estaciones.length}`);

    if (estaciones.length === 0) {
      this.logger.warn(
        `No se encontraron estaciones cercanas a la ubicación ${JSON.stringify(
          ubicacion,
        )} con los sensores especificados.`,
      );
      return [];
    }

    // Agarro la más cercana
    const estacionCercana = estaciones[0];
    this.logger.log(
      `Estación más cercana: ${estacionCercana.name} a ${estacionCercana.distancia} km`,
    );

    // Obtengo los reportes de la estación dependiendo el origen (FieldClimate, Omixom, Horatech)
    const origen = estacionCercana.origen;
    switch (origen) {
      case 'FieldClimate': {
        return await this.handleFieldClimate(
          estacionCercana,
          fechaDesde,
          fechaHasta,
          agrupacion,
        );
      }
      case 'Omixom': {
        return await this.handleOmixom(
          estacionCercana,
          fechaDesde,
          fechaHasta,
          agrupacion,
        );
      }
      case 'Horatech': {
        return await this.handleHoratech(
          estacionCercana,
          fechaDesde,
          fechaHasta,
          agrupacion,
        );
      }
      default: {
        this.logger.warn(
          `Origen de estación desconocido: ${origen}. No se pueden obtener datos.`,
        );
        return [];
      }
    }
  }

  private async climaDeReportes(
    ubicacion: ICoordenadas,
    agrupacion: 'hourly' | 'daily',
    fechaDesde: string,
    fechaHasta: string,
    sensores: Sensores[],
    distancia?: number,
  ) {
    const sensoresV2 = sensores.map((s) => HelperService.toSensoresV2(s));

    const dispositivos = await this.dispositivosService.getDispositivoCercano({
      ubicacion,
      sensores: sensoresV2,
      distancia,
    });

    this.logger.log(`Dispositivos encontrados: ${dispositivos.length}`);

    if (dispositivos.length === 0) {
      this.logger.warn(
        `No se encontraron dispositivos cercanos a la ubicación ${JSON.stringify(
          ubicacion,
        )} con los sensores especificados.`,
      );
      return [];
    }

    // Agarro el más cercano
    const dispositivoCercano = dispositivos[0];

    this.logger.log(
      `Dispositivo más cercano: ${dispositivoCercano.nombre} a ${dispositivoCercano.distancia} km`,
    );

    // Obtengo los reportes del dispositivo con los deportes
    const reportes = await this.handleReportes(
      dispositivoCercano,
      agrupacion,
      fechaDesde,
      fechaHasta,
    );
    this.logger.log(
      `Reportes obtenidos: ${reportes.length} reportes de ${dispositivoCercano.nombre}`,
    );

    if (reportes.length === 0) {
      this.logger.warn(
        `No se encontraron reportes para el dispositivo ${dispositivoCercano.nombre} entre ${fechaDesde} y ${fechaHasta}.`,
      );
      return [];
    }
    // Si hay reportes, los devuelvo
    return reportes;
  }

  private async handleHoratech(
    estacion: IEstacionCercana,
    fechaDesde: string,
    fechaHasta: string,
    agrupacion: 'hourly' | 'daily',
  ) {
    this.logger.log(
      `Obteniendo datos de Horatech para la estación ${estacion.name} (${estacion.idExterno}) entre ${fechaDesde} y ${fechaHasta}`,
    );

    const reportes = await this.horatechService.getReportes(
      estacion.idExterno,
      fechaDesde,
      fechaHasta,
    );
    const parseados = this.parsearReportesHoratech(reportes.datos);
    switch (agrupacion) {
      case 'hourly': {
        // Agrupo por hora
        return this.agruparPorHora(parseados);
      }
      case 'daily': {
        // Agrupo por día
        return this.agruparPorDia(parseados);
      }
      default: {
        // daily
        return this.agruparPorDia(parseados);
      }
    }
  }

  private async handleReportes(
    dispositivo: IDispositivoCercano,
    agrupacion: 'hourly' | 'daily',
    fechaDesde: string,
    fechaHasta: string,
  ) {
    // 0. Traigo reportes de la API de reportes
    const reportes = await this.reportesService.getByIdDispositivoEntreFechas(
      dispositivo._id,
      fechaDesde,
      fechaHasta,
    );
    // 1. Normalizar los datos usando el nuevo adaptador
    const reportesNormalizados = this.parsearReportes(reportes.datos);

    console.log(
      `(Reportes V2) Se normalizaron ${reportes?.datos?.length} reportes crudos a ${reportesNormalizados?.length} reportes estándar.`,
    );

    // 2. Aplicar la agrupación deseada con las funciones existentes
    let resultadoFinal: IClimaEstacionMeteorologica[];

    switch (agrupacion) {
      case 'hourly':
        resultadoFinal = this.agruparPorHora(reportesNormalizados);
        break;
      case 'daily':
      default:
        resultadoFinal = this.agruparPorDia(reportesNormalizados);
        break;
    }

    // console.log(`\n--- RESULTADO FINAL PARA AGRUPACIÓN '${agrupacion}' ---`);
    // console.log(JSON.stringify(resultadoFinal, null, 2));
    return resultadoFinal;
  }

  /**
   * Adapta el nuevo formato de reporte (IReporte) al formato estándar IClimaEstacionMeteorologica.
   * @param reportes El array de reportes en el nuevo formato V2.
   * @returns Un array de reportes normalizados al formato estándar.
   */
  private parsearReportes(reportes: IReporte[]): IClimaEstacionMeteorologica[] {
    const resultados: IClimaEstacionMeteorologica[] = [];

    for (const reporte of reportes) {
      if (!reporte.datos?.valores) {
        continue;
      }

      // Objeto base para este reporte
      const resultadoIndividual: IClimaEstacionMeteorologica = {
        fecha: reporte.fecha,
        estacion: reporte.idDispositivo,
        fuente: 'Dispositivo',
        // Inicializamos los objetos que pueden tener múltiples niveles
        temperaturaSuelo: {},
        humedadSuelo: {},
      };

      // Iteramos sobre los tipos de sensores presentes en el reporte
      for (const [sensorTipo, mediciones] of Object.entries(
        reporte.datos.valores,
      )) {
        // 'mediciones' es un array de valores para ese tipo de sensor
        if (!mediciones || mediciones.length === 0) {
          continue;
        }

        // Usamos un switch para mapear cada tipo de sensor a la propiedad correcta
        switch (sensorTipo as SensoresV2) {
          // --- CASOS DE UN SOLO VALOR ---
          case 'Temperatura':
            resultadoIndividual.temperatura = {
              last: mediciones[0].valores?.actual,
            };
            break;
          case 'Humedad':
            resultadoIndividual.humedad = {
              last: mediciones[0].valores?.actual,
            };
            break;
          case 'Presión':
            resultadoIndividual.presion = {
              last: mediciones[0].valores?.actual,
            };
            break;
          case 'Viento Velocidad':
            // El valor para la velocidad puede ser el promedio o el actual
            resultadoIndividual.velocidadViento = {
              last:
                mediciones[0].valores?.promedio ??
                mediciones[0].valores?.actual,
            };
            break;
          case 'Viento Dirección':
            resultadoIndividual.direccionViento = {
              last:
                mediciones[0].valores?.promedio ??
                mediciones[0].valores?.actual,
            };
            break;
          case 'Radiación Solar':
            resultadoIndividual.radiacionSolar = {
              last: mediciones[0].valores?.actual,
            };
            break;
          case 'Pluviometro':
            // Para la lluvia, el valor acumulado o la suma del intervalo son los más útiles
            resultadoIndividual.lluvia = {
              last:
                mediciones[0].valores?.acumulado ?? mediciones[0].valores?.suma,
            };
            break;
          case 'Evapotranspiración':
            resultadoIndividual.et0 = { last: mediciones[0].valores?.actual };
            break;
          case 'Batería':
            resultadoIndividual.bateria = {
              last: mediciones[0].valores?.actual,
            };
            break;
          case 'Napa':
            (resultadoIndividual as any).nivelFreatico = {
              last: mediciones[0].valores?.actual,
            };
            break;

          // --- CASOS CON PROFUNDIDAD/NIVELES ---
          case 'Humedad Suelo Superficial':
            // Asumimos que la superficial va al nivel 0 de humedadSuelo
            resultadoIndividual.humedadSuelo![0] = {
              last: mediciones[0].valores?.actual,
            };
            break;

          case 'Temperatura Suelo':
          case 'Humedad Suelo Profundidad':
            for (const medicion of mediciones) {
              const profundidad = medicion.profundidad;
              const valor = medicion.valores?.actual;
              if (profundidad != null && valor != null) {
                const obj =
                  sensorTipo === 'Temperatura Suelo'
                    ? resultadoIndividual.temperaturaSuelo!
                    : resultadoIndividual.humedadSuelo!;
                // Usamos la profundidad como clave del nivel
                obj[profundidad] = { last: valor };
              }
            }
            break;
        }
      }
      resultados.push(resultadoIndividual);
    }

    return resultados;
  }

  /**
   * Función principal que adapta un array de reportes de Horatech al formato estándar.
   * @param reportesFuente Array de reportes en el formato de Horatech.
   * @returns Un array de objetos IClimaEstacionMeteorologica.
   */
  private parsearReportesHoratech(
    reportesFuente: IReporteHoratech[],
  ): IClimaEstacionMeteorologica[] {
    const resultados: IClimaEstacionMeteorologica[] = [];

    for (const reporteFuente of reportesFuente) {
      if (!reporteFuente.reporte || !reporteFuente.tipoDispositivo) {
        continue; // Ignorar reportes sin datos o tipo
      }

      // Objeto base con la información común
      const resultadoBase: IClimaEstacionMeteorologica = {
        fecha: reporteFuente.fecha,
        estacion: reporteFuente.deviceName,
        // fuente: 'Horatech' // Podrías añadir una fuente para saber de dónde vino
      };

      let reporteParseado: IClimaEstacionMeteorologica = { ...resultadoBase };

      // Delegamos a la función de parseo correcta según el tipo
      switch (reporteFuente.tipoDispositivo) {
        case 'Estacion Meteorologica':
          reporteParseado = this._parsearEstacionMeteorologica(
            reporteParseado,
            reporteFuente.reporte,
          );
          break;
        case 'Freatimetro':
          reporteParseado = this._parsearFreatimetro(
            reporteParseado,
            reporteFuente.reporte,
          );
          break;
        case 'Lanza de Humedad':
          reporteParseado = this._parsearLanzaHumedad(
            reporteParseado,
            reporteFuente.reporte,
          );
          break;
        case 'Pluviometro':
          reporteParseado = this._parsearPluviometro(
            reporteParseado,
            reporteFuente.reporte,
          );
          break;
        case 'Sensor Humedad de Suelo':
          reporteParseado = this._parsearSensorHumedadSuelo(
            reporteParseado,
            reporteFuente.reporte,
          );
          break;
      }
      resultados.push(reporteParseado);
    }

    return resultados;
  }

  private _parsearEstacionMeteorologica(
    base: IClimaEstacionMeteorologica,
    reporte: Record<string, any>,
  ): IClimaEstacionMeteorologica {
    const r = { ...base };
    if (reporte.temperatura != null)
      r.temperatura = { last: reporte.temperatura };
    if (reporte.humedad != null) r.humedad = { last: reporte.humedad };
    if (reporte.presion != null) r.presion = { last: reporte.presion };
    if (reporte.intensidadLuminica != null)
      r.intensidadLuminica = { last: reporte.intensidadLuminica };

    // Usamos los valores promedio para las métricas principales de viento
    if (reporte.velocidadVientoPromedio != null)
      r.velocidadViento = { last: reporte.velocidadVientoPromedio };
    if (reporte.direccionVientoPromedio != null)
      r.direccionViento = { last: reporte.direccionVientoPromedio };

    // Mapeamos la velocidad máxima a la ráfaga de viento
    if (reporte.velocidadVientoMaxima != null)
      r.rafagaViento = { last: reporte.velocidadVientoMaxima };

    // El valor de lluvia del intervalo es más útil que el acumulado total
    if (reporte.lluviaIntervalo != null)
      r.lluvia = { last: reporte.lluviaIntervalo };

    return r;
  }

  private _parsearFreatimetro(
    base: IClimaEstacionMeteorologica,
    reporte: Record<string, any>,
  ): IClimaEstacionMeteorologica {
    const r = { ...base };
    // Aquí usamos la nueva propiedad `nivelFreatico`
    if (reporte.nivel != null)
      (r as any).nivelFreatico = { last: reporte.nivel };
    if (reporte.bateria != null) r.bateria = { last: reporte.bateria };
    return r;
  }

  private _parsearPluviometro(
    base: IClimaEstacionMeteorologica,
    reporte: Record<string, any>,
  ): IClimaEstacionMeteorologica {
    const r = { ...base };
    // El valor instantáneo es el que nos interesa para el reporte individual
    if (reporte.valorInstantaneo != null)
      r.lluvia = { last: reporte.valorInstantaneo };
    if (reporte.bateria != null) r.bateria = { last: reporte.bateria };
    return r;
  }

  private _parsearSensorHumedadSuelo(
    base: IClimaEstacionMeteorologica,
    reporte: Record<string, any>,
  ): IClimaEstacionMeteorologica {
    const r = { ...base, temperaturaSuelo: {}, humedadSuelo: {} };
    // Asumimos que un sensor individual corresponde al nivel 0
    if (reporte.temperatura != null)
      r.temperaturaSuelo![0] = { last: reporte.temperatura };
    if (reporte.humedad != null) r.humedadSuelo![0] = { last: reporte.humedad };
    return r;
  }

  private _parsearLanzaHumedad(
    base: IClimaEstacionMeteorologica,
    reporte: Record<string, any>,
  ): IClimaEstacionMeteorologica {
    const r = { ...base, temperaturaSuelo: {}, humedadSuelo: {} };
    // Iteramos por las posibles profundidades de la lanza
    for (let i = 1; i <= 10; i++) {
      const tempKey = `temperatura${i}`;
      const humKey = `humedad${i}`;

      // Los niveles en la interfaz son 0-indexados, por eso i-1
      if (reporte[tempKey] != null) {
        r.temperaturaSuelo![i - 1] = { last: reporte[tempKey] };
      }
      if (reporte[humKey] != null) {
        r.humedadSuelo![i - 1] = { last: reporte[humKey] };
      }
    }
    return r;
  }

  private async handleFieldClimate(
    estacion: IEstacionCercana,
    fechaDesde: string,
    fechaHasta: string,
    agrupacion: 'hourly' | 'daily',
  ) {
    this.logger.log(
      `Obteniendo datos de FieldClimate para la estación ${estacion?.name} (${estacion?.idExterno}) entre ${fechaDesde} y ${fechaHasta}`,
    );

    // Obtengo los datos de la estación
    const data = await this.fieldClimate.getDataBetweenDates(
      estacion.idExterno,
      agrupacion,
      new Date(fechaDesde).getTime(),
      new Date(fechaHasta).getTime(),
      estacion.user,
      estacion.pass,
    );

    if (!data || !data.dates || data.dates.length === 0) {
      this.logger.warn(
        `No se encontraron datos para la estación ${estacion.name} entre ${fechaDesde} y ${fechaHasta}`,
      );
      return [];
    }

    // Parseo los datos
    return this.parsearClimaFieldClimate(estacion, data, agrupacion);
  }

  private async handleOmixom(
    estacion: IEstacionCercana,
    fechaDesde: string,
    fechaHasta: string,
    agrupacion: 'hourly' | 'daily',
  ) {
    this.logger.log(
      `Obteniendo datos de Omixom para la estación ${estacion.name} (${estacion.idExterno}) entre ${fechaDesde} y ${fechaHasta}`,
    );

    // Obtengo los datos de la estación
    const data = await this.omixomService.getMuestrasPorRangoEIdsEstaciones(
      [+estacion.idExterno],
      fechaDesde,
      fechaHasta,
      1000, // Limite de muestras
    );

    if (!data || data.length === 0) {
      this.logger.warn(
        `No se encontraron datos para la estación ${estacion.name} entre ${fechaDesde} y ${fechaHasta}`,
      );
      return [];
    }

    // Parseo los datos
    return this.parsearClimaOmixom(estacion, data, agrupacion);
  }

  private parsearClimaOmixom(
    estacion: IEstacionCercana,
    data: Sample[],
    agrupacion: 'hourly' | 'daily',
  ) {
    const modulos = estacion.modulos;
    if (!modulos || modulos.length === 0) {
      this.logger.warn(
        `La estación ${estacion.name} no tiene módulos definidos.`,
      );
      return [];
    }
    const parseados = this.transformarReportesOmixom(data, estacion);
    switch (agrupacion) {
      case 'hourly': {
        // Agarro por hora
        return this.agruparPorHora(parseados);
      }
      case 'daily': {
        // Devuelvo un reporte por día
        return this.agruparPorDia(parseados);
      }
      default: {
        // daily
        return this.agruparPorDia(parseados);
      }
    }
  }

  /**
   * Agrupa los reportes por hora, devolviendo solo el último reporte de cada hora.
   * @param reportes Array de reportes individuales parseados.
   * @returns Un array con un único reporte por cada hora.
   */
  private agruparPorHora(
    reportes: IClimaEstacionMeteorologica[],
  ): IClimaEstacionMeteorologica[] {
    // Usamos un Map para quedarnos con el último reporte de cada hora.
    const reportesPorHora = new Map<string, IClimaEstacionMeteorologica>();

    for (const reporte of reportes) {
      if (!reporte.fecha) continue;
      const horaKey = reporte.fecha.substring(0, 13); // Extrae 'YYYY-MM-DDTHH'
      reportesPorHora.set(horaKey, reporte); // Al usar set, siempre se sobrescribe y queda el último
    }

    // Devolvemos los valores del Map convertidos en un array.
    return Array.from(reportesPorHora.values());
  }

  /**
   * Agrupa y promedia los reportes por día.
   * @param reportes Array de reportes individuales parseados.
   * @returns Un array con un único reporte agregado por cada día.
   */
  private agruparPorDia(
    reportes: IClimaEstacionMeteorologica[],
  ): IClimaEstacionMeteorologica[] {
    if (!reportes.length) {
      return [];
    }

    // 1. Agrupar reportes por día usando un Map
    const reportesPorDia = new Map<string, IClimaEstacionMeteorologica[]>();
    for (const reporte of reportes) {
      if (!reporte.fecha) continue;
      const diaKey = reporte.fecha.substring(0, 10); // Extrae 'YYYY-MM-DD'

      if (!reportesPorDia.has(diaKey)) {
        reportesPorDia.set(diaKey, []);
      }
      reportesPorDia.get(diaKey)!.push(reporte);
    }

    const resultadosDiarios: IClimaEstacionMeteorologica[] = [];

    // 2. Iterar sobre cada día y agregar sus reportes
    for (const [diaKey, reportesDelDia] of reportesPorDia.entries()) {
      // Usamos el primer reporte como base para la estructura
      const reporteAgregado: IClimaEstacionMeteorologica = {
        ...reportesDelDia[0], // Copia estructura (ubicacion, etc.)
        fecha: diaKey, // La fecha es el día completo
      };

      // Objeto para acumular los valores
      const acumulador: {
        [key: string]: IValores | { [nivel: number]: IValores };
      } = {};

      // 3. Fusionar todos los reportes del día
      for (const reporteActual of reportesDelDia) {
        for (const [key, valor] of Object.entries(reporteActual)) {
          // Si la propiedad es un IValores (tiene 'last')
          if (valor && typeof valor === 'object' && 'last' in valor) {
            if (!acumulador[key]) {
              acumulador[key] = {
                min: Infinity,
                max: -Infinity,
                sum: 0,
                count: 0,
                last: 0,
              };
            }
            const v = valor as IValores;
            const a = acumulador[key] as IValores;

            if (typeof v.last === 'number') {
              a.sum! += v.last;
              a.count! += 1;
              a.min = Math.min(a.min!, v.last);
              a.max = Math.max(a.max!, v.last);
              a.last = v.last; // Se actualiza con cada reporte, queda el último
            }
          }
          // Caso especial para propiedades con niveles (suelo)
          else if (key === 'temperaturaSuelo' || key === 'humedadSuelo') {
            if (!acumulador[key]) {
              acumulador[key] = {};
            }
            const niveles = valor as { [nivel: number]: IValores };
            const accNiveles = acumulador[key] as { [nivel: number]: IValores };
            for (const nivelKey in niveles) {
              if (!accNiveles[nivelKey]) {
                accNiveles[nivelKey] = {
                  min: Infinity,
                  max: -Infinity,
                  sum: 0,
                  count: 0,
                  last: 0,
                };
              }
              const vNivel = niveles[nivelKey];
              const aNivel = accNiveles[nivelKey];
              if (typeof vNivel.last === 'number') {
                aNivel.sum! += vNivel.last;
                aNivel.count! += 1;
                aNivel.min = Math.min(aNivel.min!, vNivel.last);
                aNivel.max = Math.max(aNivel.max!, vNivel.last);
                aNivel.last = vNivel.last;
              }
            }
          }
        }
      }

      // 4. Calcular promedios y asignar al reporte final
      for (const [key, valorAgregado] of Object.entries(acumulador)) {
        if ('count' in valorAgregado && valorAgregado.count! > 0) {
          (valorAgregado as IValores).avg =
            (valorAgregado as IValores).sum! /
            (valorAgregado as IValores).count!;
          (reporteAgregado as any)[key] = valorAgregado;
        } else {
          // Para los de suelo
          for (const nivelKey in valorAgregado) {
            const vNivel = (valorAgregado as any)[nivelKey];
            if (vNivel.count > 0) {
              vNivel.avg = vNivel.sum / vNivel.count;
            }
          }
          (reporteAgregado as any)[key] = valorAgregado;
        }
      }

      resultadosDiarios.push(reporteAgregado);
    }

    return resultadosDiarios;
  }

  /**
   * Función que transforma un array de reportes en un array de IClimaEstacionMeteorologica
   * usando un bucle for...of para mayor legibilidad.
   * @param reportes Array de lecturas de la estación.
   * @param estacion Información de la estación, incluyendo sus módulos.
   * @returns Un array de objetos IClimaEstacionMeteorologica.
   */
  private transformarReportesOmixom(
    reportes: Sample[],
    estacion: IEstacionCercana,
  ): IClimaEstacionMeteorologica[] {
    // Mapeo de tipo de módulo a la clave en la interfaz final
    const tipoAMapeo: Record<string, keyof IClimaEstacionMeteorologica> = {
      Temperatura: 'temperatura',
      Humedad: 'humedad',
      Presión: 'presion',
      'Velocidad de Viento': 'velocidadViento',
      'Dirección de Viento': 'direccionViento',
      'Registro de lluvia': 'lluvia',
      'Radiación Solar': 'radiacionSolar',
      Evapotranspiración: 'et0',
      'Nivel de Batería': 'bateria',
      'Rafaga de Viento': 'rafagaViento',
      'Panel Solar': 'panelSolar',
    };

    // 1. Inicializar un array vacío para almacenar los resultados.
    const resultados: IClimaEstacionMeteorologica[] = [];

    // 2. Iterar sobre cada reporte usando un bucle for...of.
    for (const reporte of reportes) {
      // La lógica para transformar un único reporte es la misma que antes.
      const resultadoIndividual: IClimaEstacionMeteorologica = {
        fuente: 'Omixom',
        fecha: reporte.date,
        estacion: reporte.station,
        diaNoche: this.esDiaONoche(
          new Date(reporte.date),
          estacion.position?.geo?.coordinates[1] || 0,
          estacion.position?.geo?.coordinates[0] || 0,
        ),
        ubicacion: {
          lat: estacion.position?.geo?.coordinates[1],
          lng: estacion.position?.geo?.coordinates[0],
        },
        temperaturaSuelo: {},
        humedadSuelo: {},
      };

      for (const key in reporte) {
        if (key === 'date' || key === 'station') continue;

        const valor = reporte[key];
        if (typeof valor !== 'number') continue;

        const moduloInfo = estacion.modulos.find(
          (m: any) => m.id.toString() === key,
        );
        if (!moduloInfo) continue;

        const propiedad = tipoAMapeo[moduloInfo.type];
        if (propiedad) {
          (resultadoIndividual as any)[propiedad] = { last: valor };
        }
      }

      // 3. Añadir el objeto transformado al array de resultados.
      resultados.push(resultadoIndividual);
    }

    // 4. Devolver el array completo.
    return resultados;
  }

  ///
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

  // Parseo de datos de estaciones meteorológicas
  // Datos de estanciones meteorológicas de FieldClimate
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

  /// Creo ques el la lanza de suelo (Por los niveles)
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
  //

  async getEstacionMasCercanaEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
  ): Promise<IClimaEstacionMeteorologica[]> {
    const res = await this.fieldClimate.getEstacionMasCercanaEntreFechas(
      ubicacion,
      minDate,
      maxDate,
      dataGroup,
    );
    if (!res) return [];

    return this.parsearClimaFieldClimate(res.station, res.data, dataGroup);
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

  async getHistoricoMeteoSource(ubicacion: ICoordenadas, dia: string) {
    try {
      if (!dia) {
        this.logger.error(
          `No se ha proporcionado un día para obtener el timeline de la ubicación ${JSON.stringify(
            ubicacion,
          )}`,
        );
        return null;
      }
      return await this.meteoSourceService.getHistorico(ubicacion, dia);
      // return this.parsearTimelineMeteoSource(timeline, ubicacion);
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

  private parsearTimelineMeteoSource(
    timeline: ITimeMachineMeteoSource,
    ubicacion: ICoordenadas,
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

    let ubicacionFinal: ICoordenadas;
    if (timeline.lat && timeline.lon) {
      ubicacionFinal = HelperService.transformCoordinates(
        timeline.lat,
        timeline.lon,
      );
    } else {
      ubicacionFinal = ubicacion;
    }

    let count = 0;
    let prevDate = null;
    let date = null;
    for (const item of timeline?.data) {
      date = this.getFechaHora(item.date);
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
    }

    for (const fecha of fechas) {
      const date = this.getFechaHora(fecha);
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
