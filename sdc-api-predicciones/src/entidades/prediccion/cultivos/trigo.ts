import { Injectable, Logger } from '@nestjs/common';
import {
  gradosDiaBase0,
  ICalidadDatoMotor,
  IClimaEstacionMeteorologica,
  IContextoVentanaSanitariaTrigo,
  ICreatePrediccion,
  ICrono,
  IEtapasTrigo,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISiembra,
  resolverVentanaSanitariaFoliarTrigo,
  TEnfermedad,
  TEnfermedadId,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import { HelperService } from '../../../auxiliares/helper';
import { CronosService } from '../../crono/service';
import { SiembrasService } from '../../siembra/service';
import { FusariumDeLaEspigaService } from '../enfermedades/fusarium_de_la_espiga';
import { ManchaAmarillaService } from '../enfermedades/mancha_amarilla';
import { ManchaDeLaHojaService } from '../enfermedades/mancha_de_la_hoja';
import { RoyaDeLaHojaService } from '../enfermedades/roya_de_la_hoja';
import { PrediccionsRepository } from '../repository';
import { ClimaService } from '../../clima/service';
import { FumigacionsService } from 'src/entidades/fumigacion/service';
import { RoyaAnaranjadaService } from '../enfermedades/roya_anaranjada';
import {
  aplicarEtapaFenologicaObservada,
  resolverEtapaFenologicaObservada,
} from '../fenologia-observada';
import {
  camposClimaticosFaltantes,
  combinarCalidadDatos,
  crearPrediccionFueraVentana,
  esValorClimaticoValido,
} from '../enfermedades/calidad';
import {
  agregarClimaHorarioPorDia,
  ventanaHorariaRoyaAmarilla,
} from './clima-horario-trigo';

@Injectable()
export class PrediccionTrigoService {
  constructor(
    private prediccionsRepository: PrediccionsRepository,
    private siembrasService: SiembrasService,
    private cronosService: CronosService,
    private climaService: ClimaService,
    private fumigacionsService: FumigacionsService,
    // Enfermedades
    private fusariumDeLaEspigaService: FusariumDeLaEspigaService,
    private manchaDeLaHojaService: ManchaDeLaHojaService,
    private manchaAmarillaService: ManchaAmarillaService,
    private royaDeLaHojaService: RoyaDeLaHojaService,
    private royaAnaranjadaService: RoyaAnaranjadaService,
  ) {}

  public async hacerPredicciones(siembra: ISiembra) {
    const prediccionesCreadas: IPrediccion[] = [];

    const res = await Promise.all([
      this.cronosService.get(siembra),
      this.getUltimaPrediccion(siembra._id),
    ]);

    const crono = res[0];
    let predAnterior = res[1];

    if (!crono) {
      Logger.warn(
        `Crono no encontrado para la siembra ${JSON.stringify(siembra)}`,
      );
      return;
    }

    const fechaSiembra = new Date(siembra.fechaSiembra);
    fechaSiembra.setUTCHours(3, 0, 0, 0);
    const acumulacionPersistida = this.getAcumulacionGddPersistida(
      predAnterior,
      fechaSiembra,
    );
    const teniaMotorV4 = Boolean(
      predAnterior?.enfermedades.some(
        (item) => item.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION,
      ),
    );
    // Durante la primera reconstruccion v4 pueden existir documentos v3 en
    // todas las fechas historicas. El indice unico {idSiembra, fecha} impide
    // reinsertarlos: se recalculan en memoria y solo se persisten dias nuevos.
    const fechaCorteReconstruccion =
      !acumulacionPersistida && predAnterior?.fecha
        ? new Date(predAnterior.fecha)
        : undefined;

    // Una prediccion anterior puede pertenecer al motor legado v3. En el
    // primer calculo v4 se reconstruye la serie desde emergencia para que los
    // acumuladores sanitarios no comiencen artificialmente el dia del deploy.
    // Una vez persistido el contexto v4, los ciclos siguientes continuan desde
    // el ultimo dia calculado y no vuelven a recorrer toda la campania.
    const dateDesde = this.getFechaDesdeMotorVigente(
      siembra,
      crono,
      predAnterior,
      Boolean(acumulacionPersistida),
    );
    const dateHasta = this.getFechaHasta(siembra, crono);

    // Fechas anteriores para traer datos de clima
    const dateAnteriorADesde1 = this.diaAnterior(dateDesde);
    const dateAnteriorADesde2 = this.diaAnterior(dateAnteriorADesde1);
    const dateClimaDiarioDesde = acumulacionPersistida
      ? dateAnteriorADesde2
      : fechaSiembra < dateAnteriorADesde2
        ? fechaSiembra
        : dateAnteriorADesde2;
    // Roya amarilla usa una ventana movil de diez dias. Se solicitan nueve
    // dias civiles previos aun en una ejecucion incremental, sin incorporarlos
    // al GDD de la siembra ni a los otros acumuladores sanitarios.
    const dateVentanaHorariaDesde = new Date(dateDesde);
    dateVentanaHorariaDesde.setUTCDate(
      dateVentanaHorariaDesde.getUTCDate() - 9,
    );
    const dateClimaDesde =
      dateVentanaHorariaDesde < dateClimaDiarioDesde
        ? dateVentanaHorariaDesde
        : dateClimaDiarioDesde;

    if (dateDesde && dateDesde < dateHasta) {
      Logger.log(
        `Creando predicciones desde ${dateDesde.getUTCDate()}/${
          dateDesde.getUTCMonth() + 1
        }/${dateDesde.getUTCFullYear()} hasta ${dateHasta.getUTCDate()}/${
          dateHasta.getUTCMonth() + 1
        }/${dateHasta.getUTCFullYear()}`,
      );
      const climaHorario =
        await this.climaService.getEstacionMasCercanaEntreFechas(
          siembra.coordenadas.lat,
          siembra.coordenadas.lng,
          dateClimaDesde.toISOString(),
          dateHasta.toISOString(),
          'hourly',
          siembra.establecimiento,
        );
      if (!climaHorario.length) {
        Logger.warn(
          `No hay una estacion con datos entre ${dateClimaDesde.toISOString()} y ${dateHasta.toISOString()} cercana a la siembra ${JSON.stringify(
            siembra,
          )}`,
        );
        if (
          !teniaMotorV4 &&
          fechaCorteReconstruccion &&
          predAnterior &&
          this.getEtapaPorFecha(siembra, crono, this.diaActual()) >= 7
        ) {
          return [this.crearCierreSinteticoFinCiclo(siembra, predAnterior)];
        }
        return;
      }
      // Todos los modelos diarios consumen un agregado estadistico de las
      // observaciones horarias. Esto evita que la primera hora del dia se use
      // accidentalmente como media, minima, maxima o lluvia diaria.
      const clima = agregarClimaHorarioPorDia(climaHorario);
      if (!clima.length) {
        Logger.warn(
          `No se pudo construir ningun agregado diario desde la serie horaria para la siembra ${siembra._id}.`,
        );
        return;
      }

      const fumigaciones = await this.fumigacionsService.getByIdSiembra(
        siembra._id,
      );
      const fechasFumigadas = HelperService.fechasFumigadas(fumigaciones.datos);

      const acumulacionInicial =
        acumulacionPersistida ||
        this.acumularGddBase0(clima, fechaSiembra, dateDesde);
      let gddBase0DesdeSiembra = acumulacionInicial.gdd;
      let diasGddEsperados = acumulacionInicial.diasEsperados;
      let diasGddDisponibles = acumulacionInicial.diasDisponibles;
      let calidadClimaAcumulada = combinarCalidadDatos(
        this.getCalidadClimaPersistida(predAnterior),
        acumulacionPersistida
          ? undefined
          : this.acumularCalidadClima(clima, fechaSiembra, dateDesde),
      );

      let ultimaPrediccion: IPrediccion;
      for (
        let fecha = dateDesde;
        fecha < dateHasta;
        fecha.setUTCDate(fecha.getUTCDate() + 1)
      ) {
        const tratamientoVigente = fechasFumigadas.includes(
          fecha.toISOString(),
        );
        // El modelo describe presión meteorológica. Una aplicación no borra la
        // historia climática ni confirma control; su eficacia se evalúa en la
        // capa de manejo y monitoreo.
        const predecir = true;
        if (tratamientoVigente) {
          Logger.log(
            `Se conserva la presion meteorologica del ${fecha.toISOString()} aunque exista un tratamiento vigente`,
          );
        }

        const etapaCrono = this.getEtapaPorFecha(siembra, crono, fecha);
        const fenologiaObservada = resolverEtapaFenologicaObservada(
          siembra,
          fecha,
          'Trigo',
        );
        const etapa = aplicarEtapaFenologicaObservada(
          etapaCrono,
          fenologiaObservada,
        );

        const registroClima = this.getRegistroClimaPorFecha(clima, fecha);
        const distancia = registroClima?.distancia ?? clima[0].distancia;
        if (registroClima) {
          calidadClimaAcumulada = combinarCalidadDatos(
            calidadClimaAcumulada,
            this.normalizarCalidadClima(registroClima, distancia),
          );
        }

        const hr = HelperService.getHR(clima, fecha.toISOString());
        const Tmin = HelperService.getTMin(clima, fecha.toISOString());
        const Tmax = HelperService.getTMax(clima, fecha.toISOString());
        const Tavg = HelperService.getTAvg(clima, fecha.toISOString());
        const precip = HelperService.getPrecip(clima, fecha.toISOString());
        const viento = HelperService.getViento(clima, fecha.toISOString());

        diasGddEsperados += 1;
        const temperaturaGddValida =
          camposClimaticosFaltantes({ Tmin, Tavg, Tmax }, [
            'Tmin',
            'Tavg',
            'Tmax',
          ]).length === 0;
        if (temperaturaGddValida) {
          diasGddDisponibles += 1;
          gddBase0DesdeSiembra += gradosDiaBase0(Number(Tavg));
        }
        const coberturaGdd = diasGddEsperados
          ? diasGddDisponibles / diasGddEsperados
          : 0;

        const fechaAnt = new Date(fecha);
        fechaAnt.setUTCDate(fechaAnt.getUTCDate() - 1);
        const hrAnterior = HelperService.getHR(clima, fechaAnt.toISOString());
        const precipAnterior = HelperService.getPrecip(
          clima,
          fechaAnt.toISOString(),
        );

        const prediccion: ICreatePrediccion = {
          idSiembra: siembra._id,
          idQuimica: siembra.idQuimica,
          idDistribuidor: siembra.idDistribuidor,
          idProductor: siembra.idProductor,
          idEstablecimiento: siembra.idEstablecimiento,
          fecha: fecha.toISOString(),
          fechaPrediccion: fecha.toISOString().split('T')[0],
          etapa,
          fuenteFenologia: fenologiaObservada ? 'observada' : 'crono',
          registroFenologicoId: fenologiaObservada?.registro.id,
          calidadFenologia: {
            nivel: fenologiaObservada ? 'alta' : 'media',
            fuente: fenologiaObservada ? 'manual' : 'estimado',
            cobertura: 1,
            fallback: !fenologiaObservada,
            resumen: fenologiaObservada
              ? 'Etapa observada a campo.'
              : 'Etapa estimada desde fecha de siembra y crono.',
            limitaciones: fenologiaObservada
              ? []
              : ['No hay observación fenológica de campo anterior a la fecha.'],
          },
          enfermedades: [],
          estacion: {
            idEstacion: registroClima?.estacion || clima[0].estacion,
            fuente: registroClima?.fuente || clima[0].fuente,
            distanciaMetros: distancia,
            humedadRelativa: hr,
            precipitaciones: precip,
            temperaturaMaxima: Tmax,
            temperaturaMinima: Tmin,
            temperaturaPromedio: Tavg,
          },
        };

        // Hace las predicciones por enfermedad segun ventana fenologica.
        const predicciones: (IPrediccionEnfermedad | undefined)[] = [];

        const ventanaFoliarBase: IContextoVentanaSanitariaTrigo = {
          gddBase0DesdeSiembra,
          coberturaGdd,
          etapa,
          fenologiaObservada: Boolean(fenologiaObservada),
          calidadClima: calidadClimaAcumulada,
        };
        const ventanaFoliar =
          resolverVentanaSanitariaFoliarTrigo(ventanaFoliarBase);
        const contextoVentanaFoliar: IContextoVentanaSanitariaTrigo = {
          ...ventanaFoliarBase,
          fenologiaObservada: ventanaFoliar.inicioPorFenologiaObservada,
        };
        const trazasVentanaFoliar: Record<string, number> = {
          GDDBase0Siembra: +gddBase0DesdeSiembra.toFixed(2),
          coberturaGdd: +coberturaGdd.toFixed(4),
          umbralInicioGdd: ventanaFoliar.umbralGddAplicado,
          inicioPorFenologiaObservada: ventanaFoliar.inicioPorFenologiaObservada
            ? 1
            : 0,
          formulaVersion: TRIGO_MOTOR_SANITARIO_VERSION,
        };

        if (this.estaEnVentanaManchas(etapa) && ventanaFoliar.activa) {
          predicciones.push(
            ...(await Promise.all([
              this.manchaDeLaHojaService.predecir(
                siembra.semilla,
                { precip, hr },
                predAnterior,
                predecir,
                contextoVentanaFoliar,
              ),
              this.manchaAmarillaService.predecir(
                siembra.semilla,
                { precip, hr, Tmin, Tmax },
                predAnterior,
                predecir,
                contextoVentanaFoliar,
              ),
            ])),
          );
        } else {
          const motivo = this.motivoFueraVentanaFoliar(
            'manchas foliares',
            etapa,
            2,
            4,
            ventanaFoliar.activa,
            gddBase0DesdeSiembra,
            coberturaGdd,
          );
          predicciones.push(
            this.crearMarcadorFueraVentana(
              'Mancha de la Hoja',
              'trigo.mancha_hoja',
              motivo,
              predAnterior,
              trazasVentanaFoliar,
            ),
            this.crearMarcadorFueraVentana(
              'Mancha Amarilla',
              'trigo.mancha_amarilla',
              motivo,
              predAnterior,
              trazasVentanaFoliar,
            ),
          );
        }

        if (this.estaEnVentanaRoyas(etapa) && ventanaFoliar.activa) {
          predicciones.push(
            ...(await Promise.all([
              this.royaDeLaHojaService.predecir(
                siembra.semilla,
                { precip, hr, Tavg },
                predAnterior,
                predecir,
                contextoVentanaFoliar,
              ),
              this.royaAnaranjadaService.predecir(
                siembra.semilla,
                { precip, hr, Tmin, Tmax, Tavg },
                ventanaHorariaRoyaAmarilla(climaHorario, fecha),
                predAnterior,
                predecir,
                contextoVentanaFoliar,
              ),
            ])),
          );
        } else {
          const motivo = this.motivoFueraVentanaFoliar(
            'royas foliares',
            etapa,
            2,
            6,
            ventanaFoliar.activa,
            gddBase0DesdeSiembra,
            coberturaGdd,
          );
          predicciones.push(
            this.crearMarcadorFueraVentana(
              'Roya de la Hoja',
              'trigo.roya_hoja',
              motivo,
              predAnterior,
              trazasVentanaFoliar,
            ),
            this.crearMarcadorFueraVentana(
              'Roya Anaranjada',
              'trigo.roya_anaranjada',
              motivo,
              predAnterior,
              trazasVentanaFoliar,
            ),
          );
        }

        if (this.estaEnVentanaFusarium(etapa)) {
          predicciones.push(
            await this.fusariumDeLaEspigaService.predecir(
              siembra.semilla,
              { precip, precipAnterior, hr, hrAnterior, Tmin, Tmax, Tavg },
              predAnterior,
              predecir,
              ventanaFoliarBase,
            ),
          );
        } else {
          predicciones.push(
            this.crearMarcadorFueraVentana(
              'Fusarium de la Espiga',
              'trigo.fusarium_espiga',
              `Fuera de la ventana fenologica de Fusarium (etapas 5 a 6; etapa actual ${etapa}).`,
              predAnterior,
            ),
          );
        }

        const prediccionesValidas = predicciones.filter(
          (item): item is IPrediccionEnfermedad => !!item,
        );
        for (const item of prediccionesValidas) {
          const calidadYaIncorporada =
            item.calidadClima === calidadClimaAcumulada;
          if (!calidadYaIncorporada) {
            item.calidadDatos = combinarCalidadDatos(
              item.calidadDatos,
              calidadClimaAcumulada,
            );
          }
          item.calidadClima = calidadClimaAcumulada;
          this.aplicarControlDominioResultado(item);
        }
        prediccion.enfermedades.push(...prediccionesValidas);

        if (
          fechaCorteReconstruccion &&
          fecha.getTime() <= fechaCorteReconstruccion.getTime()
        ) {
          // Backfill exclusivamente en memoria: estas fechas ya estan
          // ocupadas por v3 en el indice unico. El objeto v4 se encadena para
          // conservar acumuladores, pero no se expone como dato persistido.
          predAnterior = JSON.parse(JSON.stringify(prediccion)) as IPrediccion;
          continue;
        }

        // Crea la prediccion en la base de datos
        if (prediccion.enfermedades.length) {
          try {
            const prediccionCreada =
              await this.prediccionsRepository.create(prediccion);
            prediccionesCreadas.push(prediccionCreada);
            predAnterior = JSON.parse(JSON.stringify(prediccionCreada));
            ultimaPrediccion = predAnterior;
          } catch (error) {
            Logger.error(error);
            // No calcular el dia siguiente sobre un estado que no quedo
            // persistido: el reintento debe partir de la ultima fecha segura.
            throw error;
          }
        }
      }

      if (
        !teniaMotorV4 &&
        fechaCorteReconstruccion &&
        prediccionesCreadas.length === 0 &&
        predAnterior &&
        this.getEtapaPorFecha(siembra, crono, this.diaActual()) >= 7
      ) {
        // Excepcion deliberada: un ciclo legacy ya finalizado puede tener
        // ocupadas tambien las fechas de cierre. Se devuelve (sin persistir)
        // una salida reciente y no alertable para finalizar alertas v3 vivas.
        prediccionesCreadas.push(
          this.crearCierreSinteticoFinCiclo(siembra, predAnterior),
        );
      }

      // Actualiza la siembra con la ultima prediccion
      if (ultimaPrediccion) {
        await this.siembrasService.update(siembra._id, { ultimaPrediccion });
      }
    }
    return prediccionesCreadas;
  }

  private aplicarControlDominioResultado(
    prediccion: IPrediccionEnfermedad,
  ): void {
    if (prediccion.estado !== 'calculado') return;
    const variables = prediccion.variables as Record<string, number>;
    if (
      prediccion.idEnfermedad === 'trigo.roya_anaranjada' &&
      prediccion.modelo?.validacion === 'experimental' &&
      prediccion.modelo?.resolucion === 'horaria'
    ) {
      const frecuencia = variables?.frecuenciaAmbientalPct;
      if (
        esValorClimaticoValido(frecuencia) &&
        Number(frecuencia) >= 0 &&
        Number(frecuencia) <= 100
      ) {
        return;
      }
      prediccion.calidadDatos = combinarCalidadDatos(prediccion.calidadDatos, {
        nivel: 'baja',
        fuente: prediccion.calidadDatos?.fuente || 'desconocida',
        fallback: true,
        resumen: 'Frecuencia ambiental horaria fuera de dominio.',
        limitaciones: [
          'Frecuencia ambiental fuera del dominio 0-100; no interpretar ni automatizar.',
        ],
      });
      return;
    }
    const resultadoCrudo = variables?.resultadoCrudo;
    if (
      esValorClimaticoValido(resultadoCrudo) &&
      Number(resultadoCrudo) >= 0 &&
      Number(resultadoCrudo) <= 100
    ) {
      return;
    }
    prediccion.calidadDatos = combinarCalidadDatos(prediccion.calidadDatos, {
      nivel: 'baja',
      fuente: 'mixto',
      fallback: true,
      resumen: 'Salida contractual fuera del dominio operativo.',
      limitaciones: ['Salida fuera del dominio 0-100; no alertar/prescribir.'],
    });
  }

  private crearCierreSinteticoFinCiclo(
    siembra: ISiembra,
    anterior: IPrediccion,
  ): IPrediccion {
    const ahora = new Date();
    const motivo =
      'Cierre sintetico no persistido: ciclo de trigo finalizado en etapa 7; retira alertas sanitarias legadas.';
    const definiciones: Array<[TEnfermedad, TEnfermedadId]> = [
      ['Mancha de la Hoja', 'trigo.mancha_hoja'],
      ['Mancha Amarilla', 'trigo.mancha_amarilla'],
      ['Roya de la Hoja', 'trigo.roya_hoja'],
      ['Roya Anaranjada', 'trigo.roya_anaranjada'],
      ['Fusarium de la Espiga', 'trigo.fusarium_espiga'],
    ];
    return {
      fecha: ahora.toISOString(),
      fechaPrediccion: ahora.toISOString().split('T')[0],
      etapa: 7,
      fuenteFenologia: anterior.fuenteFenologia || 'crono',
      idSiembra: siembra._id,
      idQuimica: siembra.idQuimica,
      idDistribuidor: siembra.idDistribuidor,
      idProductor: siembra.idProductor,
      idEstablecimiento: siembra.idEstablecimiento,
      estacion: anterior.estacion,
      enfermedades: definiciones.map(([enfermedad, idEnfermedad]) =>
        this.crearMarcadorFueraVentana(
          enfermedad,
          idEnfermedad,
          motivo,
          anterior,
        ),
      ),
    };
  }

  private crearMarcadorFueraVentana(
    enfermedad: TEnfermedad,
    idEnfermedad: TEnfermedadId,
    motivo: string,
    prediccionAnterior?: IPrediccion,
    variables: Record<string, number> = {},
  ): IPrediccionEnfermedad {
    const anterior = prediccionAnterior?.enfermedades.find(
      (item) =>
        item.idEnfermedad === idEnfermedad &&
        item.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION,
    );
    const experimental = idEnfermedad === 'trigo.roya_anaranjada';
    const fuentes: Partial<Record<TEnfermedadId, string>> = {
      'trigo.mancha_amarilla':
        'Contrato sanitario trigo 2026 / Mancha Amarilla',
      'trigo.mancha_hoja': 'Contrato sanitario trigo 2026 / Mancha de la Hoja',
      'trigo.roya_hoja':
        'Contrato sanitario trigo 2026; Moschini y Perez (1999), adaptacion varietal declarada',
      'trigo.roya_anaranjada':
        'Contrato sanitario trigo 2026 / registro legado Roya Anaranjada',
      'trigo.fusarium_espiga':
        'Moschini y Fortugno (1996) / contrato sanitario trigo 2026',
    };

    return crearPrediccionFueraVentana(
      enfermedad,
      idEnfermedad,
      motivo,
      fuentes[idEnfermedad] || 'Motor sanitario trigo 2026',
      TRIGO_MOTOR_SANITARIO_VERSION,
      experimental ? 'experimental' : 'operativo_provisional',
      variables,
      anterior,
    );
  }

  private motivoFueraVentanaFoliar(
    grupo: string,
    etapa: number,
    etapaMinima: number,
    etapaMaxima: number,
    ventanaTermicaActiva: boolean,
    gddBase0: number,
    coberturaGdd: number,
  ): string {
    if (etapa < etapaMinima || etapa > etapaMaxima) {
      return `Fuera de la ventana fenologica de ${grupo} (etapas ${etapaMinima} a ${etapaMaxima}; etapa actual ${etapa}).`;
    }
    if (!ventanaTermicaActiva) {
      return `Ventana de ${grupo} aun no habilitada: ${gddBase0.toFixed(
        1,
      )} GDD base 0 y ${(coberturaGdd * 100).toFixed(
        0,
      )}% de cobertura; requiere 850 GDD con al menos 90% o fenologia observada habilitante.`;
    }
    return `Fuera de la ventana sanitaria de ${grupo}.`;
  }

  private estaEnVentanaManchas(etapa: number): boolean {
    // Etapa 1 es Emergencia. El contrato abre en fin de macollaje,
    // representado por Espiguilla Terminal (etapa 2), nunca por Emergencia.
    return etapa >= 2 && etapa <= 4;
  }

  private estaEnVentanaRoyas(etapa: number): boolean {
    return etapa >= 2 && etapa <= 6;
  }

  private estaEnVentanaFusarium(etapa: number): boolean {
    // Contrato 2026: iniciar con las primeras espigas con anteras (antesis).
    return etapa >= 5 && etapa <= 6;
  }

  private getRegistroClimaPorFecha(
    clima: IClimaEstacionMeteorologica[],
    fecha: Date,
  ): IClimaEstacionMeteorologica | undefined {
    const iso = fecha.toISOString();
    const dia = iso.split('T')[0];
    return clima.find(
      (item) => item.fecha === iso || item.fecha?.split('T')[0] === dia,
    );
  }

  private normalizarCalidadClima(
    registro: IClimaEstacionMeteorologica,
    distanciaMetros?: number,
  ): ICalidadDatoMotor {
    const declarada = registro.calidadDatos;
    const fuenteProveedor = String(registro.fuente || 'desconocida');
    const fuentes: Record<string, ICalidadDatoMotor['fuente']> = {
      OpenMeteo: 'open_meteo',
      MeteoSource: 'meteosource',
      Meteoblue: 'meteoblue',
      FieldClimate: 'estacion_asignada',
      Dispositivo: 'sensor_campo',
    };
    const distanciaKmDeclarada = declarada?.distanciaKm;
    const distanciaKm = esValorClimaticoValido(distanciaKmDeclarada)
      ? Math.max(0, Number(distanciaKmDeclarada))
      : esValorClimaticoValido(distanciaMetros)
        ? Math.max(0, Number(distanciaMetros)) / 1000
        : undefined;
    return {
      nivel: declarada?.nivel || 'media',
      fuente:
        declarada?.fuente || fuentes[fuenteProveedor] || 'estacion_cercana',
      cobertura: declarada?.cobertura ?? 1,
      distanciaKm,
      fechaActualizacion: declarada?.fechaActualizacion,
      fallback: declarada?.fallback ?? fuenteProveedor === 'OpenMeteo',
      resumen:
        declarada?.resumen ||
        `Calidad climatica conservadora para ${fuenteProveedor}; el proveedor no informo una clasificacion explicita.`,
      limitaciones: [
        ...(declarada?.limitaciones || []),
        ...(!declarada
          ? ['Registro climatico sin metadata de calidad explicita.']
          : []),
      ],
    };
  }

  private acumularCalidadClima(
    clima: IClimaEstacionMeteorologica[],
    desde: Date,
    hastaExclusivo: Date,
  ): ICalidadDatoMotor | undefined {
    let acumulada: ICalidadDatoMotor | undefined;
    for (
      let fecha = new Date(desde);
      fecha < hastaExclusivo;
      fecha.setUTCDate(fecha.getUTCDate() + 1)
    ) {
      const registro = this.getRegistroClimaPorFecha(clima, fecha);
      if (!registro) continue;
      acumulada = combinarCalidadDatos(
        acumulada,
        this.normalizarCalidadClima(registro, registro.distancia),
      );
    }
    return acumulada;
  }

  private getCalidadClimaPersistida(
    prediccion?: IPrediccion,
  ): ICalidadDatoMotor | undefined {
    return prediccion?.enfermedades.find(
      (item) =>
        item.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION &&
        Boolean(item.calidadClima),
    )?.calidadClima;
  }

  private acumularGddBase0(
    clima: IClimaEstacionMeteorologica[],
    desde: Date,
    hastaExclusivo: Date,
  ): { gdd: number; diasEsperados: number; diasDisponibles: number } {
    let gdd = 0;
    let diasEsperados = 0;
    let diasDisponibles = 0;
    for (
      let fecha = new Date(desde);
      fecha < hastaExclusivo;
      fecha.setUTCDate(fecha.getUTCDate() + 1)
    ) {
      diasEsperados += 1;
      const temperaturaOriginal = HelperService.getTAvg(
        clima,
        fecha.toISOString(),
      );
      const tmin = HelperService.getTMin(clima, fecha.toISOString());
      const tmax = HelperService.getTMax(clima, fecha.toISOString());
      if (
        camposClimaticosFaltantes(
          { Tmin: tmin, Tavg: temperaturaOriginal, Tmax: tmax },
          ['Tmin', 'Tavg', 'Tmax'],
        ).length
      ) {
        continue;
      }
      const temperatura = Number(temperaturaOriginal);
      diasDisponibles += 1;
      gdd += gradosDiaBase0(temperatura);
    }
    return {
      gdd: +gdd.toFixed(2),
      diasEsperados,
      diasDisponibles,
    };
  }

  private getAcumulacionGddPersistida(
    prediccion: IPrediccion | undefined,
    fechaSiembra: Date,
  ):
    | { gdd: number; diasEsperados: number; diasDisponibles: number }
    | undefined {
    if (!prediccion?.fecha) return undefined;
    const variables = prediccion.enfermedades
      .filter((item) => item.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION)
      .map((item) => item.variables as Record<string, number>)
      .find((item) => esValorClimaticoValido(item.GDDBase0Siembra));
    if (!variables) return undefined;

    const fechaPrediccion = new Date(prediccion.fecha);
    const diasEsperados = Math.max(
      1,
      Math.floor(
        (fechaPrediccion.getTime() - fechaSiembra.getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1,
    );
    const cobertura = esValorClimaticoValido(variables.coberturaGdd)
      ? Math.min(1, Math.max(0, Number(variables.coberturaGdd)))
      : 0;
    return {
      gdd: Number(variables.GDDBase0Siembra),
      diasEsperados,
      diasDisponibles: Math.round(diasEsperados * cobertura),
    };
  }

  private async getUltimaPrediccion(
    idSiembra: string,
  ): Promise<IPrediccion | undefined> {
    const filter = {
      idSiembra,
    };
    const param: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fecha',
      limit: 1,
    };
    const predicciones = await this.prediccionsRepository.get(param);
    return predicciones.datos[0];
  }

  // Helpers

  /**
   *
   * @returns Etapa en la que esta la siembra en la fecha dada
   */
  private getEtapaPorFecha(siembra: ISiembra, crono: ICrono, fecha: Date) {
    const observada = resolverEtapaFenologicaObservada(siembra, fecha, 'Trigo');
    if (typeof observada?.etapa === 'number') return observada.etapa;
    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = fecha;
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapasTrigo = crono.etapas as IEtapasTrigo;

    const etapa1 = etapasTrigo.R0_R1;
    const etapa2 = etapa1 + etapasTrigo.R1_R2;
    const etapa3 = etapa2 + etapasTrigo.R2_R3;
    const etapa4 = etapa3 + etapasTrigo.R3_R4;
    const etapa5 = etapa4 + etapasTrigo.R4_R5;
    const etapa6 = etapa5 + etapasTrigo.R5_R6;
    const etapa7 = etapa6 + etapasTrigo.R6_R7;

    if (diasTransucurridos < etapa1) {
      return 0;
    } else if (diasTransucurridos < etapa2) {
      return 1;
    } else if (diasTransucurridos < etapa3) {
      return 2;
    } else if (diasTransucurridos < etapa4) {
      return 3;
    } else if (diasTransucurridos < etapa5) {
      return 4;
    } else if (diasTransucurridos < etapa6) {
      return 5;
    } else if (diasTransucurridos < etapa7) {
      return 6;
    } else {
      return 7;
    }
  }

  /**
   *
   * @returns Fecha en que inicia la etapa dada
   */
  private getFechaInicioEtapa(
    siembra: ISiembra,
    crono: ICrono,
    etapa: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  ) {
    const etapas = [];
    const etapasTrigo = crono.etapas as IEtapasTrigo;

    etapas[0] = 0;
    etapas[1] = etapasTrigo.R0_R1;
    etapas[2] = etapas[1] + etapasTrigo.R1_R2;
    etapas[3] = etapas[2] + etapasTrigo.R2_R3;
    etapas[4] = etapas[3] + etapasTrigo.R3_R4;
    etapas[5] = etapas[4] + etapasTrigo.R4_R5;
    etapas[6] = etapas[5] + etapasTrigo.R5_R6;
    etapas[7] = etapas[6] + etapasTrigo.R6_R7;

    const fecha = new Date(siembra.fechaSiembra);
    fecha.setUTCHours(0, 0, 0, 0);

    const dias = etapas[etapa];
    fecha.setUTCDate(fecha.getUTCDate() + dias);

    return fecha;
  }

  /**
   *
   * @returns Fecha desde que se debe hacer la prediccion,
   * en caso de que exista una prediccion anterior se devuelve
   * la fecha de la prediccion anterior,
   * sino desde emergencia para no perder el seguimiento foliar temprano.
   */
  private getFechaDesde(
    siembra: ISiembra,
    crono: ICrono,
    prediccionAnterior?: IPrediccion,
  ) {
    if (prediccionAnterior) {
      const fecha = new Date(prediccionAnterior.fecha);
      fecha.setUTCHours(3, 0, 0, 0);
      fecha.setUTCDate(fecha.getUTCDate() + 1);
      return fecha;
    }
    const fecha = this.getFechaInicioEtapa(siembra, crono, 1);
    fecha.setUTCHours(3, 0, 0, 0);

    return fecha;
  }

  private getFechaDesdeInicioSanitario(siembra: ISiembra, crono: ICrono) {
    const fecha = this.getFechaInicioEtapa(siembra, crono, 1);
    fecha.setUTCHours(3, 0, 0, 0);
    return fecha;
  }

  private getFechaDesdeMotorVigente(
    siembra: ISiembra,
    crono: ICrono,
    prediccionAnterior: IPrediccion | undefined,
    tieneContextoVigente: boolean,
  ) {
    return tieneContextoVigente
      ? this.getFechaDesde(siembra, crono, prediccionAnterior)
      : this.getFechaDesdeInicioSanitario(siembra, crono);
  }

  /**
   *
   * @returns Fecha hasta que se debe hacer la prediccion,
   * la fecha menor entre la fecha actual y la fecha en que inicia la etapa 7.
   */
  private getFechaHasta(siembra: ISiembra, crono: ICrono) {
    const fechaLimite = this.getFechaInicioEtapa(siembra, crono, 7);
    // El limite es exclusivo. Se agrega un unico dia para persistir el
    // marcador terminal de etapa 7 y cerrar explicitamente todas las ventanas.
    fechaLimite.setUTCDate(fechaLimite.getUTCDate() + 1);
    const fechaHoy = this.diaActual();
    const fechaMenor = fechaHoy > fechaLimite ? fechaLimite : fechaHoy;
    fechaMenor.setUTCHours(3, 0, 0, 0);
    return fechaMenor;
  }

  /**
   *
   * @returns Fecha actual a las 0:00:00 UTC
   */
  private diaActual() {
    const fecha = new Date();
    fecha.setUTCHours(0, 0, 0, 0);
    return fecha;
  }

  private diaAnterior(fecha: Date) {
    const fechaAnterior = new Date(fecha);
    fechaAnterior.setDate(fechaAnterior.getDate() - 1);
    return fechaAnterior;
  }
}
