import { Injectable, Logger, Optional } from '@nestjs/common';
import { SiembrasService } from '../siembra/service';
import { PrediccionSojaService } from './cultivos/soja';
import { PrediccionTrigoService } from './cultivos/trigo';
import { NotificacionsService } from '../notificacion/service';
import {
  CEBADA_MANCHA_RED_UMBRAL_ALERTA,
  esFechaPrediccionSanitariaReciente,
  esPrediccionSanitariaAlertable,
  getEnfermedadPorId,
  getUmbralesRiesgoSanitario,
  IPrediccion,
  IPrediccionEnfermedad,
  ISiembra,
  IResultadoPrediccionMalezas,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import { AlertasService } from '../alerta/service';
import { PrediccionMaizService } from './cultivos/maiz';
import {
  PREDICCIONES_MALEZAS_LIMIT,
  PREDICCIONES_SANITARIAS_CONCURRENCY,
} from '../../env';
import { PrediccionCebadaService } from './cultivos/cebada';
import { PrediccionArvejaService } from './cultivos/arveja';
import { PrediccionsRepository } from './repository';
import { PREDICCIONES_FRUTALES_EXPERIMENTALES_ENABLED } from '../../env';
import { PrediccionFrutalesService } from './cultivos/frutales';
import { LotesService } from '../lote/service';

@Injectable()
export class PrediccionsService {
  private logger = new Logger(PrediccionsService.name);
  private readonly reconstrucciones = new Map<string, Promise<IPrediccion[]>>();
  constructor(
    private siembrasService: SiembrasService,
    private prediccionTrigoService: PrediccionTrigoService,
    private prediccionSojaService: PrediccionSojaService,
    private prediccionMaizService: PrediccionMaizService,
    private prediccionCebadaService: PrediccionCebadaService,
    private prediccionArvejaService: PrediccionArvejaService,
    private notificacionesService: NotificacionsService,
    private alertasService: AlertasService,
    private prediccionsRepository: PrediccionsRepository,
    @Optional()
    private prediccionFrutalesService?: PrediccionFrutalesService,
    @Optional()
    private lotesService?: LotesService,
  ) {}

  async hacerPredicciones() {
    const siembras =
      await this.siembrasService.listarSiembrasParaPrediccionesSanitarias();
    Logger.log(`Iniciando Predicciones para ${siembras.length} siembras`);
    const fallidas: string[] = [];
    for (
      let inicio = 0;
      inicio < siembras.length;
      inicio += PREDICCIONES_SANITARIAS_CONCURRENCY
    ) {
      const tanda = siembras.slice(
        inicio,
        inicio + PREDICCIONES_SANITARIAS_CONCURRENCY,
      );
      const resultados = await Promise.allSettled(
        tanda.map((siembra) => this.prediccion(siembra._id)),
      );
      resultados.forEach((resultado, indice) => {
        if (resultado.status === 'rejected') {
          const idSiembra = String(tanda[indice]._id);
          fallidas.push(idSiembra);
          this.logger.error(
            `Fallo la prediccion sanitaria de la siembra ${idSiembra}: ${
              resultado.reason?.message || resultado.reason
            }`,
          );
        }
      });
    }
    Logger.log(
      `Predicciones realizadas: ${siembras.length - fallidas.length}/${siembras.length}`,
    );
    if (fallidas.length) {
      throw new Error(
        `Fallaron ${fallidas.length} predicciones sanitarias: ${fallidas.join(', ')}`,
      );
    }
  }

  async hacerPrediccionesMalezas() {
    if (this.lotesService) {
      const lotes = await this.lotesService.listarLotesParaMalezas(
        PREDICCIONES_MALEZAS_LIMIT,
      );
      Logger.log(
        `Iniciando Predicciones de malezas para ${lotes.length} lotes`,
      );

      let procesados = 0;
      let conEvento = 0;
      for (const lote of lotes) {
        try {
          const resultado = await this.prediccionMalezasLote(lote._id);
          procesados += 1;
          if (
            resultado?.especies?.some((especie) => especie.severidad === 'alta')
          ) {
            conEvento += 1;
          }
        } catch (error) {
          this.logger.error(
            `Error en prediccion de malezas del lote ${lote._id}: ${error?.message || error}`,
          );
        }
      }

      Logger.log(
        `Predicciones de malezas realizadas: ${procesados}/${lotes.length}. Eventos: ${conEvento}`,
      );
      return;
    }

    // Compatibilidad para pruebas y despliegues transitorios donde el modulo
    // de lotes aun no este disponible. Produccion usa siempre el recorrido por
    // lote, incluida la superficie sin una siembra activa.
    const siembras = await this.siembrasService.listarSiembrasParaMalezas(
      PREDICCIONES_MALEZAS_LIMIT,
    );
    Logger.log(
      `Iniciando Predicciones de malezas para ${siembras.length} siembras`,
    );

    let procesadas = 0;
    let conEvento = 0;
    for (const s of siembras) {
      try {
        const resultado = await this.prediccionMalezas(s._id);
        procesadas += 1;
        if (
          resultado?.especies?.some((especie) => especie.severidad === 'alta')
        ) {
          conEvento += 1;
        }
      } catch (error) {
        this.logger.error(`Error en prediccion de malezas ${s._id}`);
        console.error(error);
      }
    }

    Logger.log(
      `Predicciones de malezas realizadas: ${procesadas}/${siembras.length}. Eventos: ${conEvento}`,
    );
  }

  async prediccion(idSiembra: string): Promise<any> {
    try {
      const siembra = await this.siembrasService.getById(idSiembra);
      Logger.log(
        `Iniciando prediccion para ${siembra.semilla?.cultivo} de ciclo ${
          siembra.semilla?.ciclo
        } con fecha de siembra ${new Date(siembra.fechaSiembra).getDate()}/${
          new Date(siembra.fechaSiembra).getMonth() + 1
        }/${new Date(siembra.fechaSiembra).getFullYear()} en departamento ${
          siembra.departamento?.nombre
        } del productor ${siembra.productor?.nombre}`,
      );

      let predicciones: IPrediccion[] = [];
      switch (siembra.semilla?.cultivo) {
        case 'Trigo':
          predicciones =
            await this.prediccionTrigoService.hacerPredicciones(siembra);
          break;
        case 'Soja':
          predicciones =
            await this.prediccionSojaService.hacerPredicciones(siembra);
          break;
        case 'Maiz':
          predicciones =
            await this.prediccionMaizService.hacerPredicciones(siembra);
          break;
        case 'Cebada':
          predicciones =
            await this.prediccionCebadaService.hacerPredicciones(siembra);
          break;
        case 'Arveja':
          predicciones =
            await this.prediccionArvejaService.hacerPredicciones(siembra);
          break;
        case 'Manzano':
        case 'Peral':
        case 'Pecan':
          if (
            PREDICCIONES_FRUTALES_EXPERIMENTALES_ENABLED &&
            this.prediccionFrutalesService
          ) {
            predicciones =
              await this.prediccionFrutalesService.hacerPredicciones(siembra);
          }
          break;
      }

      if (!predicciones?.length) {
        return [];
      }

      try {
        // Arveja permanece como screening experimental: no crea notificaciones
        // ni alertas hasta validacion contra observaciones de campo.
        if (
          ['Arveja', 'Manzano', 'Peral', 'Pecan'].includes(
            String(siembra.semilla?.cultivo || ''),
          )
        ) {
          return predicciones;
        }
        await Promise.all([
          this.notificacionesService.enviarNotificaciones(
            predicciones,
            siembra,
          ),
          this.enviarAlertas(predicciones, siembra),
        ]);
      } catch (error) {
        console.error(error);
      }
      return predicciones;
    } catch (error) {
      this.logger.error(
        `Error en la prediccion de enfermedades de la siembra ${idSiembra}`,
      );
      // El consumidor elimina/reconstruye una serie completa. Devolver 200
      // con undefined ocultaba fallos parciales y podia dejar al lote sin una
      // serie sanitaria coherente. La falla debe llegar al orquestador para
      // activar rollback/reintento y nunca presentarse como exito.
      throw error;
    }
  }

  async reconstruir(idSiembra: string): Promise<IPrediccion[]> {
    const key = String(idSiembra);
    const anterior = this.reconstrucciones.get(key);
    if (anterior) return await anterior;

    let actual: Promise<IPrediccion[]>;
    actual = this.reconstruirSerie(key).finally(() => {
      if (this.reconstrucciones.get(key) === actual) {
        this.reconstrucciones.delete(key);
      }
    });
    this.reconstrucciones.set(key, actual);
    return await actual;
  }

  private async reconstruirSerie(idSiembra: string): Promise<IPrediccion[]> {
    const snapshot = await this.prediccionsRepository.get({
      filter: JSON.stringify({ idSiembra }),
      sort: 'fecha',
      limit: 0,
    });
    await this.prediccionsRepository.deleteByIdSiembra(idSiembra);
    try {
      const creadas = (await this.prediccion(idSiembra)) || [];
      if (!creadas.length) {
        await this.siembrasService.update(idSiembra, {
          ultimaPrediccion: null,
        } as any);
      }
      return creadas;
    } catch (error) {
      try {
        await this.prediccionsRepository.restoreByIdSiembra(
          idSiembra,
          snapshot?.datos || [],
        );
      } catch (restoreError) {
        this.logger.error(
          `Fallo critico al restaurar el respaldo sanitario de ${idSiembra}: ${restoreError}`,
        );
        const fatal = new Error(
          `Fallo la reconstruccion y el rollback sanitario de ${idSiembra}`,
        ) as Error & { errors?: unknown[] };
        fatal.errors = [error, restoreError];
        throw fatal;
      }
      throw error;
    }
  }

  async prediccionMalezas(
    idSiembra: string,
  ): Promise<IResultadoPrediccionMalezas> {
    try {
      const siembra = await this.siembrasService.getById(idSiembra);
      const resultado = await this.siembrasService.prediccionMalezas(idSiembra);
      await this.notificarResultadoMalezas(resultado, siembra);
      return resultado;
    } catch (error) {
      this.logger.error(
        `Error en la prediccion de malezas de la siembra ${idSiembra}`,
      );
      throw error;
    }
  }

  async prediccionMalezasLote(
    idLote: string,
  ): Promise<IResultadoPrediccionMalezas> {
    if (!this.lotesService) {
      throw new Error('El servicio de lotes no esta disponible.');
    }
    const resultado = await this.lotesService.prediccionMalezas(idLote);
    if (resultado?.idSiembra) {
      const siembra = await this.siembrasService.getById(resultado.idSiembra);
      await this.notificarResultadoMalezas(resultado, siembra);
    }
    return resultado;
  }

  private async notificarResultadoMalezas(
    resultado: IResultadoPrediccionMalezas,
    siembra: ISiembra,
  ): Promise<void> {
    if (resultado?.estado !== 'operativo') return;
    await Promise.all([
      this.notificacionesService.enviarNotificacionesMalezas(
        resultado,
        siembra,
      ),
      this.enviarAlertasMalezas(resultado, siembra),
    ]);
  }

  private async enviarAlertas(predicciones: IPrediccion[], siembra: ISiembra) {
    for (const {
      prediccion: p,
      enfermedad: e,
    } of this.ultimasPrediccionesPorEnfermedad(predicciones)) {
      const idSiembra = p.idSiembra || siembra._id;
      const fecha = p.fecha;
      const fechaValida = this.esFechaValida(fecha);
      const versionMotor = this.versionMotor(e);
      const slugEnfermedad = this.slug(e.enfermedad);
      // Se conserva la forma de la clave historica normalizada por AlertasService
      // para poder actualizar o finalizar alertas ya activas sin mezclar patologias.
      const dedupeKey = `${idSiembra}:sanitaria:enfermedad:${slugEnfermedad}`;
      const descripcion = `Predicción sanitaria: ${e.enfermedad}`;
      const alertable =
        fechaValida &&
        esFechaPrediccionSanitariaReciente(fecha) &&
        e.modelo?.validacion !== 'experimental' &&
        esPrediccionSanitariaAlertable(e);

      // Un backfill o una fecha corrupta nunca debe modificar una alerta viva.
      if (!fechaValida || !esFechaPrediccionSanitariaReciente(fecha)) {
        continue;
      }

      if (!alertable) {
        if (this.debeFinalizarAlertaSanitaria(e)) {
          await this.alertasService.finalizarEventoSiembra(
            idSiembra,
            descripcion,
            `La última salida vigente para ${e.enfermedad} cerró la ventana, retiró el modelo anterior o descendió bajo el umbral con datos suficientes. No confirma ausencia de enfermedad a campo.`,
            dedupeKey,
          );
        }
        continue;
      }

      await this.alertasService.registrarEventoSiembra({
        idSiembra,
        descripcion,
        titulo: e.enfermedad,
        tipo: 'enfermedad',
        categoria: 'sanitaria',
        motor: 'prediccion-enfermedades',
        versionMotor,
        lectura:
          e.idEnfermedad === 'cebada.mancha_red' &&
          Number(e.modelo?.version || 0) >= 4
            ? `${e.enfermedad}: indice predictivo de presion ambiental ${Number(e.resultado).toFixed(1)}/100. Requiere recorrida; no confirma infeccion, sintomas ni severidad a campo.`
            : `${e.enfermedad}: predicción meteorológica de severidad/incidencia ${Number(e.resultado).toFixed(1)}%. No confirma enfermedad.`,
        recomendacion:
          'Validar a campo, revisar estadio fenologico, humedad y manejo antes de definir una intervencion.',
        calidadDatos: {
          nivel:
            e.calidadDatos?.nivel === 'alta'
              ? 'alta'
              : e.calidadDatos?.nivel === 'baja' ||
                  e.calidadDatos?.nivel === 'sin_datos'
                ? 'baja'
                : 'media',
          fuente:
            e.calidadDatos?.resumen || 'Clima historico y fenologia del lote',
          detalle: [
            ...(e.calidadDatos?.limitaciones || []),
            `Fenologia: ${p.fuenteFenologia || 'crono'}.`,
            `Modelo: ${e.modelo?.id || e.enfermedad} ${versionMotor}.`,
            'Es una predicción meteorológica; no confirma enfermedad.',
          ].join(' '),
        },
        dedupeKey,
        fecha,
        eventKey: `enfermedad:${idSiembra}:${slugEnfermedad}:${versionMotor}:${this.dateKeyPrediccion(fecha)}`,
        reporte: {
          tipo: 'enfermedad',
          idEnfermedad: e.idEnfermedad,
          enfermedad: e.enfermedad,
          resultado: e.resultado,
          estado: e.estado,
          versionModelo: e.modelo?.version,
          fechaPrediccion: fecha,
        },
        tenant: {
          idDistribuidor: siembra.idDistribuidor,
          idEstablecimiento: siembra.idEstablecimiento,
          idProductor: siembra.idProductor,
          idQuimica: siembra.idQuimica,
        },
      });
    }
  }

  private debeFinalizarAlertaSanitaria(
    enfermedad: IPrediccionEnfermedad,
  ): boolean {
    if (enfermedad.estado === 'fuera_ventana') return true;

    const definicion = getEnfermedadPorId(enfermedad.idEnfermedad);
    // Un modelo sin validacion explicita pertenece al dominio de auditoria,
    // no al operativo. Esto cierra lecturas legacy que no declaraban el campo
    // y evita conservar alertas generadas por contratos incompletos.
    if (enfermedad.modelo?.validacion !== 'operativo') return true;
    if (definicion && definicion.motor !== 'operativo') return true;
    if (
      definicion?.cultivo === 'Trigo' &&
      Number(enfermedad.modelo?.version || 0) < TRIGO_MOTOR_SANITARIO_VERSION
    ) {
      return true;
    }

    // Falta de datos, resistencia dudosa o extrapolacion no demuestran que el
    // episodio haya terminado: se conserva la alerta hasta obtener una salida
    // confiable o hasta cerrar la ventana.
    if (enfermedad.estado !== 'calculado') return false;
    if (
      enfermedad.calidadDatos?.nivel === 'baja' ||
      enfermedad.calidadDatos?.nivel === 'sin_datos'
    ) {
      return false;
    }
    if (enfermedad.resistenciaUsada?.estado === 'desconocida') return false;

    if (definicion?.cultivo === 'Trigo') {
      const variables = (enfermedad.variables || {}) as {
        resultadoCrudo?: number;
      };
      const crudo = Number(variables.resultadoCrudo);
      if (!Number.isFinite(crudo) || crudo < 0 || crudo > 100) return false;
    }

    const umbralCierre =
      enfermedad.idEnfermedad === 'cebada.mancha_red' &&
      Number(enfermedad.modelo?.version || 0) >= 4
        ? CEBADA_MANCHA_RED_UMBRAL_ALERTA
        : getUmbralesRiesgoSanitario(definicion?.cultivo).medio;
    return (
      Number.isFinite(Number(enfermedad.resultado)) &&
      Number(enfermedad.resultado) < umbralCierre
    );
  }

  /**
   * Una reconstruccion puede devolver toda la serie diaria. Alertar cada fila
   * historica generaria eventos falsamente actuales, por eso se conserva solo
   * la salida con mayor fecha de cada enfermedad.
   */
  private ultimasPrediccionesPorEnfermedad(predicciones: IPrediccion[]): Array<{
    prediccion: IPrediccion;
    enfermedad: IPrediccionEnfermedad;
  }> {
    const ultimas = new Map<
      string,
      {
        prediccion: IPrediccion;
        enfermedad: IPrediccionEnfermedad;
        fechaMs: number;
        orden: number;
      }
    >();
    let orden = 0;

    for (const prediccion of predicciones || []) {
      const fechaMs = this.fechaMs(prediccion.fecha);
      for (const enfermedad of prediccion.enfermedades || []) {
        const clave =
          enfermedad.idEnfermedad || this.slug(enfermedad.enfermedad);
        const actual = ultimas.get(clave);
        const candidata = { prediccion, enfermedad, fechaMs, orden: orden++ };
        if (
          !actual ||
          candidata.fechaMs > actual.fechaMs ||
          (candidata.fechaMs === actual.fechaMs &&
            candidata.orden > actual.orden)
        ) {
          ultimas.set(clave, candidata);
        }
      }
    }

    return [...ultimas.values()].map(({ prediccion, enfermedad }) => ({
      prediccion,
      enfermedad,
    }));
  }

  private fechaMs(fecha?: string): number {
    if (!fecha) return Number.NEGATIVE_INFINITY;
    const value = new Date(fecha).getTime();
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
  }

  private esFechaValida(fecha?: string): fecha is string {
    return this.fechaMs(fecha) !== Number.NEGATIVE_INFINITY;
  }

  private versionMotor(enfermedad: IPrediccionEnfermedad): string {
    const version = Number(enfermedad.modelo?.version);
    return Number.isFinite(version) ? `v${version}` : 'sin-version';
  }

  private dateKeyPrediccion(fecha: string): string {
    // Las series agronomicas representan un dia civil en UTC (00:00Z). Usar
    // timezone local aqui las desplazaria artificialmente al dia anterior.
    const fechaCivil = fecha?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    return fechaCivil || this.dateKey(fecha);
  }

  private async enviarAlertasMalezas(
    resultado: IResultadoPrediccionMalezas,
    siembra: ISiembra,
  ) {
    const fecha = resultado.fecha || new Date().toISOString();
    const idSiembra = resultado.idSiembra || siembra._id;
    const especies = (resultado.especies || []).filter(
      (especie) => especie.severidad === 'alta',
    );

    for (const especie of especies) {
      const nombre = especie.nombre || 'maleza';
      await this.alertasService.registrarEventoSiembra({
        idSiembra,
        descripcion: 'Riesgo de Malezas',
        titulo: nombre,
        tipo: 'maleza',
        categoria: 'malezas',
        motor: 'prediccion-malezas',
        versionMotor: resultado.versionMotor
          ? `v${resultado.versionMotor}`
          : 'sin-version',
        lectura: `${nombre}: emergencia proyectada ${Number(especie.emergenciaProyectada7dPct || 0).toFixed(1)}%.`,
        recomendacion: especie.recomendacion,
        calidadDatos: {
          nivel: 'media',
          fuente: 'Semillero superficial modelado y parametros de especie',
          detalle:
            'Proyeccion diaria del motor de malezas; debe cruzarse con recorrida y cobertura real.',
        },
        fecha,
        eventKey: `maleza:${idSiembra}:${this.slug(
          especie.codigoCarga || nombre,
        )}:${this.dateKey(fecha)}`,
        reporte: {
          tipo: 'maleza',
          idMaleza: especie.idMaleza,
          maleza: nombre,
          avancePct: especie.avancePct,
          emergenciaPct: especie.emergenciaProyectada7dPct,
          severidad: especie.severidad,
          recomendacion: especie.recomendacion,
        },
        tenant: {
          idDistribuidor: siembra.idDistribuidor,
          idEstablecimiento: siembra.idEstablecimiento,
          idProductor: siembra.idProductor,
          idQuimica: siembra.idQuimica,
        },
      });
    }
  }

  private dateKey(fecha = new Date().toISOString()): string {
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private slug(value?: string): string {
    return (
      value
        ?.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'evento'
    );
  }
}
