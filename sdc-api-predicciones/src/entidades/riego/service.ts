/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { SiembrasService } from '../siembra/service';
import { NotificacionsService } from '../notificacion/service';
import { AlertasService } from '../alerta/service';
import {
  Cultivo,
  ICalculoRaices,
  IClimaEstacionMeteorologica,
  ICreatePrediccionRiego,
  ICrono,
  IDispositivo,
  IEstacion,
  IFilter,
  ILote,
  INivelCapacidadCampo,
  INivelLecturaSensor,
  IPrediccionRiego,
  IPronosticoEstacionMeteorologica,
  IPronosticoRiego,
  IQueryParam,
  IResultadoPrediccionRiego,
  ISiembra,
  ISuelo,
  IVariablesPrediccionRiego,
  aplicarEntradasAgronomicasSuelo,
} from 'modelos/src';
import { ClimaService } from '../clima/service';
import { HelperService } from '../../auxiliares/helper';
import { LotesService } from '../lote/service';
import { PrediccionRiegoService } from '../prediccion-riego/service';
import { EstacionsService } from '../estacion/service';
import { HttpsService } from '../https/https.service';
import { DispositivosService } from '../dispositivos/service';
import { ClimaV2Service } from '../clima-v2/service';
import { API_CLIMA } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import {
  calcularRiegoV12,
} from './riego-v12.engine';
import { calcularRiegoV13Estimado } from './riego-v13-fallback.engine';
import { resolverEstadoRecomendacionRiego } from './riego-recommendation-status';
import {
  adaptarPerfilSueloLoRaWAN,
  evaluarSeguridadRecomendacionRiego,
  seleccionarPerfilSentekSeguro,
} from './riego-safety';

interface IRespuestaInicioDiaNoche {
  primerReporteNoche: IClimaEstacionMeteorologica;
  ultimoReporteNoche: IClimaEstacionMeteorologica;
  primerReporteDia: IClimaEstacionMeteorologica;
  ultimoReporteDia: IClimaEstacionMeteorologica;
  horasDia: number;
  horasNoche: number;
}

@Injectable()
export class RiegoService {
  private logger = new Logger(RiegoService.name);
  constructor(
    private siembrasService: SiembrasService,
    private climaService: ClimaService,
    private lotesService: LotesService,
    private prediccionRiegoService: PrediccionRiegoService,
    private estacionsService: EstacionsService,
    private httpsService: HttpsService,
    private dispositivosService: DispositivosService,
    private climaV2Service: ClimaV2Service,
    private axiosService: AxiosService,
  ) {}

  async pruebaPreddicionRiego() {
    await this.wait(3000);
    Logger.log('Iniciando prueba de prediccion de riego');
    const idSiembra = '6773f35635a7c52be2fbc4aa';
    await this.prediccion(idSiembra);
  }

  async wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Obtiene pronóstico usando el endpoint de clima que incluye ET0
   * Usa el mismo endpoint que el frontend usa para los gráficos
   */
  async obtenerPronosticoConET0(
    lat: number,
    lng: number,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    try {
      const url = `${API_CLIMA}/clima/pronostico/cerca/${lat}/${lng}`;
      this.logger.log(`Obteniendo pronóstico con ET0 desde: ${url}`);

      const response = await this.axiosService.GET(url);

      // El endpoint devuelve IPronosticoMeteoSource[] que incluye ET0
      this.logger.log(
        `Pronóstico obtenido exitosamente. Datos: ${JSON.stringify(
          Array.isArray(response) ? response.slice(0, 2) : 'sin datos',
        )}`,
      );

      return Array.isArray(response) ? response : [];
    } catch (error) {
      this.logger.error(
        `Error al obtener pronóstico con ET0: ${error.message}`,
      );
      return [];
    }
  }

  async hacerPredicciones() {
    const siembras =
      await this.siembrasService.listarSiembrasParaPredicciones();
    Logger.log(`Iniciando Predicciones para ${siembras.length} siembras`);
    await Promise.all(
      siembras.map(async (s) => {
        return await this.prediccion(s._id);
      }),
    );
    Logger.log('Predicciones realizadas');
  }

  async prediccion(idSiembra: string): Promise<any> {
    let siembra: ISiembra = await this.siembrasService.getById(idSiembra);
    try {
      const lotePersistido = siembra.lote;
      const lote =
        await this.resolverLoteConEntradasAgronomicas(lotePersistido);
      siembra = { ...siembra, lote };
      const idSondaSuelo = lote.idSondaSuelo;
      // Compatibilidad doble: relacion legacy lote.idsDispositivo y servicio
      // logico perfil_suelo.idLote del controlador multiproposito.
      const idLanzaHumedad = await this.resolverIdSensorPerfilSuelo(lote);

      if (!idSondaSuelo && !idLanzaHumedad) {
        this.logger.warn(
          `La siembra ${siembra._id} del lote ${siembra.lote?.nombre} no tiene sonda/lanza de suelo. Se usara riego V13 estimado.`,
        );
      }

      Logger.log(
        `Iniciando prediccion de riego para ${
          siembra.semilla?.cultivo
        } con fecha de siembra ${new Date(siembra.fechaSiembra).getDate()}/${
          new Date(siembra.fechaSiembra).getMonth() + 1
        }/${new Date(siembra.fechaSiembra).getFullYear()} en departamento ${
          siembra.departamento?.nombre
        } del productor ${siembra.productor?.nombre}`,
      );

      // Prediccion de riego - Obtener datos de la siembra
      const ubicacion = lote.ubicacion.centro;
      const cultivo = siembra.semilla?.cultivo;
      if (!cultivo) {
        const motivo =
          'Recomendacion de riego no disponible: la campania no tiene cultivo configurado.';
        this.logger.warn(
          `${motivo} Siembra ${idSiembra}, lote ${siembra.lote?.nombre}.`,
        );
        await this.marcarSiembraSinRecomendacion(idSiembra, motivo);
        return;
      }
      const crono = siembra.crono;
      const suelosPersistidosConSensor =
        this.getSuelosPersistidosConMapeoSensor(lotePersistido);
      const suelos = this.getSuelosParaRiegoV12(
        lote,
        suelosPersistidosConSensor,
      );

      // Prediccion de riego - Obtener datos de la sonda de suelo y pronostico a 7 dias
      const f = this.getFechasDatos(undefined, 21);
      this.logger.log(
        `Obteniendo datos desde ${this.parseFechaLog(
          f.from,
        )} hasta ${this.parseFechaLog(f.to)}`,
      );
      // const [sondaSuelo, pluviometro, pronostico7Dias, reportesLanza] =
      //   await Promise.all([
      //     this.climaService.getSueloPorDispositivoEntreFechas(
      //       idSondaSuelo,
      //       f.from,
      //       f.to,
      //     ),
      //     this.climaService.getPluviometroMasCercanaEntreFechas(
      //       ubicacion.lat,
      //       ubicacion.lng,
      //       f.from,
      //       f.to,
      //       'hourly',
      //     ),
      //     this.climaService.getPronosticoMasCercano(
      //       ubicacion.lat,
      //       ubicacion.lng,
      //     ),
      //     this.reportesService.getByIdEntreFechas(idLanzaHumedad, f.from, f.to),
      //   ]);
      const resultadosFuentes = await Promise.allSettled([
          idSondaSuelo
            ? this.climaService.getSueloPorDispositivoEntreFechas(
                idSondaSuelo,
                f.from,
                f.to,
              )
            : null,
          this.climaV2Service.getLluviaMasCercanaEntreFechas(
            ubicacion.lat,
            ubicacion.lng,
            f.from,
            f.to,
            'hourly',
          ),
          this.obtenerPronosticoConET0(ubicacion.lat, ubicacion.lng),
          idLanzaHumedad
            ? this.climaV2Service.getSuelo(
                idLanzaHumedad,
                f.from,
                f.to,
                'hourly',
              )
            : null,
        ]);

      const nombresFuentes = [
        'sonda_legacy',
        'lluvia_historica',
        'pronostico_et0',
        'perfil_sentek',
      ];
      const fuentesConError: string[] = [];
      const valorFuente = <T>(
        indice: number,
        fallback: T,
      ): T => {
        const resultado = resultadosFuentes[indice] as PromiseSettledResult<T>;
        if (resultado.status === 'fulfilled') return resultado.value ?? fallback;
        const fuente = nombresFuentes[indice];
        fuentesConError.push(fuente);
        this.logger.error(
          `Fuente de riego ${fuente} no disponible: ${
            (resultado.reason as Error)?.message || resultado.reason
          }`,
        );
        return fallback;
      };
      const sondaSuelo = valorFuente<IClimaEstacionMeteorologica[]>(0, []);
      const pluviometro = valorFuente<IClimaEstacionMeteorologica[]>(1, []);
      const pronostico7Dias = valorFuente<IPronosticoEstacionMeteorologica[]>(
        2,
        [],
      );
      const reportesLanza = valorFuente<IClimaEstacionMeteorologica[]>(3, []);

      if (!HelperService.arrayValido(pronostico7Dias)) {
        this.logger.warn(
          `No se puede hacer la prediccion de riego para la siembra ${idSiembra} del lote ${siembra.lote?.nombre} del productor ${siembra.productor?.nombre} porque no hay datos de pronostico`,
        );
      }
      if (
        !HelperService.arrayValido(sondaSuelo) &&
        !HelperService.arrayValido(reportesLanza)
      ) {
        this.logger.warn(
          `No hay datos de humedad de suelo para la siembra ${idSiembra}; se usara estimacion climatica V13.`,
        );
      }
      if (!HelperService.arrayValido(pluviometro)) {
        this.logger.warn(
          `No hay lluvia historica para la siembra ${idSiembra}; la estimacion usara solo pronostico.`,
        );
      }

      // HelperService.guardarJson('data/sondaSuelo.json', sondaSuelo);
      // HelperService.guardarJson('data/pluviometro.json', pluviometro);
      // HelperService.guardarJson('data/pronostico7Dias.json', pronostico7Dias);
      // HelperService.guardarJson('data/reportesLanza.json', reportesLanza);

      // Para Sentek se conservan las profundidades fisicas y se usan solamente
      // ciclos horarios completos. Un ciclo parcial reciente no pisa al ultimo
      // perfil 12/12 valido.
      const datosSentekAdaptados = idLanzaHumedad
        ? this.adaptarDatosLoRaWANAFieldClimate(reportesLanza)
        : [];
      const perfilSentek = idLanzaHumedad
        ? seleccionarPerfilSentekSeguro(datosSentekAdaptados)
        : undefined;
      const datosHumedadAdaptados = idLanzaHumedad
        ? perfilSentek?.reportesCompletos || []
        : sondaSuelo || [];

      const sinHumedadSuelo = !HelperService.arrayValido(datosHumedadAdaptados);
      const resultadoRiego = sinHumedadSuelo
        ? calcularRiegoV13Estimado({
            siembra,
            lote,
            cultivo,
            crono,
            lluviaHistorica: pluviometro || [],
            pronostico7Dias,
          })
        : calcularRiegoV12({
            siembra,
            lote,
            cultivo,
            crono,
            suelo: suelos,
            humedadSuelo: datosHumedadAdaptados,
            lluviaHistorica: pluviometro || [],
            pronostico7Dias,
          });

      resultadoRiego.calidadDatos ||= {
        nivel:
          idLanzaHumedad && perfilSentek?.completo && perfilSentek.fresco
            ? 'alta'
            : 'baja',
        fuente: idLanzaHumedad ? 'sensor_campo' : 'estacion_asignada',
        cobertura: idLanzaHumedad
          ? perfilSentek?.coberturaUltimoReporte || 0
          : datosHumedadAdaptados.length
            ? 1
            : 0,
        fechaActualizacion: idLanzaHumedad
          ? perfilSentek?.fechaUltimoReporte
          : datosHumedadAdaptados[datosHumedadAdaptados.length - 1]?.fecha,
        fallback: false,
        resumen: idLanzaHumedad
          ? perfilSentek?.motivo ||
            'Perfil Sentek 12/12 fresco asignado al lote.'
          : 'Calculado con sonda FieldClimate y pronostico climatico.',
        limitaciones: [],
      };

      let seguridad = evaluarSeguridadRecomendacionRiego({
        siembra,
        lote,
        cultivo,
        tieneSentek: !!idLanzaHumedad,
        perfilSentek,
        humedadLegacy: sondaSuelo,
        lluviaHistorica: pluviometro,
        pronostico: pronostico7Dias,
        fuentesConError,
      });
      if (
        seguridad.accionable &&
        resultadoRiego.estadoCalculoAguaUtil !== 'calculado'
      ) {
        seguridad = {
          accionable: false,
          motivo:
            'Recomendacion de riego no disponible: no se valido la zona radicular activa con las lecturas actuales.',
          limitaciones: ['zona radicular activa no validada'],
        };
      }
      if (!seguridad.accionable) {
        // Un calculo bloqueado no se guarda como prediccion ni como diagnostico
        // accionable. Se invalida cualquier serie/agua util previa y se corta.
        await this.marcarSiembraSinRecomendacion(
          idSiembra,
          seguridad.motivo,
        );
        this.logger.warn(
          `Riego bloqueado para ${idSiembra}: ${seguridad.motivo}`,
        );
        return;
      }

      const {
        calculoRaices,
        et0Promedio,
        umbralDeRiego,
        capacidadRetencionTotal,
        nivelesCapacidadCampo,
        aguaUtilFacilmenteDisponiblePotencial,
        nivelesLecturaSensor,
        aguaUtilFacilmenteDisponibleReal,
        estadoCalculoAguaUtil,
        motivoCalculoAguaUtil,
        nivelesConRaicesDetectadas,
        nivelesConDatosDisponibles,
        pronosticosRiego,
        aguaUtilPct,
        deficitMm,
        demanda3Dias,
        lluviaEfectiva72h,
        recomendacionHoyMm,
        estadoCapacidadCampo,
        motivoCapacidadCampo,
        trazas,
        calidadDatos,
      } = resultadoRiego;

      const suelosSensorActualizados = this.actualizarSueloConRiegoV12(
        suelosPersistidosConSensor,
        nivelesLecturaSensor,
      );
      const suelosActualizados = this.mergeSuelosConActualizacionSensor(
        lotePersistido,
        suelosPersistidosConSensor,
        suelosSensorActualizados,
      );

      // Guardar resultado auditable del motor de riego V12.
      const variables: IVariablesPrediccionRiego = {
        calculoRaices,
        et0Promedio,
        umbralDeRiego,
        capacidadRetencionTotal,
        nivelesCapacidadCampo,
        aguaUtilFacilmenteDisponiblePotencial,
        nivelesLecturaSensor,
        aguaUtilFacilmenteDisponibleReal,
        // Nuevos campos informativos
        estadoCalculoAguaUtil,
        motivoCalculoAguaUtil,
        nivelesConRaicesDetectadas,
        nivelesConDatosDisponibles,
        aguaUtilPct,
        deficitMm,
        demanda3Dias,
        lluviaEfectiva72h,
        recomendacionHoyMm,
        estadoCapacidadCampo,
        motivoCapacidadCampo,
        trazas,
        calidadDatos,
        pronosticosRiego,
      };
      const regar: IResultadoPrediccionRiego[] = pronosticosRiego.map(
        (pronostico, index) => ({
          fecha: pronostico.fecha?.slice(0, 10),
          cantidad:
            index === 0
              ? recomendacionHoyMm
              : pronostico.regar
                ? Number(lote.capacidadDeRiego)
                : 0,
        }),
      );
      const estadoRecomendacion = resolverEstadoRecomendacionRiego({
        pronosticosRiego,
        estadoCalculoAguaUtil,
        motivoCalculoAguaUtil,
        calidadDatos,
      });

      const create: ICreatePrediccionRiego = {
        idQuimica: siembra.idQuimica,
        idDistribuidor: siembra.idDistribuidor,
        idProductor: siembra.idProductor,
        idEstablecimiento: siembra.idEstablecimiento,
        //
        idSiembra: siembra._id,
        idLote: siembra.idLote,
        fechaPrediccion:
          regar[0]?.fecha?.slice(0, 10) ||
          new Date().toISOString().slice(0, 10),
        regar,
        variables,
      };
      try {
        const tieneCalibracionSensor = nivelesLecturaSensor.some(
          (nivel) => nivel.fuenteCapacidadCampo === 'auto',
        );
        const persistenciaSensor =
          nivelesLecturaSensor.length &&
          estadoRecomendacion.estado === 'calculada'
          ? this.lotesService.update(lotePersistido._id, {
              suelos: suelosActualizados,
              ...(tieneCalibracionSensor
                ? {
                    sueloProcedencia: 'sensor' as const,
                    sueloConfirmadoPorUsuario: false,
                  }
                : {}),
            })
          : Promise.resolve(lotePersistido);
        const [prediccion] = await Promise.all([
          this.prediccionRiegoService.create(create),
          this.siembrasService.update(idSiembra, {
            ultimaPrediccionRiego: create.regar,
            aguaUtilReal: aguaUtilFacilmenteDisponibleReal,
            estadoCalculoAguaUtil,
            motivoCalculoAguaUtil,
            estadoRecomendacionRiego: estadoRecomendacion.estado,
            fuenteRecomendacionRiego: estadoRecomendacion.fuente ?? null,
            motivoRecomendacionRiego: estadoRecomendacion.motivo,
          }),
          persistenciaSensor,
        ]);

        // Log resumen de la predicción completada
        const aguaUtilLog =
          (estadoCalculoAguaUtil === 'calculado' ||
            estadoCalculoAguaUtil === 'estimado') &&
          Number.isFinite(aguaUtilFacilmenteDisponibleReal)
            ? `${aguaUtilFacilmenteDisponibleReal}mm`
            : 'N/A';
        Logger.log(
          `Predicción de riego completada - Siembra: ${idSiembra}, Agua útil: ${aguaUtilLog} (${estadoCalculoAguaUtil}), Fuente: ${idLanzaHumedad ? 'LoRaWAN' : 'FieldClimate'}`,
        );

        if (
          estadoRecomendacion.estado === 'calculada' &&
          estadoRecomendacion.fuente === 'sensor_suelo'
        ) {
          await this.verificarIntegraciones(prediccion, siembra);
        } else {
          this.logger.warn(
            `No se envia integracion de riego para ${idSiembra}: ${estadoRecomendacion.motivo}`,
          );
        }
      } catch (error) {
        this.logger.error(error);
        const motivo = `Recomendacion de riego no disponible: fallo la persistencia del calculo (${(error as Error)?.message || error}).`;
        try {
          await this.marcarSiembraSinRecomendacion(idSiembra, motivo);
        } catch (updateError) {
          this.logger.error(
            `No se pudo invalidar la recomendacion anterior de ${idSiembra} tras el fallo de persistencia: ${(updateError as Error)?.message || updateError}`,
          );
        }
      }
    } catch (error) {
      const motivo = `Recomendacion de riego no disponible: fallo una dependencia del calculo (${(error as Error)?.message || error}).`;
      this.logger.error(
        `Error en la prediccion de riego de la siembra ${idSiembra} del lote ${siembra.lote?.nombre} del productor ${siembra.productor?.nombre}`,
      );
      console.error(error);
      try {
        await this.marcarSiembraSinRecomendacion(idSiembra, motivo);
      } catch (updateError) {
        this.logger.error(
          `No se pudo invalidar la recomendacion anterior de ${idSiembra}: ${(updateError as Error)?.message || updateError}`,
        );
      }
    }
  }

  async actualizarCapacidadCampo(idSonda: string, fecha: string) {
    const estacion = await this.estacionsService.getById(idSonda);
    const lat = estacion.position.geo.coordinates[1];
    const lng = estacion.position.geo.coordinates[0];
    const f = this.getFechasDatos(fecha);

    const [sondaSuelo, pluviometro] = await Promise.all([
      this.climaService.getSueloPorDispositivoEntreFechas(
        idSonda,
        f.from,
        f.to,
      ),
      this.climaService.getPluviometroMasCercanaEntreFechas(
        lat,
        lng,
        f.from,
        f.to,
        'hourly',
      ),
    ]);

    if (!sondaSuelo.length) {
      this.logger.warn(
        `No se puede actualizar la capacidad de campo para la sonda ${idSonda} porque no hay datos de humedad de suelo`,
      );
      return;
    }

    const { reporteDia1Nueve, reporteNocheOcho, reporteDia2Ocho } =
      this.getReportesALasOcho(sondaSuelo, fecha);

    const lluvias = this.sumaLluvias24Hs(
      pluviometro,
      reporteDia1Nueve.fecha,
      reporteDia2Ocho.fecha,
    );

    const res = this.obtenerPrimerYUltimoReporteDiaNoche(sondaSuelo);

    const niveles: { nivel: number; capacidadCampo: number }[] = [];
    const keys = Object.keys(sondaSuelo[0].humedadSuelo);
    for (let i = 1; i <= keys.length; i++) {
      const result = this.calcularCapacidadCampo(
        fecha,
        i,
        res,
        lluvias,
        reporteNocheOcho,
      );
      if (result) {
        const nivel = {
          nivel: i,
          capacidadCampo: result,
        };
        niveles.push(nivel);
      }
    }

    if (niveles.length) {
      const lotes = await this.lotesService.getByIdSonda(idSonda);
      for (const lote of lotes) {
        const suelos = lote.suelos || [];
        for (const nivel of niveles) {
          const suelo = suelos.find((s) => s.numeroDeSensor === nivel.nivel);
          if (suelo) {
            suelo.capacidadDeCampo = nivel.capacidadCampo;
          } else {
            suelos.push({
              numeroDeSensor: nivel.nivel,
              capacidadDeCampo: nivel.capacidadCampo,
            });
          }
        }
        this.logger.debug(
          `Actualizando capacidad de campo para el lote ${
            lote.nombre
          }. ${JSON.stringify(niveles)}`,
        );
        await this.lotesService.update(lote._id, {
          suelos,
          sueloProcedencia: 'sensor',
          sueloConfirmadoPorUsuario: false,
        });
      }
    }

    return niveles;
  }

  private async resolverIdSensorPerfilSuelo(
    lote: ILote,
  ): Promise<string | undefined> {
    const condiciones: Record<string, unknown>[] = [];
    if (HelperService.arrayValido(lote.idsDispositivo)) {
      condiciones.push({
        _id: { $in: lote.idsDispositivo },
        tipo: 'Sensor de Humedad de Suelo',
      });
    }
    if (lote._id) {
      condiciones.push({
        servicios: {
          $elemMatch: {
            tipo: 'perfil_suelo',
            idLote: lote._id,
            habilitado: { $ne: false },
          },
        },
      });
    }
    if (!condiciones.length) return undefined;

    try {
      const filter = {
        $or: condiciones,
      } as unknown as IFilter<IDispositivo>;
      const query: IQueryParam = {
        filter: JSON.stringify(filter),
        limit: 0,
        sort: '-fechaUltimaComunicacion',
      };
      const dispositivos = (await this.dispositivosService.get(query)).datos;
      const ids = (dispositivos || [])
        .map((dispositivo) => dispositivo._id)
        .filter((id): id is string => !!id);
      if (ids.length > 1) {
        this.logger.warn(
          `Hay mas de un perfil de suelo en el lote ${lote.nombre}; se usa el de comunicacion mas reciente.`,
        );
      }
      if (!ids.length) {
        this.logger.warn(
          `No se encontro perfil de suelo asignado al lote ${lote.nombre}.`,
        );
      }
      return ids[0];
    } catch (error) {
      this.logger.error(
        `Error al resolver el perfil de suelo del lote ${lote.nombre}: ${
          (error as Error)?.message || error
        }`,
      );
      return undefined;
    }
  }

  private async marcarSiembraSinRecomendacion(
    idSiembra: string,
    motivo: string,
  ): Promise<void> {
    await this.siembrasService.update(idSiembra, {
      ultimaPrediccionRiego: [],
      aguaUtilReal: null,
      estadoCalculoAguaUtil: 'no_disponible',
      motivoCalculoAguaUtil: motivo,
      estadoRecomendacionRiego: 'no_disponible',
      fuenteRecomendacionRiego: null,
      motivoRecomendacionRiego: motivo,
    });
  }

  //

  private async resolverLoteConEntradasAgronomicas(
    lote: ILote,
  ): Promise<ILote> {
    if (!lote?._id) return aplicarEntradasAgronomicasSuelo(lote, null);
    try {
      const inputs = await this.lotesService.getSoilAgronomicInputs(lote._id);
      return aplicarEntradasAgronomicasSuelo(lote, inputs);
    } catch (error) {
      this.logger.warn(
        `Entradas edaficas no disponibles para riego del lote ${lote._id}; se conserva el perfil operativo previo: ${error?.message || error}`,
      );
      return aplicarEntradasAgronomicasSuelo(lote, null);
    }
  }

  /**
   * Una profundidad cartografica no identifica por si sola un canal fisico.
   * Solo un numero de sensor persistido se considera un mapeo operativo.
   */
  private getSuelosPersistidosConMapeoSensor(lote: ILote): ISuelo[] {
    return (lote.suelos || []).filter((suelo) => {
      const numeroDeSensor = Number(suelo.numeroDeSensor);
      return Number.isInteger(numeroDeSensor) && numeroDeSensor > 0;
    });
  }

  /**
   * Conserva el layout de una sonda ya mapeada y toma de la copia canonica sus
   * propiedades por profundidad. Sin mapeo real devuelve [] para que V12
   * infiera todos los canales presentes en humedadSuelo.
   */
  private getSuelosParaRiegoV12(
    loteCanonico: ILote,
    suelosPersistidosConSensor: ISuelo[],
  ): ISuelo[] {
    if (!suelosPersistidosConSensor.length) return [];
    const sensores = new Set(
      suelosPersistidosConSensor.map((suelo) => Number(suelo.numeroDeSensor)),
    );
    return (loteCanonico.suelos || []).filter((suelo) =>
      sensores.has(Number(suelo.numeroDeSensor)),
    );
  }

  /**
   * Al actualizar una sonda ya mapeada conserva cualquier capa no asociada a
   * sensores. Si aun no habia mapeo, el nuevo layout inferido reemplaza la
   * capa automatica legacy que no representaba canales fisicos.
   */
  private mergeSuelosConActualizacionSensor(
    lotePersistido: ILote,
    suelosPersistidosConSensor: ISuelo[],
    suelosSensorActualizados: ISuelo[],
  ): ISuelo[] {
    if (!suelosPersistidosConSensor.length) return suelosSensorActualizados;
    const actualizados = new Map(
      suelosSensorActualizados.map((suelo) => [
        Number(suelo.numeroDeSensor),
        suelo,
      ]),
    );
    return (lotePersistido.suelos || []).map((suelo) => {
      const numeroDeSensor = Number(suelo.numeroDeSensor);
      return actualizados.get(numeroDeSensor) || suelo;
    });
  }

  private calcularCapacidadCampo(
    fecha: string,
    nivel: number,
    res: IRespuestaInicioDiaNoche,
    lluvias: number,
    reporteNocheOcho: IClimaEstacionMeteorologica,
  ): number | null {
    let capacidadCampo = null;

    const deltaDiario = +(
      res.ultimoReporteNoche.humedadSuelo[nivel].avg -
      res.primerReporteDia.humedadSuelo[nivel].avg
    ).toFixed(4);
    const pendienteDiario = +(
      deltaDiario /
      (res.horasDia + res.horasNoche)
    ).toFixed(4);
    const deltaDia = +(
      res.ultimoReporteDia.humedadSuelo[nivel].avg -
      res.primerReporteDia.humedadSuelo[nivel].avg
    ).toFixed(4);
    const pendienteDia = +(deltaDia / res.horasDia).toFixed(4);
    const deltaNoche = +(
      res.ultimoReporteNoche.humedadSuelo[nivel].avg -
      res.primerReporteNoche.humedadSuelo[nivel].avg
    ).toFixed(4);
    const pendienteNoche = +(deltaNoche / res.horasNoche).toFixed(4);
    if (pendienteNoche === 0) {
      this.logger.debug(
        `No se calcula capacidad de campo para el nivel ${nivel} porque la pendiente de la noche es 0`,
      );
      return capacidadCampo;
    }
    const relacionDiaNoche = +(pendienteDia / pendienteNoche).toFixed(4);

    if (
      lluvias < 1 &&
      pendienteDiario < -0.02 &&
      relacionDiaNoche > 2.99 &&
      pendienteDia < -0.3 &&
      pendienteNoche < 0
    ) {
      this.logger.debug(
        `Cumple con las condiciones para calcular el nivel ${nivel}`,
      );
      capacidadCampo = reporteNocheOcho.humedadSuelo[nivel].avg;
    } else {
      this.logger.debug(
        `No se cumple con las condiciones para calcular el nivel ${nivel}`,
      );
    }

    return capacidadCampo;
  }

  private sumaLluvias24Hs(
    pluviometro: IClimaEstacionMeteorologica[],
    desde: string,
    hasta: string,
  ) {
    const index1 = pluviometro.findIndex((p) => p.fecha === desde);
    const index2 = pluviometro.findIndex((p) => p.fecha === hasta);
    const reportes = pluviometro.slice(index1 + 1, index2 + 1);
    const suma = reportes.reduce((acc, r) => acc + r.lluvia.sum, 0);
    return suma;
  }

  private getReportesALasOcho(
    sonda: IClimaEstacionMeteorologica[],
    fecha: string,
  ) {
    const fechaDia1Nueve = new Date(fecha);
    fechaDia1Nueve.setUTCDate(fechaDia1Nueve.getUTCDate() - 1);
    fechaDia1Nueve.setUTCHours(11, 0, 0, 0);

    const fechaNocheOcho = new Date(fecha);
    fechaNocheOcho.setUTCDate(fechaNocheOcho.getUTCDate() - 1);
    fechaNocheOcho.setUTCHours(23, 0, 0, 0);

    const fechaDia2Ocho = new Date(fecha);
    fechaDia2Ocho.setUTCHours(11, 0, 0, 0);

    const reporteDia1Nueve = sonda.find(
      (r) => r.fecha === fechaDia1Nueve.toISOString(),
    );
    const reporteNocheOcho = sonda.find(
      (r) => r.fecha === fechaNocheOcho.toISOString(),
    );
    const reporteDia2Ocho = sonda.find(
      (r) => r.fecha === fechaDia2Ocho.toISOString(),
    );
    return { reporteDia1Nueve, reporteNocheOcho, reporteDia2Ocho };
  }

  private getFechasDatos(fecha = new Date().toISOString(), diasHistoricos = 1) {
    // El motor V12 necesita historial suficiente para detectar raices y estimar capacidad de campo.
    const desde = new Date(fecha);
    desde.setUTCDate(desde.getUTCDate() - Math.max(1, diasHistoricos));
    desde.setUTCHours(0, 0, 0, 0);

    // Hasta el cierre del dia consultado para tomar la ultima lectura disponible.
    const hasta = new Date(fecha);
    hasta.setUTCHours(23, 59, 59, 999);

    const from = desde.toISOString();
    const to = hasta.toISOString();

    return { from, to };
  }

  private obtenerPrimerYUltimoReporteDiaNoche(
    sondaSuelo: IClimaEstacionMeteorologica[],
  ) {
    const response: IRespuestaInicioDiaNoche = {
      primerReporteNoche: null,
      ultimoReporteNoche: null,
      primerReporteDia: null,
      ultimoReporteDia: null,
      horasDia: 0,
      horasNoche: 0,
    };
    for (let i = 0; i < sondaSuelo.length; i++) {
      const dato = sondaSuelo[i];
      const datoAnterior = sondaSuelo[i - 1];
      //
      if (dato.diaNoche === 'Día') {
        if (!response.primerReporteDia) {
          response.primerReporteDia = dato;
        }
        if (datoAnterior?.diaNoche === 'Noche') {
          if (response.primerReporteNoche) {
            response.ultimoReporteNoche = datoAnterior;
          }
        }
      }
      if (dato.diaNoche === 'Noche') {
        if (datoAnterior?.diaNoche === 'Día') {
          response.ultimoReporteDia = datoAnterior;
          response.primerReporteNoche = dato;
        }
      }
    }

    const diasDia =
      new Date(response.ultimoReporteDia?.fecha).getTime() -
      new Date(response.primerReporteDia?.fecha).getTime();
    const diasNoche =
      new Date(response.ultimoReporteNoche?.fecha).getTime() -
      new Date(response.primerReporteNoche?.fecha).getTime();
    response.horasDia = Math.trunc(diasDia / 1000 / 60 / 60 + 1);
    response.horasNoche = Math.trunc(diasNoche / 1000 / 60 / 60 + 1);

    return response;
  }

  private obtenerHumedadSueloMaxima(
    sondaSuelo: IClimaEstacionMeteorologica[],
    nivel: number,
  ) {
    let max = 0;
    for (let i = 0; i < sondaSuelo.length; i++) {
      const dato = sondaSuelo[i];
      const humedad = dato.humedadSuelo?.[nivel]?.avg;
      if (humedad > max) {
        max = humedad;
      }
    }
    return max;
  }

  private sumarPrecipitaciones(
    pluviometro: IClimaEstacionMeteorologica[],
    res: IRespuestaInicioDiaNoche,
  ) {
    const primeraFecha = res.primerReporteDia?.fecha;
    const ultimaFecha = res.ultimoReporteNoche?.fecha;
    const indexInicial = pluviometro.findIndex((p) => p.fecha === primeraFecha);
    const indexFinal = pluviometro.findIndex((p) => p.fecha === ultimaFecha);
    let suma = 0;
    for (let i = indexInicial; i <= indexFinal; i++) {
      suma += pluviometro[i]?.lluvia?.sum || 0;
    }
    return suma;
  }

  private detectarRaicesPorNivel(
    lote: ILote,
    sondaSuelo: IClimaEstacionMeteorologica[],
    pluviometro: IClimaEstacionMeteorologica[],
    nivel = 1,
  ) {
    this.logger.debug(`Detectando Raices en nivel ${nivel}`);

    const suelo = lote.suelos?.find((s) => s.numeroDeSensor === nivel);

    const response: ICalculoRaices = {
      nivel,
      profundidad: suelo?.profundidad,
    };

    // Determina si la humedad no supera la capacidad de campo

    response.capacidadCampo = suelo?.capacidadDeCampo || lote.capacidadDeCampo;
    response.humedadMaxima = this.obtenerHumedadSueloMaxima(sondaSuelo, nivel);
    if (response.capacidadCampo) {
      if (response.humedadMaxima >= response.capacidadCampo) {
        this.logger.debug(
          `Humedad Maxima ${response.humedadMaxima} >= Capacidad de Campo ${response.capacidadCampo}. No se calculan raices`,
        );
        response.hayRaices = null;
        return response;
      }
    } else {
      this.logger.debug(`No se encontro capacidad de campo`);
    }

    const res = this.obtenerPrimerYUltimoReporteDiaNoche(sondaSuelo);

    // Suma las precipitaciones entre el primer reporte del dia y el ultimo reporte de la noche
    response.precipitaciones = this.sumarPrecipitaciones(pluviometro, res);
    if (response.precipitaciones > 1) {
      this.logger.debug(
        `Precipitaciones ${response.precipitaciones} mm. No se calculan raices`,
      );
      response.hayRaices = null;
      return response;
    }
    response.inicioDia = {
      fecha: res.primerReporteDia?.fecha,
      humedad: res.primerReporteDia?.humedadSuelo?.[nivel]?.avg,
    };
    response.finDia = {
      fecha: res.ultimoReporteDia?.fecha,
      humedad: res.ultimoReporteDia?.humedadSuelo?.[nivel]?.avg,
    };
    response.inicioNoche = {
      fecha: res.primerReporteNoche?.fecha,
      humedad: res.primerReporteNoche?.humedadSuelo?.[nivel]?.avg,
    };
    response.finNoche = {
      fecha: res.ultimoReporteNoche?.fecha,
      humedad: res.ultimoReporteNoche?.humedadSuelo?.[nivel]?.avg,
    };
    response.horasDia = res.horasDia;
    response.horasNoche = res.horasNoche;

    response.deltaDiario = +(
      response.finNoche.humedad - response.inicioDia.humedad
    ).toFixed(4);
    response.deltaDia = +(
      response.finDia.humedad - response.inicioDia.humedad
    ).toFixed(4);
    response.pendienteDia = +(response.deltaDia / res.horasDia).toFixed(4);
    response.deltaNoche = +(
      response.finNoche.humedad - response.inicioNoche.humedad
    ).toFixed(4);
    response.pendienteNoche = +(response.deltaNoche / res.horasNoche).toFixed(
      4,
    );
    if (response.pendienteNoche === 0) {
      response.hayRaices = false;
      return response;
    }
    response.relacionDiaNoche = +(
      response.pendienteDia / response.pendienteNoche
    ).toFixed(4);
    response.condicion =
      response.deltaDiario <= -0.05 || response.deltaDiario > 0.1
        ? 'Aceptado'
        : 'Rechazado';
    response.hayRaices = response.relacionDiaNoche > 0.1 ? true : false;

    if (response.condicion !== 'Aceptado') {
      response.hayRaices = null;
    }
    return response;
  }

  /**
   * Adapta datos de lanza LoRaWAN al formato FieldClimate para mantener
   * compatibilidad con toda la lógica existente de detección de raíces
   */
  private adaptarDatosLoRaWANAFieldClimate(
    reportesLanza: any[],
  ): IClimaEstacionMeteorologica[] {
    return adaptarPerfilSueloLoRaWAN(reportesLanza);
  }

  private actualizarSueloConRiegoV12(
    suelos: ISuelo[] = [],
    nivelesLecturaSensor: INivelLecturaSensor[] = [],
  ): ISuelo[] {
    if (!nivelesLecturaSensor.length) {
      return suelos;
    }

    const base = suelos.length
      ? suelos
      : nivelesLecturaSensor.map((nivel, index) => ({
          numeroDeSensor: nivel.numeroDeSensor || index + 1,
          profundidad: nivel.profundidad || (index + 1) * 10,
        }));

    return base.map((suelo, index) => {
      const lectura =
        nivelesLecturaSensor.find(
          (nivel) =>
            nivel.numeroDeSensor === suelo.numeroDeSensor ||
            nivel.profundidad === suelo.profundidad,
        ) || nivelesLecturaSensor[index];

      if (!lectura) return suelo;

      const capacidadSensor =
        lectura.fuenteCapacidadCampo === 'auto'
          ? lectura.capacidadCampo
          : undefined;
      const conservarCapacidad = Object.prototype.hasOwnProperty.call(
        suelo,
        'capacidadDeCampo',
      );
      const conservarMarchitez = Object.prototype.hasOwnProperty.call(
        suelo,
        'puntoMarchitez',
      );

      return {
        ...suelo,
        numeroDeSensor:
          suelo.numeroDeSensor || lectura.numeroDeSensor || index + 1,
        profundidad:
          suelo.profundidad || lectura.profundidad || (index + 1) * 10,
        ...(Number.isFinite(capacidadSensor)
          ? { capacidadDeCampo: capacidadSensor }
          : conservarCapacidad
            ? { capacidadDeCampo: suelo.capacidadDeCampo }
            : {}),
        ...(conservarMarchitez ? { puntoMarchitez: suelo.puntoMarchitez } : {}),
        hayRaices: lectura.hayRaices ?? suelo.hayRaices,
      };
    });
  }

  private async actualizarRaices(
    lote: ILote,
    suelos: ISuelo[],
    sondaSuelo: IClimaEstacionMeteorologica[],
    pluviometro: IClimaEstacionMeteorologica[],
  ) {
    const sueloActualizado: ISuelo[] = [];
    let calcularRaices = true;

    if (!sondaSuelo[0]?.humedadSuelo) {
      this.logger.warn(
        `No se puede actualizar las raices del lote ${lote.nombre} porque no hay datos de humedad de suelo`,
      );
      return { sueloActualizado: lote.suelos, calculoRaices: [] };
    }

    const keys = Object.keys(sondaSuelo[0].humedadSuelo);
    const calculoRaices: ICalculoRaices[] = [];
    for (let i = 1; i <= keys.length; i++) {
      let suelo = suelos.find((s) => s.numeroDeSensor === i);
      if (!suelo) {
        suelo = {
          numeroDeSensor: i,
          profundidad: i * 10,
          hayRaices: false,
        };
      }
      // Si no hay suelo o no hay raices, calcula raices
      if (!suelo?.hayRaices && calcularRaices) {
        const res = this.detectarRaicesPorNivel(
          lote,
          sondaSuelo,
          pluviometro,
          i,
        );

        calculoRaices.push(res);
        suelo.hayRaices = res?.hayRaices;
        // Si el ultimo cálculo de raices es false, no se calculan mas raices
        if (!suelo.hayRaices) {
          calcularRaices = false;
        }
      }
      sueloActualizado.push(suelo);
    }

    const loteActualizado = await this.lotesService.update(lote._id, {
      suelos: sueloActualizado,
    });
    return { sueloActualizado: loteActualizado.suelos, calculoRaices };
  }

  private calcularPronosticoDeRiego(
    pronostico7Dias: IPronosticoEstacionMeteorologica[],
    siembra: ISiembra,
    cultivo: Cultivo,
    crono: ICrono,
    afd: number,
    afdPotencial: number,
    umbralRiego: number,
  ) {
    const capacidadDeRiego = siembra.lote.capacidadDeRiego || 6;
    let sumaLluvias = 0;
    let pronosticosRiego: IPronosticoRiego[] = [];

    if (pronostico7Dias.length < 7) {
      this.logger.error(
        `No se puede hacer la prediccion de riego para la siembra ${siembra._id} en el lote ${siembra.lote?.nombre} porque no hay suficientes datos de pronostico`,
      );
      return;
    }

    // Calcula consumo de agua, lluvias y cc porcentual
    for (let i = 0; i < 7; i++) {
      const pronostico = pronostico7Dias[i];
      const fecha = new Date(pronostico.fecha);
      const fechaSiembra = new Date(siembra.fechaSiembra);
      const diasDesdeEmergencia = HelperService.getDiasDesdeEmergencia(
        siembra.crono,
        fechaSiembra,
        fecha,
      );

      const kc = HelperService.getKc(diasDesdeEmergencia, cultivo, crono);
      const et0 = pronostico.et0;

      const pronosticoRiego: IPronosticoRiego = {
        fecha: pronostico.fecha,
        et0,
        kc,
        consumoAgua: +(kc * et0).toFixed(2),
        lluvias: 0, // Se completa abajo si la probabilidad de lluvia es mayor a 70%
      };

      if (pronostico.probabilidadLluvia >= 70) {
        sumaLluvias += pronostico.lluvia;
        pronosticoRiego.lluvias = pronostico.lluvia;
      }
      pronosticosRiego.push(pronosticoRiego);
    }

    // Calcula prevision de consumo de agua para los proximos 3 dias
    for (let i = 0; i < 5; i++) {
      const dif1 = pronosticosRiego[i]?.consumoAgua || 0;
      const dif2 = pronosticosRiego[i + 1]?.consumoAgua || 0;
      const dif3 = pronosticosRiego[i + 2]?.consumoAgua || 0;
      pronosticosRiego[i].previsionConsumo3Dias = dif1 + dif2 + dif3;
    }

    // Calcula afd, saldoDiario y si se debe regar
    for (let i = 0; i < 5; i++) {
      const pronosticoRiego = pronosticosRiego[i];
      const pronosticoDiaAnterior = pronosticosRiego[i - 1];
      const riegoDiaAnterior = pronosticoDiaAnterior?.regar
        ? capacidadDeRiego
        : 0;

      pronosticoRiego.afd = pronosticoDiaAnterior?.saldoDiario || afd;

      pronosticoRiego.saldoDiario = +(
        pronosticoRiego.afd -
        pronosticoRiego.consumoAgua +
        pronosticoRiego.lluvias +
        riegoDiaAnterior
      ).toFixed(2);

      pronosticoRiego.ccPorcentual = +(
        pronosticoRiego.saldoDiario / afdPotencial
      ).toFixed(2);

      if (
        pronosticoRiego.previsionConsumo3Dias >= capacidadDeRiego &&
        pronosticoRiego.saldoDiario / afdPotencial < 0.3
      ) {
        pronosticoRiego.regar = true;
      } else {
        pronosticoRiego.regar = false;
      }
    }

    pronosticosRiego = pronosticosRiego.slice(0, pronosticosRiego.length - 2);

    return { sumaLluvias, pronosticosRiego };
  }

  private calcularAguaPorNivelPotencial(
    pronostico7Dias: IPronosticoEstacionMeteorologica[],
    sueloActualizado: ISuelo[],
    lote: ILote,
    cultivo: Cultivo,
  ) {
    const nivelesCapacidadCampo: INivelCapacidadCampo[] = [];

    const et0Promedio = HelperService.getEt0Promedio(pronostico7Dias);
    const umbralDeRiego = HelperService.getUmbralDeRiego(cultivo, et0Promedio);
    const anchoBulbo = lote.anchoDeBulbo || 1;

    // Manejo seguro de distanciaEntreSensores
    let distanciaEntreSensores = 10; // Valor por defecto
    if (
      sueloActualizado &&
      sueloActualizado.length > 0 &&
      sueloActualizado[0].profundidad
    ) {
      distanciaEntreSensores = sueloActualizado[0].profundidad;
    }

    let aguaUtilFacilmenteDisponiblePotencial = 0;
    let capacidadRetencionTotal = 0;
    for (const suelo of sueloActualizado) {
      if (!suelo.hayRaices) continue;

      const nivel: INivelCapacidadCampo = {
        capacidadCampo: suelo.capacidadDeCampo || lote.capacidadDeCampo,
        profundidad: suelo.profundidad,
      };

      nivel.aguaUtil = +(nivel.capacidadCampo * umbralDeRiego).toFixed(2);
      nivel.fraccionDeConsumo = +(nivel.aguaUtil * umbralDeRiego).toFixed(2);
      nivel.aguaUtilFacilmenteDisponible =
        HelperService.getAguaUtilFacilmenteDisponible(
          distanciaEntreSensores,
          anchoBulbo,
          lote.metrosLinealesHas || 10000,
          nivel.aguaUtil,
        );
      nivel.capacidadDeRetencion = +(
        (nivel.aguaUtilFacilmenteDisponible / nivel.fraccionDeConsumo) *
        nivel.aguaUtil
      ).toFixed(2);
      aguaUtilFacilmenteDisponiblePotencial +=
        nivel.aguaUtilFacilmenteDisponible;
      capacidadRetencionTotal += nivel.capacidadDeRetencion;

      nivelesCapacidadCampo.push(nivel);
    }
    capacidadRetencionTotal = +capacidadRetencionTotal.toFixed(2);
    aguaUtilFacilmenteDisponiblePotencial =
      +aguaUtilFacilmenteDisponiblePotencial.toFixed(2);

    return {
      nivelesCapacidadCampo,
      et0Promedio,
      umbralDeRiego,
      aguaUtilFacilmenteDisponiblePotencial,
      capacidadRetencionTotal,
    };
  }

  private calcularAguaPorNivelReal(
    pronostico7Dias: IPronosticoEstacionMeteorologica[],
    sueloActualizado: ISuelo[],
    lote: ILote,
    cultivo: Cultivo,
    sondaSuelo: IClimaEstacionMeteorologica[],
  ) {
    const nivelesLecturaSensor: INivelCapacidadCampo[] = [];

    const et0Promedio = HelperService.getEt0Promedio(pronostico7Dias);
    const umbralDeRiego = HelperService.getUmbralDeRiego(cultivo, et0Promedio);
    const anchoBulbo = lote.anchoDeBulbo || 1;
    const distanciaEntreSensores = sueloActualizado[0].profundidad || 10;

    let aguaUtilFacilmenteDisponibleReal = 0;
    let capacidadRetencionTotal = 0;
    for (const suelo of sueloActualizado) {
      if (!suelo.hayRaices) continue;

      const nivel: INivelLecturaSensor = {
        humedad: HelperService.getHumedadSueloPorNivel(
          sondaSuelo,
          suelo.numeroDeSensor,
        ),
        profundidad: suelo.profundidad,
      };

      nivel.aguaUtil = +(nivel.humedad * umbralDeRiego).toFixed(2);
      nivel.fraccionDeConsumo = +(nivel.aguaUtil * umbralDeRiego).toFixed(2);
      nivel.aguaUtilFacilmenteDisponible =
        HelperService.getAguaUtilFacilmenteDisponible(
          distanciaEntreSensores,
          anchoBulbo,
          lote.metrosLinealesHas || 10000,
          nivel.aguaUtil,
        );
      nivel.capacidadDeRetencion = +(
        (nivel.aguaUtilFacilmenteDisponible / nivel.fraccionDeConsumo) *
        nivel.aguaUtil
      ).toFixed(2);

      aguaUtilFacilmenteDisponibleReal += nivel.aguaUtilFacilmenteDisponible;
      capacidadRetencionTotal += nivel.capacidadDeRetencion;

      nivelesLecturaSensor.push(nivel);
    }
    capacidadRetencionTotal = +capacidadRetencionTotal.toFixed(2);
    aguaUtilFacilmenteDisponibleReal =
      +aguaUtilFacilmenteDisponibleReal.toFixed(2);

    return {
      nivelesLecturaSensor,
      et0Promedio,
      umbralDeRiego,
      aguaUtilFacilmenteDisponibleReal,
      capacidadRetencionTotal,
    };
  }

  /**
   * Nuevo método: Calcula agua útil real independiente de la detección de raíces
   * Este método siempre calcula agua útil para todos los niveles con datos disponibles,
   * sin depender de si se detectaron raíces activas o no.
   */
  private calcularAguaUtilReal(
    pronostico7Dias: IPronosticoEstacionMeteorologica[],
    sueloActualizado: ISuelo[],
    lote: ILote,
    cultivo: Cultivo,
    sondaSuelo: any[], // Cambiado para soportar tanto FieldClimate como Lanza LoRaWAN
    calculoRaices: ICalculoRaices[],
  ) {
    const nivelesLecturaSensor: INivelLecturaSensor[] = [];

    // SIEMPRE usar ET0 para predicciones futuras (tanto FieldClimate como LoRaWAN)
    const et0Promedio = HelperService.getEt0Promedio(pronostico7Dias);
    const umbralDeRiego = HelperService.getUmbralDeRiego(cultivo, et0Promedio);

    // Validar que umbralDeRiego sea un número válido
    if (!umbralDeRiego || isNaN(umbralDeRiego) || umbralDeRiego <= 0) {
      Logger.error(
        `[AGUA UTIL] umbralDeRiego inválido: ${umbralDeRiego}. Cultivo: ${cultivo}, ET0: ${et0Promedio}`,
      );
      return {
        aguaUtilReal: NaN,
        estadoCalculoAguaUtil: 'fallida' as const,
        motivoCalculoAguaUtil: `Error: umbralDeRiego inválido (${umbralDeRiego}) para cultivo ${cultivo} con ET0 ${et0Promedio}`,
      };
    }

    const anchoBulbo = lote.anchoDeBulbo || 1;
    const distanciaEntreSensores = sueloActualizado[0].profundidad || 10;

    let aguaUtilFacilmenteDisponibleReal = 0;
    let capacidadRetencionTotal = 0;
    let nivelesConDatosDisponibles = 0;
    let nivelesConRaicesDetectadas = 0;
    let nivelesConHumedadAlta = 0;

    // Variables para determinar el estado del cálculo
    const motivosCalculoPartial: string[] = [];

    for (const suelo of sueloActualizado) {
      // Verificar si hay datos de humedad para este nivel (formato FieldClimate estándar)
      const ultimoRegistro = sondaSuelo[sondaSuelo.length - 1];
      const humedadNivel =
        ultimoRegistro?.humedadSuelo?.[suelo.numeroDeSensor]?.avg;

      if (humedadNivel === null || humedadNivel === undefined) {
        motivosCalculoPartial.push(
          `No hay datos para sensor nivel ${suelo.numeroDeSensor}`,
        );
        continue;
      }

      nivelesConDatosDisponibles++;

      // Verificar el estado de las raíces para este nivel
      const calculoRaicesNivel = calculoRaices.find(
        (cr) => cr.nivel === suelo.numeroDeSensor,
      );

      if (calculoRaicesNivel?.hayRaices === true) {
        nivelesConRaicesDetectadas++;
      } else if (calculoRaicesNivel?.hayRaices === null) {
        // Raíces no detectadas por condiciones (ej: humedad alta)
        if (
          calculoRaicesNivel.humedadMaxima >= calculoRaicesNivel.capacidadCampo
        ) {
          nivelesConHumedadAlta++;
          motivosCalculoPartial.push(
            `La humedad del suelo (${calculoRaicesNivel.humedadMaxima}%) supera la capacidad de campo (${calculoRaicesNivel.capacidadCampo}%)`,
          );
        }
      }

      // CALCULAR AGUA ÚTIL INDEPENDIENTEMENTE DEL ESTADO DE LAS RAÍCES
      const nivel: INivelLecturaSensor = {
        numeroDeSensor: suelo.numeroDeSensor,
        humedad: humedadNivel,
        profundidad: suelo.profundidad,
      };

      // Validar que todos los valores de entrada sean números válidos
      if (isNaN(humedadNivel) || isNaN(umbralDeRiego)) {
        Logger.warn(
          `[AGUA UTIL] Valores inválidos en nivel ${suelo.numeroDeSensor}: humedad=${humedadNivel}, umbralDeRiego=${umbralDeRiego}`,
        );
        // Asignar valores por defecto para evitar NaN
        nivel.aguaUtil = 0;
        nivel.fraccionDeConsumo = 0;
        nivel.aguaUtilFacilmenteDisponible = 0;
        nivel.capacidadDeRetencion = 0;
      } else {
        nivel.aguaUtil = +(nivel.humedad * umbralDeRiego).toFixed(2);
        nivel.fraccionDeConsumo = +(nivel.aguaUtil * umbralDeRiego).toFixed(2);
        nivel.aguaUtilFacilmenteDisponible =
          HelperService.getAguaUtilFacilmenteDisponible(
            distanciaEntreSensores,
            anchoBulbo,
            lote.metrosLinealesHas || 10000,
            nivel.aguaUtil,
          );

        // Evitar división por cero que causa NaN
        if (nivel.fraccionDeConsumo === 0) {
          nivel.capacidadDeRetencion = 0;
        } else {
          nivel.capacidadDeRetencion = +(
            (nivel.aguaUtilFacilmenteDisponible / nivel.fraccionDeConsumo) *
            nivel.aguaUtil
          ).toFixed(2);
        }

        // Validar que los resultados no sean NaN después de los cálculos
        if (
          isNaN(nivel.aguaUtil) ||
          isNaN(nivel.fraccionDeConsumo) ||
          isNaN(nivel.aguaUtilFacilmenteDisponible) ||
          isNaN(nivel.capacidadDeRetencion)
        ) {
          Logger.warn(
            `[AGUA UTIL] NaN detectado después del cálculo en nivel ${suelo.numeroDeSensor}, reemplazando con 0`,
          );
          nivel.aguaUtil = isNaN(nivel.aguaUtil) ? 0 : nivel.aguaUtil;
          nivel.fraccionDeConsumo = isNaN(nivel.fraccionDeConsumo)
            ? 0
            : nivel.fraccionDeConsumo;
          nivel.aguaUtilFacilmenteDisponible = isNaN(
            nivel.aguaUtilFacilmenteDisponible,
          )
            ? 0
            : nivel.aguaUtilFacilmenteDisponible;
          nivel.capacidadDeRetencion = isNaN(nivel.capacidadDeRetencion)
            ? 0
            : nivel.capacidadDeRetencion;
        }
      }

      aguaUtilFacilmenteDisponibleReal += nivel.aguaUtilFacilmenteDisponible;
      capacidadRetencionTotal += nivel.capacidadDeRetencion;

      nivelesLecturaSensor.push(nivel);
    }

    capacidadRetencionTotal = +capacidadRetencionTotal.toFixed(2);
    aguaUtilFacilmenteDisponibleReal =
      +aguaUtilFacilmenteDisponibleReal.toFixed(2);

    // Determinar el estado del cálculo de agua útil
    let estadoCalculoAguaUtil:
      | 'calculado'
      | 'estimado'
      | 'no_disponible'
      | 'fallida' = 'calculado';
    let motivoCalculoAguaUtil = '';

    if (nivelesConDatosDisponibles === 0) {
      estadoCalculoAguaUtil = 'fallida';
      motivoCalculoAguaUtil =
        motivosCalculoPartial.length > 0
          ? `Predicción fallida: ${motivosCalculoPartial.join('; ')}`
          : 'Predicción fallida: No hay datos de humedad disponibles';
    } else if (nivelesConRaicesDetectadas === 0 && nivelesConHumedadAlta > 0) {
      estadoCalculoAguaUtil = 'estimado';
      motivoCalculoAguaUtil = `Cálculo estimado: ${motivosCalculoPartial.join('; ')}`;
    } else if (nivelesConRaicesDetectadas < nivelesConDatosDisponibles) {
      estadoCalculoAguaUtil = 'estimado';
      motivoCalculoAguaUtil = `Cálculo estimado: capacidad de campo excedida`;
    }

    return {
      nivelesLecturaSensor,
      et0Promedio,
      umbralDeRiego,
      aguaUtilFacilmenteDisponibleReal,
      capacidadRetencionTotal,
      estadoCalculoAguaUtil,
      motivoCalculoAguaUtil,
      nivelesConRaicesDetectadas,
      nivelesConDatosDisponibles,
    };
  }

  private parseFechaLog(date: string) {
    return date.slice(0, 16).split('T').join(' ');
  }

  private async getDatosSondaParaCapacidadCampo(
    idSonda: string,
    fecha: string,
  ) {
    // Desde la fecha a las 8:00 ARS
    const to = new Date(fecha);
    to.setUTCHours(11, 0, 0, 0);
    const from = new Date(to);
    from.setUTCHours(from.getUTCHours() - 12);
    return await this.climaService.getSueloPorDispositivoEntreFechas(
      idSonda,
      from.toISOString(),
      to.toISOString(),
    );
  }

  private async getDatosPluviometroParaCapacidadCampo(
    estacion: IEstacion,
    fecha: string,
  ) {
    // Desde la fecha a las 8:00 ARS
    const to = new Date(fecha);
    to.setUTCHours(11, 0, 0, 0);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 1);
    const lat = estacion.position.geo.coordinates[1];
    const lng = estacion.position.geo.coordinates[0];

    return await this.climaService.getPluviometroMasCercanaEntreFechas(
      lat,
      lng,
      from.toISOString(),
      to.toISOString(),
    );
  }

  // Integracion externa

  private async verificarIntegraciones(
    prediccion: IPrediccionRiego,
    siembra: ISiembra,
  ) {
    try {
      const quimica = siembra.quimica;
      const distribuidor = siembra.distribuidor;
      const productor = siembra.productor;

      const integracionesA = [
        quimica?.integraciones || [],
        distribuidor?.integraciones || [],
        productor?.integraciones || [],
      ];
      const integraciones = integracionesA.flat();
      const integracionesHTTPS = integraciones.filter(
        (i) => i.prediccion === 'Riego' && i.tipoIntegracion === 'HTTPS',
      );

      const body = {
        idSiembra: siembra._id,
        fecha: prediccion.fechaPrediccion,
        productor: productor?.nombre,
        lote: siembra.lote?.nombre,
        recomendacion: prediccion.regar,
      };

      // Todos los envios en paralelo
      await Promise.all(
        integracionesHTTPS.map((integracion) =>
          this.httpsService.send(integracion, body),
        ),
      );
    } catch (error) {
      this.logger.error('error en verificarIntegraciones');
      console.error(error);
    }
  }
}

// Inputs Ejemplo

const sondaSuelo = [
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-28T20:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 18.2, max: 18.4, min: 18 },
      '2': { avg: 14.1, max: 14.3, min: 14 },
      '3': { avg: 12.6, max: 12.8, min: 12.6 },
      '4': { avg: 9.7, max: 9.9, min: 9.7 },
      '5': { avg: 10.1, max: 10.2, min: 10.1 },
      '6': { avg: 10.5, max: 10.5, min: 10.4 },
      '7': { avg: 10.4, max: 10.5, min: 10.3 },
      '8': { avg: 10.7, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 27.02 },
      '2': { avg: 42.11 },
      '3': { avg: 50.3 },
      '4': { avg: 51.1 },
      '5': { avg: 53.23 },
      '6': { avg: 54.79 },
      '7': { avg: 53.95 },
      '8': { avg: 53.31 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6853 },
    panelSolar: { last: 9707 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-28T21:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 17.5, max: 18, min: 17.1 },
      '2': { avg: 14.4, max: 14.6, min: 14.4 },
      '3': { avg: 12.8, max: 13, min: 12.7 },
      '4': { avg: 9.8, max: 9.9, min: 9.7 },
      '5': { avg: 10.1, max: 10.2, min: 10 },
      '6': { avg: 10.5, max: 10.5, min: 10.4 },
      '7': { avg: 10.4, max: 10.5, min: 10.4 },
      '8': { avg: 10.7, max: 10.8, min: 10.7 },
      '9': { avg: 11, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.99 },
      '2': { avg: 42.14 },
      '3': { avg: 50.31 },
      '4': { avg: 51.12 },
      '5': { avg: 53.24 },
      '6': { avg: 54.78 },
      '7': { avg: 53.95 },
      '8': { avg: 53.31 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6599 },
    panelSolar: { last: 5117 },
  },
  // 1- 22 - Inicio noche
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-28T22:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 16.4, max: 17, min: 15.9 },
      '2': { avg: 14.6, max: 14.7, min: 14.5 },
      '3': { avg: 13.1, max: 13.2, min: 12.9 },
      '4': { avg: 9.9, max: 10, min: 9.8 },
      '5': { avg: 10.1, max: 10.2, min: 10 },
      '6': { avg: 10.5, max: 10.5, min: 10.4 },
      '7': { avg: 10.4, max: 10.6, min: 10.4 },
      '8': { avg: 10.7, max: 10.8, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 10.9 },
    },
    humedadSuelo: {
      '1': { avg: 26.93 },
      '2': { avg: 42.15 },
      '3': { avg: 50.33 },
      '4': { avg: 51.11 },
      '5': { avg: 53.24 },
      '6': { avg: 54.77 },
      '7': { avg: 53.95 },
      '8': { avg: 53.31 },
      '9': { avg: 51.24 },
    },
    bateria: { last: 6542 },
    panelSolar: { last: 0 },
  },
  // 2 - 23
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-28T23:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 15.3, max: 15.8, min: 14.8 },
      '2': { avg: 14.6, max: 14.7, min: 14.5 },
      '3': { avg: 13.2, max: 13.4, min: 13.1 },
      '4': { avg: 9.9, max: 10, min: 9.9 },
      '5': { avg: 10.1, max: 10.2, min: 10 },
      '6': { avg: 10.5, max: 10.5, min: 10.5 },
      '7': { avg: 10.4, max: 10.5, min: 10.3 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.83 },
      '2': { avg: 42.16 },
      '3': { avg: 50.35 },
      '4': { avg: 51.13 },
      '5': { avg: 53.24 },
      '6': { avg: 54.78 },
      '7': { avg: 53.95 },
      '8': { avg: 53.3 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6519 },
    panelSolar: { last: 0 },
  },
  // 3 - 00
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T00:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 14.5, max: 14.8, min: 14.3 },
      '2': { avg: 14.4, max: 14.5, min: 14.3 },
      '3': { avg: 13.4, max: 13.5, min: 13.3 },
      '4': { avg: 10.1, max: 10.2, min: 9.9 },
      '5': { avg: 10.1, max: 10.3, min: 10.1 },
      '6': { avg: 10.5, max: 10.5, min: 10.5 },
      '7': { avg: 10.4, max: 10.5, min: 10.4 },
      '8': { avg: 10.7, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.76 },
      '2': { avg: 42.17 },
      '3': { avg: 50.37 },
      '4': { avg: 51.12 },
      '5': { avg: 53.25 },
      '6': { avg: 54.77 },
      '7': { avg: 53.94 },
      '8': { avg: 53.31 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6488 },
    panelSolar: { last: 0 },
  },
  // 4 - 01
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T01:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 13.8, max: 14.2, min: 13.6 },
      '2': { avg: 14.2, max: 14.4, min: 14.1 },
      '3': { avg: 13.3, max: 13.5, min: 13.2 },
      '4': { avg: 10.1, max: 10.2, min: 10.1 },
      '5': { avg: 10.2, max: 10.3, min: 10.1 },
      '6': { avg: 10.5, max: 10.5, min: 10.5 },
      '7': { avg: 10.4, max: 10.5, min: 10.4 },
      '8': { avg: 10.7, max: 10.8, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.64 },
      '2': { avg: 42.15 },
      '3': { avg: 50.41 },
      '4': { avg: 51.14 },
      '5': { avg: 53.22 },
      '6': { avg: 54.77 },
      '7': { avg: 53.94 },
      '8': { avg: 53.3 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6484 },
    panelSolar: { last: 0 },
  },
  // 5 - 02
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T02:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 13.2, max: 13.6, min: 12.9 },
      '2': { avg: 14, max: 14.1, min: 13.9 },
      '3': { avg: 13.4, max: 13.6, min: 13.4 },
      '4': { avg: 10.2, max: 10.3, min: 10.1 },
      '5': { avg: 10.2, max: 10.4, min: 10.2 },
      '6': { avg: 10.5, max: 10.5, min: 10.5 },
      '7': { avg: 10.4, max: 10.5, min: 10.4 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.54 },
      '2': { avg: 42.13 },
      '3': { avg: 50.4 },
      '4': { avg: 51.15 },
      '5': { avg: 53.21 },
      '6': { avg: 54.77 },
      '7': { avg: 53.95 },
      '8': { avg: 53.31 },
      '9': { avg: 51.24 },
    },
    bateria: { last: 6470 },
    panelSolar: { last: 0 },
  },
  // 6 - 03
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T03:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 12.7, max: 12.9, min: 12.5 },
      '2': { avg: 13.7, max: 13.9, min: 13.6 },
      '3': { avg: 13.5, max: 13.6, min: 13.4 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.3, max: 10.3, min: 10.3 },
      '6': { avg: 10.5, max: 10.6, min: 10.5 },
      '7': { avg: 10.4, max: 10.5, min: 10.4 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.47 },
      '2': { avg: 42.1 },
      '3': { avg: 50.39 },
      '4': { avg: 51.14 },
      '5': { avg: 53.22 },
      '6': { avg: 54.78 },
      '7': { avg: 53.95 },
      '8': { avg: 53.3 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6461 },
    panelSolar: { last: 0 },
  },
  // 7 - 04
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T04:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 12.1, max: 12.4, min: 11.9 },
      '2': { avg: 13.5, max: 13.7, min: 13.4 },
      '3': { avg: 13.4, max: 13.5, min: 13.3 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.3, max: 10.3, min: 10.3 },
      '6': { avg: 10.5, max: 10.5, min: 10.5 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.39 },
      '2': { avg: 42.07 },
      '3': { avg: 50.42 },
      '4': { avg: 51.17 },
      '5': { avg: 53.24 },
      '6': { avg: 54.78 },
      '7': { avg: 53.95 },
      '8': { avg: 53.3 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6453 },
    panelSolar: { last: 0 },
  },
  // 8 - 05
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T05:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.6, max: 11.9, min: 11.3 },
      '2': { avg: 13.2, max: 13.4, min: 13.1 },
      '3': { avg: 13.3, max: 13.5, min: 13.3 },
      '4': { avg: 10.4, max: 10.4, min: 10.3 },
      '5': { avg: 10.3, max: 10.5, min: 10.3 },
      '6': { avg: 10.5, max: 10.6, min: 10.5 },
      '7': { avg: 10.5, max: 10.6, min: 10.4 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.32 },
      '2': { avg: 42.05 },
      '3': { avg: 50.43 },
      '4': { avg: 51.18 },
      '5': { avg: 53.23 },
      '6': { avg: 54.79 },
      '7': { avg: 53.95 },
      '8': { avg: 53.3 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6448 },
    panelSolar: { last: 0 },
  },
  // 9 - 06
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T06:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.2, max: 11.3, min: 11.1 },
      '2': { avg: 13, max: 13.1, min: 12.9 },
      '3': { avg: 13.3, max: 13.4, min: 13.3 },
      '4': { avg: 10.4, max: 10.5, min: 10.3 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.5, max: 10.6, min: 10.5 },
      '7': { avg: 10.5, max: 10.5, min: 10.4 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.25 },
      '2': { avg: 42.02 },
      '3': { avg: 50.4 },
      '4': { avg: 51.18 },
      '5': { avg: 53.22 },
      '6': { avg: 54.79 },
      '7': { avg: 53.94 },
      '8': { avg: 53.32 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6446 },
    panelSolar: { last: 0 },
  },
  // 10 - 07
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T07:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 10.9, max: 11, min: 10.7 },
      '2': { avg: 12.7, max: 12.9, min: 12.6 },
      '3': { avg: 13.3, max: 13.4, min: 13.2 },
      '4': { avg: 10.4, max: 10.5, min: 10.4 },
      '5': { avg: 10.5, max: 10.6, min: 10.4 },
      '6': { avg: 10.6, max: 10.6, min: 10.6 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11, max: 11.1, min: 10.9 },
    },
    humedadSuelo: {
      '1': { avg: 26.19 },
      '2': { avg: 42 },
      '3': { avg: 50.4 },
      '4': { avg: 51.18 },
      '5': { avg: 53.21 },
      '6': { avg: 54.79 },
      '7': { avg: 53.95 },
      '8': { avg: 53.31 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6439 },
    panelSolar: { last: 0 },
  },
  // 11 - 08
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T08:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 10.5, max: 10.7, min: 10.4 },
      '2': { avg: 12.5, max: 12.5, min: 12.3 },
      '3': { avg: 13.1, max: 13.3, min: 13.1 },
      '4': { avg: 10.4, max: 10.5, min: 10.4 },
      '5': { avg: 10.5, max: 10.6, min: 10.5 },
      '6': { avg: 10.6, max: 10.7, min: 10.6 },
      '7': { avg: 10.5, max: 10.5, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.13 },
      '2': { avg: 41.98 },
      '3': { avg: 50.4 },
      '4': { avg: 51.17 },
      '5': { avg: 53.21 },
      '6': { avg: 54.78 },
      '7': { avg: 53.94 },
      '8': { avg: 53.31 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6439 },
    panelSolar: { last: 0 },
  },
  // 12 - 09
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T09:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 10.3, max: 10.4, min: 10.2 },
      '2': { avg: 12.2, max: 12.3, min: 12.1 },
      '3': { avg: 13.2, max: 13.3, min: 13 },
      '4': { avg: 10.5, max: 10.5, min: 10.4 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.6, max: 10.7, min: 10.6 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.08 },
      '2': { avg: 41.97 },
      '3': { avg: 50.39 },
      '4': { avg: 51.17 },
      '5': { avg: 53.23 },
      '6': { avg: 54.77 },
      '7': { avg: 53.93 },
      '8': { avg: 53.31 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6435 },
    panelSolar: { last: 0 },
  },
  // 13 - 10 - Fin noche
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T10:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 10, max: 10.2, min: 9.8 },
      '2': { avg: 12, max: 12.1, min: 11.9 },
      '3': { avg: 13, max: 13.1, min: 12.9 },
      '4': { avg: 10.4, max: 10.5, min: 10.3 },
      '5': { avg: 10.5, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.6 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.01 },
      '2': { avg: 41.94 },
      '3': { avg: 50.4 },
      '4': { avg: 51.19 },
      '5': { avg: 53.24 },
      '6': { avg: 54.77 },
      '7': { avg: 53.94 },
      '8': { avg: 53.31 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6453 },
    panelSolar: { last: 6740 },
  },
  // 14 - 11 - Inicio día
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T11:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 9.9, max: 10.1, min: 9.8 },
      '2': { avg: 11.8, max: 11.9, min: 11.7 },
      '3': { avg: 12.9, max: 13, min: 12.8 },
      '4': { avg: 10.4, max: 10.4, min: 10.3 },
      '5': { avg: 10.5, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.7 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 25.98 },
      '2': { avg: 41.92 },
      '3': { avg: 50.37 },
      '4': { avg: 51.19 },
      '5': { avg: 53.24 },
      '6': { avg: 54.76 },
      '7': { avg: 53.94 },
      '8': { avg: 53.31 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6648 },
    panelSolar: { last: 6972 },
  },
  // 15 - 12
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T12:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 10.2, max: 10.6, min: 10 },
      '2': { avg: 11.5, max: 11.6, min: 11.5 },
      '3': { avg: 12.8, max: 12.9, min: 12.7 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.5, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.7 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 25.95 },
      '2': { avg: 41.94 },
      '3': { avg: 50.36 },
      '4': { avg: 51.19 },
      '5': { avg: 53.26 },
      '6': { avg: 54.76 },
      '7': { avg: 53.96 },
      '8': { avg: 53.31 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6847 },
    panelSolar: { last: 9864 },
  },
  // 16 - 13
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T13:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 11.1, max: 11.7, min: 10.6 },
      '2': { avg: 11.5, max: 11.5, min: 11.5 },
      '3': { avg: 12.7, max: 12.8, min: 12.6 },
      '4': { avg: 10.3, max: 10.3, min: 10.3 },
      '5': { avg: 10.4, max: 10.6, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.7 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26 },
      '2': { avg: 41.91 },
      '3': { avg: 50.35 },
      '4': { avg: 51.18 },
      '5': { avg: 53.26 },
      '6': { avg: 54.77 },
      '7': { avg: 53.94 },
      '8': { avg: 53.32 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6853 },
    panelSolar: { last: 9896 },
  },
  // 17 - 16
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T16:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 16.5, max: 16.9, min: 16 },
      '2': { avg: 12.1, max: 12.2, min: 12 },
      '3': { avg: 12.6, max: 12.7, min: 12.5 },
      '4': { avg: 10.2, max: 10.3, min: 10.1 },
      '5': { avg: 10.5, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.7 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.1, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.37 },
      '2': { avg: 41.92 },
      '3': { avg: 50.31 },
      '4': { avg: 51.18 },
      '5': { avg: 53.27 },
      '6': { avg: 54.77 },
      '7': { avg: 53.96 },
      '8': { avg: 53.34 },
      '9': { avg: 51.24 },
    },
    bateria: { last: 6867 },
    panelSolar: { last: 10124 },
  },
  // 18 - 17
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T17:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 18.1, max: 18.7, min: 17.6 },
      '2': { avg: 12.9, max: 13.1, min: 12.6 },
      '3': { avg: 12.6, max: 12.6, min: 12.5 },
      '4': { avg: 10.1, max: 10.1, min: 10.1 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.7 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.57 },
      '2': { avg: 41.97 },
      '3': { avg: 50.31 },
      '4': { avg: 51.18 },
      '5': { avg: 53.26 },
      '6': { avg: 54.78 },
      '7': { avg: 53.95 },
      '8': { avg: 53.33 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6867 },
    panelSolar: { last: 10128 },
  },
  // 19 - 18
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T18:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 19, max: 19.3, min: 18.7 },
      '2': { avg: 13.4, max: 13.7, min: 13.2 },
      '3': { avg: 12.7, max: 12.8, min: 12.5 },
      '4': { avg: 10.1, max: 10.2, min: 10.1 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.7 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.72 },
      '2': { avg: 42.02 },
      '3': { avg: 50.33 },
      '4': { avg: 51.17 },
      '5': { avg: 53.25 },
      '6': { avg: 54.78 },
      '7': { avg: 53.98 },
      '8': { avg: 53.32 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6867 },
    panelSolar: { last: 10104 },
  },
  // 20 - 19
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T19:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 19.4, max: 19.5, min: 19.3 },
      '2': { avg: 14.1, max: 14.3, min: 13.9 },
      '3': { avg: 12.8, max: 13, min: 12.7 },
      '4': { avg: 10.1, max: 10.2, min: 10.1 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.8, min: 10.7 },
      '7': { avg: 10.5, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.8 },
      '2': { avg: 42.07 },
      '3': { avg: 50.33 },
      '4': { avg: 51.16 },
      '5': { avg: 53.25 },
      '6': { avg: 54.78 },
      '7': { avg: 53.97 },
      '8': { avg: 53.32 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6864 },
    panelSolar: { last: 10045 },
  },
  // 21 - 20
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T20:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 19, max: 19.3, min: 18.5 },
      '2': { avg: 14.6, max: 14.8, min: 14.4 },
      '3': { avg: 13, max: 13.2, min: 12.9 },
      '4': { avg: 10.1, max: 10.2, min: 10.1 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.7, min: 10.7 },
      '7': { avg: 10.6, max: 10.6, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.81 },
      '2': { avg: 42.11 },
      '3': { avg: 50.33 },
      '4': { avg: 51.17 },
      '5': { avg: 53.26 },
      '6': { avg: 54.78 },
      '7': { avg: 53.96 },
      '8': { avg: 53.34 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6862 },
    panelSolar: { last: 9959 },
  },
  // 22 - 21 - Fin día
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T21:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 18, max: 18.6, min: 17.6 },
      '2': { avg: 14.9, max: 15, min: 14.8 },
      '3': { avg: 13.3, max: 13.4, min: 13.2 },
      '4': { avg: 10.2, max: 10.2, min: 10.1 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.8, min: 10.7 },
      '7': { avg: 10.6, max: 10.7, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.3, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 26.78 },
      '2': { avg: 42.16 },
      '3': { avg: 50.35 },
      '4': { avg: 51.18 },
      '5': { avg: 53.24 },
      '6': { avg: 54.78 },
      '7': { avg: 53.96 },
      '8': { avg: 53.34 },
      '9': { avg: 51.23 },
    },
    bateria: { last: 6588 },
    panelSolar: { last: 3064 },
  },
  //
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T22:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 16.9, max: 17.4, min: 16.4 },
      '2': { avg: 15, max: 15.1, min: 15 },
      '3': { avg: 13.5, max: 13.6, min: 13.3 },
      '4': { avg: 10.3, max: 10.3, min: 10.2 },
      '5': { avg: 10.4, max: 10.6, min: 10.4 },
      '6': { avg: 10.7, max: 10.8, min: 10.7 },
      '7': { avg: 10.6, max: 10.7, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.68 },
      '2': { avg: 42.18 },
      '3': { avg: 50.38 },
      '4': { avg: 51.16 },
      '5': { avg: 53.24 },
      '6': { avg: 54.79 },
      '7': { avg: 53.98 },
      '8': { avg: 53.34 },
      '9': { avg: 51.22 },
    },
    bateria: { last: 6542 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-29T23:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 15.8, max: 16.3, min: 15.4 },
      '2': { avg: 15, max: 15, min: 15 },
      '3': { avg: 13.6, max: 13.7, min: 13.5 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.8, min: 10.7 },
      '7': { avg: 10.6, max: 10.6, min: 10.6 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11, max: 11.2, min: 11 },
    },
    humedadSuelo: {
      '1': { avg: 26.59 },
      '2': { avg: 42.19 },
      '3': { avg: 50.41 },
      '4': { avg: 51.18 },
      '5': { avg: 53.26 },
      '6': { avg: 54.79 },
      '7': { avg: 53.96 },
      '8': { avg: 53.35 },
      '9': { avg: 51.24 },
    },
    bateria: { last: 6524 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-30T00:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 15, max: 15.4, min: 14.6 },
      '2': { avg: 14.8, max: 15, min: 14.7 },
      '3': { avg: 13.8, max: 13.9, min: 13.7 },
      '4': { avg: 10.4, max: 10.5, min: 10.3 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.8, min: 10.7 },
      '7': { avg: 10.6, max: 10.7, min: 10.5 },
      '8': { avg: 10.8, max: 10.9, min: 10.7 },
      '9': { avg: 11.1, max: 11.3, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 26.5 },
      '2': { avg: 42.17 },
      '3': { avg: 50.41 },
      '4': { avg: 51.17 },
      '5': { avg: 53.27 },
      '6': { avg: 54.79 },
      '7': { avg: 53.96 },
      '8': { avg: 53.36 },
      '9': { avg: 51.21 },
    },
    bateria: { last: 6486 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-30T01:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 14.2, max: 14.7, min: 13.9 },
      '2': { avg: 14.6, max: 14.8, min: 14.6 },
      '3': { avg: 13.8, max: 13.9, min: 13.7 },
      '4': { avg: 10.5, max: 10.6, min: 10.5 },
      '5': { avg: 10.4, max: 10.5, min: 10.4 },
      '6': { avg: 10.7, max: 10.8, min: 10.7 },
      '7': { avg: 10.6, max: 10.7, min: 10.6 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.2, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 26.4 },
      '2': { avg: 42.15 },
      '3': { avg: 50.45 },
      '4': { avg: 51.18 },
      '5': { avg: 53.28 },
      '6': { avg: 54.79 },
      '7': { avg: 53.96 },
      '8': { avg: 53.34 },
      '9': { avg: 51.21 },
    },
    bateria: { last: 6481 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-30T02:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 13.6, max: 13.9, min: 13.3 },
      '2': { avg: 14.4, max: 14.5, min: 14.4 },
      '3': { avg: 13.9, max: 14, min: 13.8 },
      '4': { avg: 10.5, max: 10.6, min: 10.5 },
      '5': { avg: 10.5, max: 10.6, min: 10.4 },
      '6': { avg: 10.7, max: 10.8, min: 10.7 },
      '7': { avg: 10.6, max: 10.7, min: 10.6 },
      '8': { avg: 10.8, max: 10.9, min: 10.8 },
      '9': { avg: 11.1, max: 11.3, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 26.28 },
      '2': { avg: 42.13 },
      '3': { avg: 50.44 },
      '4': { avg: 51.22 },
      '5': { avg: 53.28 },
      '6': { avg: 54.79 },
      '7': { avg: 53.95 },
      '8': { avg: 53.36 },
      '9': { avg: 51.21 },
    },
    bateria: { last: 6466 },
    panelSolar: { last: 0 },
  },
];

const pluviometro = [
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T07:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 6.17, max: 6.58, min: 5.47 },
    lluvia: { sum: 0 },
    humedad: { avg: 90.7, max: 95.5, min: 89.1 },
    velocidadViento: { avg: 3.5, max: 5.8 },
    direccionViento: { last: 145 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6470 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 8.3 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T08:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 5.96, max: 6.21, min: 5.74 },
    lluvia: { sum: 0 },
    humedad: { avg: 92.2, max: 93.4, min: 90.6 },
    velocidadViento: { avg: 2.3, max: 5 },
    direccionViento: { last: 97 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6461 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 7.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T09:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 5.39, max: 5.89, min: 4.7 },
    lluvia: { sum: 0 },
    humedad: { avg: 93.8, max: 96.6, min: 92.6 },
    velocidadViento: { avg: 2.5, max: 3.6 },
    direccionViento: { last: 128 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6450 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 5.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T10:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 4.24, max: 5.24, min: 3.66 },
    lluvia: { sum: 0 },
    humedad: { avg: 95.4, max: 97.1, min: 93 },
    velocidadViento: { avg: 2.6, max: 3.6 },
    direccionViento: { last: 151 },
    radiacionSolar: { avg: 10 },
    bateria: { last: 6470 },
    et0: { result: null },
    panelSolar: { last: 6720 },
    rafagaViento: { max: 5 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T11:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 6.03, max: 7.4, min: 4.79 },
    lluvia: { sum: 0 },
    humedad: { avg: 95.3, max: 96.9, min: 93.7 },
    velocidadViento: { avg: 1.4, max: 2.5 },
    direccionViento: { last: 115 },
    radiacionSolar: { avg: 97 },
    bateria: { last: 6755 },
    et0: { result: null },
    panelSolar: { last: 7036 },
    rafagaViento: { max: 4.7 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T12:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 9.06, max: 10.28, min: 7.69 },
    lluvia: { sum: 0 },
    humedad: { avg: 90.8, max: 93.7, min: 87.4 },
    velocidadViento: { avg: 3, max: 4.7 },
    direccionViento: { last: 123 },
    radiacionSolar: { avg: 258 },
    bateria: { last: 6896 },
    et0: { result: null },
    panelSolar: { last: 9923 },
    rafagaViento: { max: 8.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T13:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.75, max: 13.2, min: 10.32 },
    lluvia: { sum: 0 },
    humedad: { avg: 84.5, max: 88, min: 82 },
    velocidadViento: { avg: 4.4, max: 5.8 },
    direccionViento: { last: 136 },
    radiacionSolar: { avg: 561 },
    bateria: { last: 6904 },
    et0: { result: null },
    panelSolar: { last: 10022 },
    rafagaViento: { max: 10.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T16:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 20.35, max: 20.65, min: 19.95 },
    lluvia: { sum: 0 },
    humedad: { avg: 49.1, max: 51.4, min: 47.1 },
    velocidadViento: { avg: 13.3, max: 16.6 },
    direccionViento: { last: 165 },
    radiacionSolar: { avg: 1425 },
    bateria: { last: 6922 },
    et0: { result: null },
    panelSolar: { last: 10313 },
    rafagaViento: { max: 25.2 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T17:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 21.11, max: 21.77, min: 20.22 },
    lluvia: { sum: 0 },
    humedad: { avg: 42.8, max: 47.4, min: 39.8 },
    velocidadViento: { avg: 10.5, max: 15.1 },
    direccionViento: { last: 151 },
    radiacionSolar: { avg: 1396 },
    bateria: { last: 6922 },
    et0: { result: null },
    panelSolar: { last: 10286 },
    rafagaViento: { max: 25.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T18:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 21.37, max: 21.59, min: 20.98 },
    lluvia: { sum: 0 },
    humedad: { avg: 40.6, max: 41.8, min: 38.7 },
    velocidadViento: { avg: 11.2, max: 15.1 },
    direccionViento: { last: 149 },
    radiacionSolar: { avg: 1186 },
    bateria: { last: 6918 },
    et0: { result: null },
    panelSolar: { last: 10254 },
    rafagaViento: { max: 26.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T19:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 21.51, max: 21.86, min: 21.17 },
    lluvia: { sum: 0 },
    humedad: { avg: 38.5, max: 39.4, min: 38 },
    velocidadViento: { avg: 10.4, max: 14.8 },
    direccionViento: { last: 156 },
    radiacionSolar: { avg: 902 },
    bateria: { last: 6907 },
    et0: { result: null },
    panelSolar: { last: 10160 },
    rafagaViento: { max: 27 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T20:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 20.59, max: 21.01, min: 19.93 },
    lluvia: { sum: 0 },
    humedad: { avg: 35.1, max: 38.6, min: 33.7 },
    velocidadViento: { avg: 14.9, max: 16.9 },
    direccionViento: { last: 135 },
    radiacionSolar: { avg: 553 },
    bateria: { last: 6904 },
    et0: { result: null },
    panelSolar: { last: 9998 },
    rafagaViento: { max: 32.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T21:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 18.24, max: 19.77, min: 16.28 },
    lluvia: { sum: 0 },
    humedad: { avg: 41.2, max: 47.9, min: 35.4 },
    velocidadViento: { avg: 11.3, max: 15.8 },
    direccionViento: { last: 135 },
    radiacionSolar: { avg: 142 },
    bateria: { last: 6791 },
    et0: { result: null },
    panelSolar: { last: 4892 },
    rafagaViento: { max: 23.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T22:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 14.89, max: 16.09, min: 13.85 },
    lluvia: { sum: 0 },
    humedad: { avg: 53.2, max: 56.9, min: 48.7 },
    velocidadViento: { avg: 6, max: 8.6 },
    direccionViento: { last: 125 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6711 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 14.4 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-29T23:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 13.35, max: 13.86, min: 12.43 },
    lluvia: { sum: 0 },
    humedad: { avg: 60.1, max: 64.3, min: 57 },
    velocidadViento: { avg: 7.5, max: 11.5 },
    direccionViento: { last: 120 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6646 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 16.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 10.27, max: 11.63, min: 9.46 },
    lluvia: { sum: 0 },
    humedad: { avg: 72.7, max: 76.1, min: 66.9 },
    velocidadViento: { avg: 4.2, max: 7.2 },
    direccionViento: { last: 110 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6533 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 11.5 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T01:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.03, max: 9.93, min: 8.18 },
    lluvia: { sum: 0 },
    humedad: { avg: 80.4, max: 86.5, min: 75.3 },
    velocidadViento: { avg: 3.9, max: 6.1 },
    direccionViento: { last: 97 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6513 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 10.1 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T02:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 8.83, max: 9.07, min: 8.2 },
    lluvia: { sum: 0 },
    humedad: { avg: 86.7, max: 88.4, min: 84.3 },
    velocidadViento: { avg: 2.8, max: 4 },
    direccionViento: { last: 103 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6502 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 6.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T03:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 6.44, max: 7.69, min: 5.83 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.2, max: 96.5, min: 88.8 },
    velocidadViento: { avg: 2.5, max: 4 },
    direccionViento: { last: 130 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6495 },
    et0: { result: 3.4 },
    panelSolar: { last: 0 },
    rafagaViento: { max: 6.1 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T04:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 8.95, max: 10.39, min: 7.08 },
    lluvia: { sum: 0 },
    humedad: { avg: 97.6, max: 99.9, min: 96.1 },
    velocidadViento: { avg: 7, max: 11.2 },
    direccionViento: { last: 135 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6493 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 16.9 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T05:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 10.61, max: 10.97, min: 10.43 },
    lluvia: { sum: 0 },
    humedad: { avg: 95.8, max: 96.1, min: 95.5 },
    velocidadViento: { avg: 6.9, max: 10.4 },
    direccionViento: { last: 108 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6493 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 17.3 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T06:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 11.38, max: 11.61, min: 11.07 },
    lluvia: { sum: 0 },
    humedad: { avg: 95.5, max: 96, min: 95 },
    velocidadViento: { avg: 6, max: 8.3 },
    direccionViento: { last: 119 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6488 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 13.7 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T07:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 11.56, max: 11.77, min: 11.41 },
    lluvia: { sum: 0 },
    humedad: { avg: 95.4, max: 95.5, min: 95.3 },
    velocidadViento: { avg: 8.2, max: 10.1 },
    direccionViento: { last: 131 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6484 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 16.9 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T08:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 12.1, max: 12.26, min: 11.84 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.8, max: 95.3, min: 94.7 },
    velocidadViento: { avg: 10.4, max: 11.9 },
    direccionViento: { last: 134 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6481 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 22 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T09:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 11.99, max: 12.28, min: 11.77 },
    lluvia: { sum: 0 },
    humedad: { avg: 93.8, max: 94.4, min: 93.4 },
    velocidadViento: { avg: 9.5, max: 11.9 },
    direccionViento: { last: 131 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6468 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 20.9 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T10:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 11.37, max: 11.85, min: 10.93 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.2, max: 94.4, min: 93.7 },
    velocidadViento: { avg: 8, max: 11.2 },
    direccionViento: { last: 126 },
    radiacionSolar: { avg: 4 },
    bateria: { last: 6470 },
    et0: { result: null },
    panelSolar: { last: 6677 },
    rafagaViento: { max: 19.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T11:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.16, max: 11.24, min: 11 },
    lluvia: { sum: 0 },
    humedad: { avg: 93.2, max: 94.1, min: 92.8 },
    velocidadViento: { avg: 8, max: 10.4 },
    direccionViento: { last: 136 },
    radiacionSolar: { avg: 37 },
    bateria: { last: 6519 },
    et0: { result: null },
    panelSolar: { last: 6728 },
    rafagaViento: { max: 20.2 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-30T12:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.28, max: 11.39, min: 11.12 },
    lluvia: { sum: 0.2 },
    humedad: { avg: 92.7, max: 94.6, min: 91.9 },
    velocidadViento: { avg: 10.2, max: 12.2 },
    direccionViento: { last: 136 },
    radiacionSolar: { avg: 46 },
    bateria: { last: 6588 },
    et0: { result: null },
    panelSolar: { last: 6831 },
    rafagaViento: { max: 24.1 },
  },
];

const pronostico = [
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-03T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { max: 19.6, min: 9.6, avg: 14.7 },
    lluvia: 0,
    humedad: { max: 94, min: 35, avg: 58 },
    velocidadViento: { avg: 8.9, min: 3.4, max: 16.2 },
    direccionViento: 225,
    probabilidadLluvia: 0,
    radiacionSolar: 36,
    et0: 2.2,
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-04T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { max: 18, min: 7.2, avg: 12.1 },
    lluvia: 0,
    humedad: { max: 66, min: 38, avg: 53 },
    velocidadViento: { avg: 4.2, min: 2.1, max: 7.3 },
    direccionViento: 225,
    probabilidadLluvia: 0,
    radiacionSolar: 33,
    et0: 1.6,
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-05T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { max: 18.5, min: 2.8, avg: 10.5 },
    lluvia: 0,
    humedad: { max: 76, min: 36, avg: 58 },
    velocidadViento: { avg: 8, min: 3.6, max: 12.9 },
    direccionViento: 0,
    probabilidadLluvia: 0,
    radiacionSolar: 55,
    et0: 1.9,
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-06T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { max: 22.8, min: 5.6, avg: 14.1 },
    lluvia: 0,
    humedad: { max: 89, min: 40, avg: 63 },
    velocidadViento: { avg: 9.6, min: 2.8, max: 15.8 },
    direccionViento: 0,
    probabilidadLluvia: 0,
    radiacionSolar: 37,
    et0: 2.1,
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-07T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { max: 23.9, min: 7.9, avg: 15.3 },
    lluvia: 0,
    humedad: { max: 87, min: 36, avg: 63 },
    velocidadViento: { avg: 6, min: 3.2, max: 9 },
    direccionViento: 135,
    probabilidadLluvia: 0,
    radiacionSolar: 37,
    et0: 1.8,
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-08T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { max: 23.6, min: 8.1, avg: 15.5 },
    lluvia: 0,
    humedad: { max: 86, min: 41, avg: 66 },
    velocidadViento: { avg: 9.6, min: 6, max: 13.6 },
    direccionViento: 90,
    probabilidadLluvia: 3,
    radiacionSolar: 38,
    et0: 2,
  },
  {
    fuente: 'FieldClimate',
    distancia: 667,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-09T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { max: 24.6, min: 9.9, avg: 16.3 },
    lluvia: 0,
    humedad: { max: 100, min: 53, avg: 82 },
    velocidadViento: { avg: 8.2, min: 6.2, max: 10.9 },
    direccionViento: 90,
    probabilidadLluvia: 2,
    radiacionSolar: 60,
    et0: 1.5,
  },
];

// Resultados Ejemplo

const niveles = [
  {
    nivel: 2,
    capacidadCampo: null,
    humedadMaxima: 44.08,
    precipitaciones: 0,
    humedadInicioDia: 44.04,
    humedadInicioNoche: 44.06,
    humedadFinDia: 44.05,
    humedadFinNoche: 43.97,
    deltaDiario: -0.07000000000000028,
    condicion: 'Aceptado',
    deltaDia: 0.00999999999999801,
    pendienteDia: 0.000999999999999801,
    deltaNoche: -0.09000000000000341,
    pendienteNoche: -0.007500000000000284,
    relacionDiaNoche: -0.13333333333330175,
    hayRaices: false,
  },
];

const sueloActualizado = [
  {
    profundidad: 10,
    textura: 'Arenoso',
    hayRaices: true,
    capacidadDeCampo: 15.05,
    puntoMarchitez: 0,
    numeroDeSensor: 1,
  },
  {
    profundidad: 20,
    textura: 'Arenoso',
    hayRaices: false,
    capacidadDeCampo: 18.61,
    puntoMarchitez: 0,
    numeroDeSensor: 2,
  },
  {
    profundidad: 30,
    textura: 'Franco arenoso',
    hayRaices: null,
    capacidadDeCampo: 24.01,
    puntoMarchitez: 0,
    numeroDeSensor: 3,
  },
  {
    profundidad: 40,
    textura: 'Franco arenoso',
    hayRaices: null,
    capacidadDeCampo: 26.19,
    puntoMarchitez: 0,
    numeroDeSensor: 4,
  },
  {
    profundidad: 50,
    textura: 'Franco arenoso',
    hayRaices: null,
    capacidadDeCampo: 28.46,
    puntoMarchitez: 0,
    numeroDeSensor: 5,
  },
  {
    profundidad: 60,
    textura: 'Franco arenoso',
    hayRaices: null,
    capacidadDeCampo: 28.22,
    puntoMarchitez: 0,
    numeroDeSensor: 6,
  },
  {
    profundidad: 70,
    textura: 'Franco arenoso',
    hayRaices: null,
    capacidadDeCampo: 28.22,
    puntoMarchitez: 0,
    numeroDeSensor: 7,
  },
  {
    profundidad: 80,
    textura: 'Franco arenoso',
    hayRaices: null,
    capacidadDeCampo: 28.22,
    puntoMarchitez: 0,
    numeroDeSensor: 8,
  },
  {
    profundidad: 90,
    textura: 'Franco arenoso',
    hayRaices: null,
    capacidadDeCampo: 28.22,
    puntoMarchitez: 0,
    numeroDeSensor: 9,
  },
];

const pronosticoRiego = [
  {
    fecha: '2024-09-04T00:00:00.000Z',
    afd: 11.654720000000001,
    consumoAgua: 0.785135135135135,
    lluvias: 0,
    saldoDiario: 10.869584864864866,
    ccPorcentual: 0.8207176732758128,
    previsionConsumo3Dias: 2.8511486486486484,
    regar: false,
  },
  {
    fecha: '2024-09-05T00:00:00.000Z',
    afd: 10.869584864864866,
    consumoAgua: 1.0103378378378376,
    lluvias: 0,
    saldoDiario: 9.859247027027028,
    ccPorcentual: 0.7444312161754022,
    previsionConsumo3Dias: 2.9659459459459456,
    regar: false,
  },
  {
    fecha: '2024-09-06T00:00:00.000Z',
    afd: 9.859247027027028,
    consumoAgua: 1.0556756756756758,
    lluvias: 0,
    saldoDiario: 8.803571351351351,
    ccPorcentual: 0.6647214853028806,
    previsionConsumo3Dias: 2.8892567567567564,
    regar: false,
  },
  {
    fecha: '2024-09-07T00:00:00.000Z',
    afd: 8.803571351351351,
    consumoAgua: 0.8999324324324324,
    lluvias: 0,
    saldoDiario: 7.903638918918919,
    ccPorcentual: 0.5967712865387284,
    previsionConsumo3Dias: 2.4568918918918916,
    regar: false,
  },
  {
    fecha: '2024-09-08T00:00:00.000Z',
    afd: 7.903638918918919,
    consumoAgua: 0.9336486486486485,
    lluvias: 0,
    saldoDiario: 6.96999027027027,
    ccPorcentual: 0.5262753148799659,
    previsionConsumo3Dias: 2.252635135135135,
    regar: false,
  },
  {
    fecha: '2024-09-09T00:00:00.000Z',
    afd: 6.96999027027027,
    consumoAgua: 0.6233108108108109,
    lluvias: 0,
    saldoDiario: 6.34667945945946,
    ccPorcentual: 0.47921167770004974,
  },
  {
    fecha: '2024-09-10T00:00:00.000Z',
    afd: 6.34667945945946,
    consumoAgua: 0.6956756756756756,
    lluvias: 0,
    saldoDiario: 5.651003783783784,
    ccPorcentual: 0.4266840670329042,
  },
];

// Calculo capacidad campo
const sonda = [
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-31T23:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 12.6, max: 12.8, min: 12.5 },
      '2': { avg: 13, max: 13.1, min: 12.9 },
      '3': { avg: 13, max: 13.2, min: 13 },
      '4': { avg: 10.4, max: 10.4, min: 10.3 },
      '5': { avg: 10.6, max: 10.7, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.7, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 43.72 },
      '2': { avg: 45.24 },
      '3': { avg: 50.61 },
      '4': { avg: 51.34 },
      '5': { avg: 53.33 },
      '6': { avg: 54.87 },
      '7': { avg: 54.15 },
      '8': { avg: 53.56 },
      '9': { avg: 51.5 },
    },
    bateria: { last: 6577 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T00:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 12.3, max: 12.5, min: 12.1 },
      '2': { avg: 12.9, max: 12.9, min: 12.9 },
      '3': { avg: 13.1, max: 13.3, min: 13 },
      '4': { avg: 10.4, max: 10.5, min: 10.4 },
      '5': { avg: 10.6, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 40.58 },
      '2': { avg: 45.26 },
      '3': { avg: 50.62 },
      '4': { avg: 51.34 },
      '5': { avg: 53.33 },
      '6': { avg: 54.87 },
      '7': { avg: 54.15 },
      '8': { avg: 53.57 },
      '9': { avg: 51.51 },
    },
    bateria: { last: 6542 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T01:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 12, max: 12.1, min: 11.9 },
      '2': { avg: 12.8, max: 12.9, min: 12.8 },
      '3': { avg: 13.1, max: 13.2, min: 13.1 },
      '4': { avg: 10.5, max: 10.5, min: 10.4 },
      '5': { avg: 10.6, max: 10.7, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.7, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 40.18 },
      '2': { avg: 45.25 },
      '3': { avg: 50.61 },
      '4': { avg: 51.32 },
      '5': { avg: 53.34 },
      '6': { avg: 54.88 },
      '7': { avg: 54.15 },
      '8': { avg: 53.58 },
      '9': { avg: 51.49 },
    },
    bateria: { last: 6542 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T02:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.9, max: 11.9, min: 11.8 },
      '2': { avg: 12.7, max: 12.7, min: 12.6 },
      '3': { avg: 13, max: 13.2, min: 12.9 },
      '4': { avg: 10.5, max: 10.5, min: 10.4 },
      '5': { avg: 10.6, max: 10.7, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.9, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 39.91 },
      '2': { avg: 45.26 },
      '3': { avg: 50.63 },
      '4': { avg: 51.32 },
      '5': { avg: 53.35 },
      '6': { avg: 54.87 },
      '7': { avg: 54.14 },
      '8': { avg: 53.57 },
      '9': { avg: 51.49 },
    },
    bateria: { last: 6537 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T03:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.7, max: 11.9, min: 11.7 },
      '2': { avg: 12.5, max: 12.6, min: 12.5 },
      '3': { avg: 13, max: 13.1, min: 12.9 },
      '4': { avg: 10.5, max: 10.5, min: 10.4 },
      '5': { avg: 10.7, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.7, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.4, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 39.71 },
      '2': { avg: 45.27 },
      '3': { avg: 50.64 },
      '4': { avg: 51.32 },
      '5': { avg: 53.32 },
      '6': { avg: 54.88 },
      '7': { avg: 54.15 },
      '8': { avg: 53.58 },
      '9': { avg: 51.5 },
    },
    bateria: { last: 6533 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T04:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.6, max: 11.8, min: 11.5 },
      '2': { avg: 12.4, max: 12.5, min: 12.3 },
      '3': { avg: 12.9, max: 13, min: 12.9 },
      '4': { avg: 10.5, max: 10.5, min: 10.4 },
      '5': { avg: 10.7, max: 10.7, min: 10.7 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.7, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11, min: 11 },
      '9': { avg: 11.3, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 39.55 },
      '2': { avg: 45.26 },
      '3': { avg: 50.65 },
      '4': { avg: 51.33 },
      '5': { avg: 53.34 },
      '6': { avg: 54.87 },
      '7': { avg: 54.14 },
      '8': { avg: 53.58 },
      '9': { avg: 51.5 },
    },
    bateria: { last: 6524 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T05:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.4, max: 11.5, min: 11.3 },
      '2': { avg: 12.3, max: 12.4, min: 12.3 },
      '3': { avg: 12.9, max: 13, min: 12.9 },
      '4': { avg: 10.5, max: 10.5, min: 10.4 },
      '5': { avg: 10.7, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.3, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 39.41 },
      '2': { avg: 45.28 },
      '3': { avg: 50.64 },
      '4': { avg: 51.32 },
      '5': { avg: 53.34 },
      '6': { avg: 54.87 },
      '7': { avg: 54.13 },
      '8': { avg: 53.58 },
      '9': { avg: 51.49 },
    },
    bateria: { last: 6519 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T06:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.3, max: 11.4, min: 11.3 },
      '2': { avg: 12.3, max: 12.3, min: 12.2 },
      '3': { avg: 12.9, max: 13.1, min: 12.9 },
      '4': { avg: 10.4, max: 10.6, min: 10.4 },
      '5': { avg: 10.6, max: 10.7, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.9, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.3, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 39.29 },
      '2': { avg: 45.27 },
      '3': { avg: 50.62 },
      '4': { avg: 51.35 },
      '5': { avg: 53.35 },
      '6': { avg: 54.88 },
      '7': { avg: 54.15 },
      '8': { avg: 53.57 },
      '9': { avg: 51.49 },
    },
    bateria: { last: 6517 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T07:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.2, max: 11.4, min: 11.1 },
      '2': { avg: 12.1, max: 12.1, min: 12.1 },
      '3': { avg: 12.8, max: 13, min: 12.8 },
      '4': { avg: 10.4, max: 10.5, min: 10.4 },
      '5': { avg: 10.7, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.7, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.4, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 39.09 },
      '2': { avg: 45.29 },
      '3': { avg: 50.63 },
      '4': { avg: 51.34 },
      '5': { avg: 53.35 },
      '6': { avg: 54.88 },
      '7': { avg: 54.15 },
      '8': { avg: 53.58 },
      '9': { avg: 51.49 },
    },
    bateria: { last: 6506 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T08:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 11.1, max: 11.2, min: 11 },
      '2': { avg: 12.1, max: 12.1, min: 12 },
      '3': { avg: 12.7, max: 12.8, min: 12.6 },
      '4': { avg: 10.4, max: 10.5, min: 10.3 },
      '5': { avg: 10.6, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 38.82 },
      '2': { avg: 45.26 },
      '3': { avg: 50.65 },
      '4': { avg: 51.35 },
      '5': { avg: 53.35 },
      '6': { avg: 54.87 },
      '7': { avg: 54.13 },
      '8': { avg: 53.57 },
      '9': { avg: 51.5 },
    },
    bateria: { last: 6502 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T09:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 10.8, max: 11, min: 10.7 },
      '2': { avg: 11.9, max: 12, min: 11.9 },
      '3': { avg: 12.7, max: 12.8, min: 12.7 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.7, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 10.9 },
      '9': { avg: 11.3, max: 11.4, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 38.74 },
      '2': { avg: 45.28 },
      '3': { avg: 50.63 },
      '4': { avg: 51.35 },
      '5': { avg: 53.33 },
      '6': { avg: 54.87 },
      '7': { avg: 54.14 },
      '8': { avg: 53.58 },
      '9': { avg: 51.51 },
    },
    bateria: { last: 6493 },
    panelSolar: { last: 0 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T10:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 10.4, max: 10.7, min: 10.2 },
      '2': { avg: 11.8, max: 11.9, min: 11.7 },
      '3': { avg: 12.7, max: 12.8, min: 12.7 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.7, max: 10.8, min: 10.7 },
      '6': { avg: 10.9, max: 11.1, min: 10.9 },
      '7': { avg: 10.7, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 38.67 },
      '2': { avg: 45.25 },
      '3': { avg: 50.6 },
      '4': { avg: 51.35 },
      '5': { avg: 53.33 },
      '6': { avg: 54.88 },
      '7': { avg: 54.13 },
      '8': { avg: 53.58 },
      '9': { avg: 51.52 },
    },
    bateria: { last: 6510 },
    panelSolar: { last: 6799 },
  },
  {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T11:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 10, max: 10.2, min: 10 },
      '2': { avg: 11.7, max: 11.8, min: 11.6 },
      '3': { avg: 12.6, max: 12.8, min: 12.6 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.6, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.9, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.4, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 38.61 },
      '2': { avg: 45.22 },
      '3': { avg: 50.61 },
      '4': { avg: 51.33 },
      '5': { avg: 53.33 },
      '6': { avg: 54.87 },
      '7': { avg: 54.13 },
      '8': { avg: 53.58 },
      '9': { avg: 51.51 },
    },
    bateria: { last: 6706 },
    panelSolar: { last: 7036 },
  },
];

const pluv = [
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T09:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.63, max: 9.66, min: 9.59 },
    lluvia: { sum: 16.8 },
    humedad: { avg: 99.9, max: 99.9, min: 99.9 },
    velocidadViento: { avg: 13.5, max: 15.1 },
    direccionViento: { last: 163 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6453 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 22.3 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T10:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.49, max: 9.58, min: 9.43 },
    lluvia: { sum: 3.2 },
    humedad: { avg: 99.9, max: 99.9, min: 99.9 },
    velocidadViento: { avg: 13.9, max: 16.2 },
    direccionViento: { last: 170 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6459 },
    et0: { result: null },
    panelSolar: { last: 2288 },
    rafagaViento: { max: 23 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T11:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 9.41, max: 9.44, min: 9.39 },
    lluvia: { sum: 1.6 },
    humedad: { avg: 99.9, max: 99.9, min: 99.9 },
    velocidadViento: { avg: 13.9, max: 15.8 },
    direccionViento: { last: 171 },
    radiacionSolar: { avg: 4 },
    bateria: { last: 6461 },
    et0: { result: null },
    panelSolar: { last: 6669 },
    rafagaViento: { max: 20.5 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T12:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 9.71, max: 10.11, min: 9.53 },
    lluvia: { sum: 2.2 },
    humedad: { avg: 99.9, max: 99.9, min: 99.9 },
    velocidadViento: { avg: 15, max: 16.2 },
    direccionViento: { last: 183 },
    radiacionSolar: { avg: 84 },
    bateria: { last: 6731 },
    et0: { result: null },
    panelSolar: { last: 7008 },
    rafagaViento: { max: 20.5 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T13:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 10.43, max: 10.76, min: 10.14 },
    lluvia: { sum: 0 },
    humedad: { avg: 99.2, max: 99.9, min: 97.8 },
    velocidadViento: { avg: 15.2, max: 19.8 },
    direccionViento: { last: 168 },
    radiacionSolar: { avg: 157 },
    bateria: { last: 6871 },
    et0: { result: null },
    panelSolar: { last: 9116 },
    rafagaViento: { max: 30.2 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T14:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 10.91, max: 11.04, min: 10.74 },
    lluvia: { sum: 0 },
    humedad: { avg: 97.3, max: 98.3, min: 96.3 },
    velocidadViento: { avg: 13.8, max: 18 },
    direccionViento: { last: 173 },
    radiacionSolar: { avg: 183 },
    bateria: { last: 6880 },
    et0: { result: null },
    panelSolar: { last: 9360 },
    rafagaViento: { max: 28.4 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T15:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.21, max: 11.5, min: 10.98 },
    lluvia: { sum: 0.6 },
    humedad: { avg: 99.4, max: 99.9, min: 98 },
    velocidadViento: { avg: 11.8, max: 15.1 },
    direccionViento: { last: 210 },
    radiacionSolar: { avg: 341 },
    bateria: { last: 6896 },
    et0: { result: null },
    panelSolar: { last: 9904 },
    rafagaViento: { max: 22 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T16:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.72, max: 11.9, min: 11.43 },
    lluvia: { sum: 0.2 },
    humedad: { avg: 99.6, max: 99.9, min: 98.6 },
    velocidadViento: { avg: 16.8, max: 19.1 },
    direccionViento: { last: 211 },
    radiacionSolar: { avg: 450 },
    bateria: { last: 6896 },
    et0: { result: null },
    panelSolar: { last: 9904 },
    rafagaViento: { max: 27.7 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T17:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.77, max: 12.07, min: 11.59 },
    lluvia: { sum: 0 },
    humedad: { avg: 99.7, max: 99.9, min: 99 },
    velocidadViento: { avg: 19.2, max: 20.9 },
    direccionViento: { last: 215 },
    radiacionSolar: { avg: 415 },
    bateria: { last: 6896 },
    et0: { result: null },
    panelSolar: { last: 9872 },
    rafagaViento: { max: 32 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T18:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.92, max: 12.18, min: 11.57 },
    lluvia: { sum: 0 },
    humedad: { avg: 97.5, max: 99.6, min: 94.8 },
    velocidadViento: { avg: 23.6, max: 28.8 },
    direccionViento: { last: 203 },
    radiacionSolar: { avg: 523 },
    bateria: { last: 6900 },
    et0: { result: null },
    panelSolar: { last: 9927 },
    rafagaViento: { max: 41.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T19:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.58, max: 11.85, min: 11.3 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.9, max: 96.7, min: 93.3 },
    velocidadViento: { avg: 25.9, max: 28.1 },
    direccionViento: { last: 198 },
    radiacionSolar: { avg: 335 },
    bateria: { last: 6896 },
    et0: { result: null },
    panelSolar: { last: 9829 },
    rafagaViento: { max: 42.5 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T20:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 11.16, max: 11.43, min: 10.85 },
    lluvia: { sum: 0 },
    humedad: { avg: 93.3, max: 93.9, min: 92.7 },
    velocidadViento: { avg: 23.8, max: 26.6 },
    direccionViento: { last: 200 },
    radiacionSolar: { avg: 100 },
    bateria: { last: 6882 },
    et0: { result: null },
    panelSolar: { last: 7114 },
    rafagaViento: { max: 36 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T21:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 10.51, max: 10.76, min: 10.1 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.1, max: 95.7, min: 93 },
    velocidadViento: { avg: 23.2, max: 25.2 },
    direccionViento: { last: 196 },
    radiacionSolar: { avg: 21 },
    bateria: { last: 6791 },
    et0: { result: null },
    panelSolar: { last: 2052 },
    rafagaViento: { max: 37.1 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T22:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.94, max: 10.04, min: 9.88 },
    lluvia: { sum: 0 },
    humedad: { avg: 96.1, max: 96.5, min: 95.8 },
    velocidadViento: { avg: 22.6, max: 24.8 },
    direccionViento: { last: 194 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6711 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 40.3 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-08-31T23:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.88, max: 9.91, min: 9.85 },
    lluvia: { sum: 0 },
    humedad: { avg: 96.1, max: 96.3, min: 95.9 },
    velocidadViento: { avg: 22.9, max: 24.1 },
    direccionViento: { last: 190 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6660 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 33.8 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T00:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.93, max: 9.96, min: 9.89 },
    lluvia: { sum: 0 },
    humedad: { avg: 95.1, max: 96, min: 94.5 },
    velocidadViento: { avg: 24.2, max: 26.3 },
    direccionViento: { last: 188 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6577 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 34.9 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T01:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.93, max: 9.95, min: 9.91 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.5, max: 94.9, min: 94.3 },
    velocidadViento: { avg: 23.8, max: 25.6 },
    direccionViento: { last: 190 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6568 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 34.9 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T02:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.95, max: 10, min: 9.89 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.7, max: 95.3, min: 94.2 },
    velocidadViento: { avg: 20.8, max: 22.7 },
    direccionViento: { last: 184 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6550 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 31 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T03:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.9, max: 9.97, min: 9.76 },
    lluvia: { sum: 0 },
    humedad: { avg: 94, max: 94.6, min: 93.4 },
    velocidadViento: { avg: 19.2, max: 20.2 },
    direccionViento: { last: 198 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6550 },
    et0: { result: 1 },
    panelSolar: { last: 0 },
    rafagaViento: { max: 27.7 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T04:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.48, max: 9.66, min: 9.35 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.8, max: 95.2, min: 94.6 },
    velocidadViento: { avg: 15.5, max: 16.6 },
    direccionViento: { last: 205 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6548 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 22.3 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T05:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.42, max: 9.47, min: 9.32 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.8, max: 95.2, min: 94.2 },
    velocidadViento: { avg: 16.6, max: 18.4 },
    direccionViento: { last: 210 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6542 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 25.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T06:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 9.08, max: 9.28, min: 8.97 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.8, max: 95.2, min: 94.2 },
    velocidadViento: { avg: 15, max: 17.3 },
    direccionViento: { last: 207 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6539 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 26.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T07:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 8.71, max: 8.96, min: 8.54 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.5, max: 94.9, min: 94 },
    velocidadViento: { avg: 14.5, max: 16.2 },
    direccionViento: { last: 208 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6533 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 21.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T08:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 8.24, max: 8.5, min: 7.97 },
    lluvia: { sum: 0 },
    humedad: { avg: 95.5, max: 96.2, min: 94.6 },
    velocidadViento: { avg: 13, max: 14.4 },
    direccionViento: { last: 207 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6528 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 20.9 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T09:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 7.35, max: 8.04, min: 6.44 },
    lluvia: { sum: 0 },
    humedad: { avg: 96.6, max: 98.8, min: 95.1 },
    velocidadViento: { avg: 8.8, max: 13 },
    direccionViento: { last: 247 },
    radiacionSolar: { avg: 0 },
    bateria: { last: 6522 },
    et0: { result: null },
    panelSolar: { last: 0 },
    rafagaViento: { max: 16.6 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T10:00:00.000Z',
    diaNoche: 'Noche',
    temperatura: { avg: 6.1, max: 6.29, min: 5.93 },
    lluvia: { sum: 0 },
    humedad: { avg: 98.6, max: 98.9, min: 97.8 },
    velocidadViento: { avg: 4.4, max: 5 },
    direccionViento: { last: 245 },
    radiacionSolar: { avg: 13 },
    bateria: { last: 6550 },
    et0: { result: null },
    panelSolar: { last: 6815 },
    rafagaViento: { max: 11.5 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T11:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 7.58, max: 8.89, min: 6.29 },
    lluvia: { sum: 0 },
    humedad: { avg: 94.2, max: 97.8, min: 89.7 },
    velocidadViento: { avg: 8.5, max: 12.6 },
    direccionViento: { last: 204 },
    radiacionSolar: { avg: 189 },
    bateria: { last: 6896 },
    et0: { result: null },
    panelSolar: { last: 9896 },
    rafagaViento: { max: 16.9 },
  },
  {
    fuente: 'FieldClimate',
    distancia: 387,
    estacion: 'Clima',
    ubicacion: { lat: -33.665875, lng: -60.229685 },
    fecha: '2024-09-01T12:00:00.000Z',
    diaNoche: 'Día',
    temperatura: { avg: 10.03, max: 10.96, min: 8.97 },
    lluvia: { sum: 0 },
    humedad: { avg: 87.3, max: 89.7, min: 84.9 },
    velocidadViento: { avg: 12.3, max: 14.8 },
    direccionViento: { last: 188 },
    radiacionSolar: { avg: 560 },
    bateria: { last: 6904 },
    et0: { result: null },
    panelSolar: { last: 10097 },
    rafagaViento: { max: 21.2 },
  },
];

const x = {
  primerReporteNoche: {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-31T22:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 13, max: 13.4, min: 12.9 },
      '2': { avg: 13.1, max: 13.1, min: 13.1 },
      '3': { avg: 13, max: 13.1, min: 12.9 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.6, max: 10.7, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.9, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 44.04 },
      '2': { avg: 45.25 },
      '3': { avg: 50.63 },
      '4': { avg: 51.34 },
      '5': { avg: 53.33 },
      '6': { avg: 54.88 },
      '7': { avg: 54.12 },
      '8': { avg: 53.57 },
      '9': { avg: 51.49 },
    },
    bateria: { last: 6613 },
    panelSolar: { last: 0 },
  },
  ultimoReporteNoche: {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-09-01T10:00:00.000Z',
    diaNoche: 'Noche',
    temperaturaSuelo: {
      '1': { avg: 10.4, max: 10.7, min: 10.2 },
      '2': { avg: 11.8, max: 11.9, min: 11.7 },
      '3': { avg: 12.7, max: 12.8, min: 12.7 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.7, max: 10.8, min: 10.7 },
      '6': { avg: 10.9, max: 11.1, min: 10.9 },
      '7': { avg: 10.7, max: 10.8, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 38.67 },
      '2': { avg: 45.25 },
      '3': { avg: 50.6 },
      '4': { avg: 51.35 },
      '5': { avg: 53.33 },
      '6': { avg: 54.88 },
      '7': { avg: 54.13 },
      '8': { avg: 53.58 },
      '9': { avg: 51.52 },
    },
    bateria: { last: 6510 },
    panelSolar: { last: 6799 },
  },
  primerReporteDia: {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-31T11:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 11.9, max: 11.9, min: 11.9 },
      '2': { avg: 12.3, max: 12.3, min: 12.3 },
      '3': { avg: 12.9, max: 13, min: 12.8 },
      '4': { avg: 10.5, max: 10.6, min: 10.4 },
      '5': { avg: 10.7, max: 10.8, min: 10.6 },
      '6': { avg: 11, max: 11.1, min: 11 },
      '7': { avg: 10.7, max: 10.9, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.2 },
    },
    humedadSuelo: {
      '1': { avg: 44.46 },
      '2': { avg: 45.18 },
      '3': { avg: 50.57 },
      '4': { avg: 51.28 },
      '5': { avg: 53.31 },
      '6': { avg: 54.84 },
      '7': { avg: 54.09 },
      '8': { avg: 53.42 },
      '9': { avg: 51.3 },
    },
    bateria: { last: 6488 },
    panelSolar: { last: 6783 },
  },
  ultimoReporteDia: {
    fuente: 'FieldClimate',
    estacion: 'Sonda',
    ubicacion: { lat: -33.665746, lng: -60.225496 },
    fecha: '2024-08-31T21:00:00.000Z',
    diaNoche: 'Día',
    temperaturaSuelo: {
      '1': { avg: 13.6, max: 13.9, min: 13.4 },
      '2': { avg: 13.1, max: 13.2, min: 13.1 },
      '3': { avg: 12.9, max: 13.1, min: 12.9 },
      '4': { avg: 10.3, max: 10.4, min: 10.3 },
      '5': { avg: 10.6, max: 10.8, min: 10.6 },
      '6': { avg: 10.9, max: 11, min: 10.9 },
      '7': { avg: 10.8, max: 10.9, min: 10.7 },
      '8': { avg: 11, max: 11.1, min: 11 },
      '9': { avg: 11.2, max: 11.3, min: 11.1 },
    },
    humedadSuelo: {
      '1': { avg: 44.01 },
      '2': { avg: 45.24 },
      '3': { avg: 50.6 },
      '4': { avg: 51.33 },
      '5': { avg: 53.33 },
      '6': { avg: 54.88 },
      '7': { avg: 54.14 },
      '8': { avg: 53.57 },
      '9': { avg: 51.5 },
    },
    bateria: { last: 6680 },
    panelSolar: { last: 1914 },
  },
  horasDia: 11,
  horasNoche: 13,
};
