import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  getLineasFertilizacion,
  getLineasFumigacion,
  ISiembra,
  IListado,
  IQueryParam,
  ICreateSiembra,
  IUpdateSiembra,
  ICrono,
  ILote,
  IFertilizacion,
  IFumigacion,
  IClimaEstacionMeteorologica,
  Cultivo,
  IEtapasTrigo,
  IEtapasMaiz,
  IEtapasSoja,
  IHuellaHidrica,
  IFilter,
  IPermiso,
  IPrediccion,
  IResultadoPrediccionMalezas,
  IRegistroFenologico,
  IRegistroFenologicoFrio,
  IRespuestaAgrometeorologiaSiembra,
  TObjetivoBiofixFenologico,
  ARVEJA_MOTOR_SANITARIO_VERSION,
  TRIGO_MOTOR_SANITARIO_VERSION,
  esCultivoPerenne,
  campaniaFenologicaParaFecha,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { establecimientosDelPermiso } from '../../auxiliares/authorization/alcance-permiso';
import { CronosService } from '../crono/service';
import { PrediccionsService } from '../prediccion/service';
import { SemillasService } from '../semilla/service';
import { SiembrasRepository } from './repository';
import { LotesService } from '../lote/service';
import {
  EQ,
  EXTRACCION_N,
  EXTRACCION_P,
  KCAL_X_KG,
  PESOS_CPP,
  PESOS_N,
  PESOS_P,
} from '../../env';
import { FertilizacionsService } from '../fertilizacion/service';
import { FumigacionsService } from '../fumigacion/service';
import { ClimaService } from '../clima/service';
import {
  DecisionEnqueueOptions,
  DecisionPipelineQueueService,
} from '../../auxiliares/decision-pipeline';

interface Stage {
  name: string;
  kcProm: number;
  days: number;
}

const OBJETIVOS_BIOFIX_PERMITIDOS = new Set<TObjetivoBiofixFenologico>([
  'anclaje_fenologico',
  'inicio_acumulacion_frio',
  'fin_acumulacion_frio',
  'inicio_forzado',
  'inicio_vernalizacion',
  'fin_vernalizacion',
  'reinicio_gdd_etapa',
  'reinicio_gdd_forzado',
]);

@Injectable()
export class SiembrasService {
  private logger = new Logger(SiembrasService.name);
  private readonly pipelinesDecision = new Map<string, Promise<void>>();

  constructor(
    private repository: SiembrasRepository,
    private prediccionsService: PrediccionsService,
    private semillasService: SemillasService,
    private cronosService: CronosService,
    private lotesService: LotesService,
    @Inject(forwardRef(() => FertilizacionsService))
    private fertilizacionsService: FertilizacionsService,
    private fumigacionsService: FumigacionsService,
    private climaService: ClimaService,
    @Optional()
    private readonly decisionPipelineQueue?: DecisionPipelineQueueService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<ISiembra> {
    const data = await this.repository.getById(id);
    if (this.puedeVer(data, permiso)) {
      return data;
    }
    if (
      permiso.nivel !== 'Admin' &&
      !this.tieneAlcancePersistido(data, permiso) &&
      data.idLote
    ) {
      try {
        await this.lotesService.getById(data.idLote, permiso);
        return data;
      } catch {
        // El lote canonico es la unica via de compatibilidad para una siembra
        // legacy sin tenant persistido. Un desacuerdo explicito nunca cae aqui.
      }
    }
    throw new Error('No tiene permiso para ver esta siembra');
  }

  async seguimientoHuellaHidrica(id: string, permiso: IPermiso): Promise<any> {
    await this.getById(id, permiso);
    return await this.repository.seguimientoHuellaHidrica(id);
  }

  async prediccionMalezas(
    id: string,
    permiso: IPermiso,
  ): Promise<IResultadoPrediccionMalezas> {
    await this.getById(id, permiso);
    return await this.repository.prediccionMalezas(id);
  }

  async agrometeorologia(
    id: string,
    desde: string | undefined,
    hasta: string | undefined,
    includeHourly: boolean,
    permiso: IPermiso,
  ): Promise<IRespuestaAgrometeorologiaSiembra> {
    await this.getById(id, permiso);
    return await this.repository.agrometeorologia(
      id,
      desde,
      hasta,
      includeHourly,
    );
  }

  async reprocesarAgrometeorologia(
    id: string,
    sincronizarClima: boolean,
    permiso: IPermiso,
  ): Promise<IRespuestaAgrometeorologiaSiembra> {
    await this.getById(id, permiso);
    await this.repository.reprocesarAgrometeorologia(id, sincronizarClima);
    return await this.repository.agrometeorologia(id);
  }

  async registrarEtapaFenologica(
    id: string,
    registro: IRegistroFenologico,
    permiso: IPermiso,
  ): Promise<ISiembra> {
    const siembra = await this.getById(id, permiso);
    const cultivo = this.canonicalCultivo(siembra.semilla?.cultivo);
    if (!cultivo) {
      throw new BadRequestException(
        'La siembra no tiene un cultivo valido para registrar fenologia.',
      );
    }
    const fechaRegistro = this.validarFechaRegistroFenologico(
      siembra,
      registro,
    );
    const coberturaObservadaPct =
      registro.coberturaObservadaPct === undefined
        ? undefined
        : Number(registro.coberturaObservadaPct);
    if (
      coberturaObservadaPct !== undefined &&
      (!Number.isFinite(coberturaObservadaPct) ||
        coberturaObservadaPct < 0 ||
        coberturaObservadaPct > 100)
    ) {
      throw new BadRequestException(
        'La cobertura fenologica observada debe estar entre 0 y 100%.',
      );
    }
    if (
      registro.confianza &&
      !['alta', 'media', 'baja'].includes(registro.confianza)
    ) {
      throw new BadRequestException(
        'La confianza del registro fenologico no es valida.',
      );
    }
    const accion = registro.accion || 'inicio';
    const tipoEvento =
      registro.tipoEvento ||
      (accion === 'observacion'
        ? 'observacion'
        : accion === 'ajuste'
          ? 'correccion'
          : 'inicio_etapa');
    const objetivosBiofix = this.normalizarObjetivosBiofix(
      tipoEvento,
      registro.objetivosBiofix,
    );

    const now = new Date().toISOString();
    const reemplazaRegistroId =
      registro.reemplazaRegistroId ||
      (registro.tipoEvento === 'correccion' ? registro.id : undefined);
    const registros = [...(siembra.registrosFenologicos || [])];
    if (
      registro.id &&
      !reemplazaRegistroId &&
      registros.some((item) => item.id === registro.id)
    ) {
      throw new BadRequestException(
        'Los registros fenologicos son inmutables. Para corregir uno existente debe indicar reemplazaRegistroId.',
      );
    }
    if (
      reemplazaRegistroId &&
      !registros.some((item) => item.id === reemplazaRegistroId)
    ) {
      throw new BadRequestException(
        'El registro fenologico que se intenta corregir ya no existe.',
      );
    }
    if (
      reemplazaRegistroId &&
      registros.some((item) => item.reemplazaRegistroId === reemplazaRegistroId)
    ) {
      throw new BadRequestException(
        'El registro fenologico ya tiene una correccion posterior.',
      );
    }

    // El identificador se genera siempre en el servidor: una correccion agrega
    // un nuevo evento que referencia al anterior y nunca reescribe el historial.
    const idRegistro = this.crearIdRegistroFenologico();
    const frioAcumulado = await this.construirSnapshotTermicoFenologico(
      siembra,
      fechaRegistro,
    );
    const registroCompleto: IRegistroFenologico = {
      ...registro,
      id: idRegistro,
      fecha: fechaRegistro,
      fechaObservacion:
        registro.fechaObservacion ||
        (tipoEvento === 'observacion' ? fechaRegistro : now),
      fechaInicioEtapa:
        registro.fechaInicioEtapa ||
        (tipoEvento === 'observacion' ? undefined : fechaRegistro),
      accion,
      tipoEvento,
      idSiembra: siembra._id,
      idLote: siembra.idLote,
      idSemilla: siembra.idSemilla,
      cultivo,
      variedad: siembra.semilla?.variedad,
      ciclo: siembra.semilla?.ciclo,
      campania: campaniaFenologicaParaFecha(siembra, new Date(fechaRegistro)),
      requerimientoFrio: siembra.semilla?.requerimientoFrio,
      fenologiaReferencia: siembra.semilla?.fenologiaReferencia,
      // La evidencia termica se obtiene en el servidor. Nunca se acepta un
      // acumulado calculado o alterado por el navegador.
      frioAcumulado,
      escalaEtapa: String(registro.escalaEtapa || '').trim() || undefined,
      codigoEtapa: String(registro.codigoEtapa || '').trim() || undefined,
      coberturaObservadaPct,
      confianza: registro.confianza || 'media',
      observador: String(registro.observador || '').trim() || undefined,
      objetivosBiofix,
      reemplazaRegistroId,
      actualizadoEn: now,
    };

    const registroPersistible: IRegistroFenologico = {
      ...registroCompleto,
      creadoEn: now,
    };
    registros.push(registroPersistible);

    await this.repository.registrarEtapaFenologica(id, registroPersistible);
    await this.encolarPipelineDecision(
      id,
      {
        trigger: 'siembra.phenology-recorded',
        changedFields: ['registrosFenologicos'],
        sincronizarClima: false,
        operationId: idRegistro,
      },
      permiso,
      true,
    );
    return await this.getById(id, permiso);
  }

  private async construirSnapshotTermicoFenologico(
    siembra: ISiembra,
    fechaRegistro: string,
  ): Promise<IRegistroFenologicoFrio> {
    const fechaObjetivo = fechaRegistro.slice(0, 10);
    const perenne = esCultivoPerenne(siembra.semilla?.cultivo);
    const pendiente: IRegistroFenologicoFrio = {
      fechaHasta: fechaObjetivo,
      fechaCaptura: new Date().toISOString(),
      estado: 'pendiente',
      fuente: 'motor agrometeorologico canonico',
    };

    try {
      const respuesta = await this.repository.agrometeorologia(siembra._id!);
      const dia = [...(respuesta.series || [])]
        .filter(
          (item) =>
            !item.isForecast &&
            String(item.date || '').slice(0, 10) <= fechaObjetivo,
        )
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .at(-1);
      if (!dia) return pendiente;

      const numero = (valor: unknown): number | undefined => {
        const resultado = Number(valor);
        return Number.isFinite(resultado) ? resultado : undefined;
      };
      const fuenteTemperatura =
        dia.sourceByVariable?.temperatureMeanC ||
        dia.sourceByVariable?.temperatureMinC ||
        dia.sourceByVariable?.temperatureMaxC ||
        dia.source;
      const fuenteCampo = String(fuenteTemperatura || '').includes('sensor');
      const tieneFrio =
        perenne &&
        [
          dia.metrics.chillingHoursAccumulated,
          dia.metrics.utahChillUnitsAccumulated,
          dia.metrics.chillPortionsAccumulated,
        ].some((valor) => numero(valor) !== undefined);
      const tieneGdd = numero(dia.metrics.gddAccumulated) !== undefined;
      const continuidad = perenne
        ? respuesta.summary.chillingContinuitySufficient
        : respuesta.summary.gddAccumulationComplete;

      return {
        fechaDesde: perenne
          ? respuesta.summary.coldSeasonStart
          : siembra.fechaSiembra,
        fechaHasta: dia.date,
        fechaCaptura: new Date().toISOString(),
        horasFrio: perenne
          ? numero(dia.metrics.chillingHoursAccumulated)
          : undefined,
        unidadesFrioUtah: perenne
          ? numero(dia.metrics.utahChillUnitsAccumulated)
          : undefined,
        porcionesFrio: perenne
          ? numero(dia.metrics.chillPortionsAccumulated)
          : undefined,
        gradosDia: numero(dia.metrics.gddAccumulated),
        fuente: respuesta.dataSource.type,
        fuenteTemperatura: String(fuenteTemperatura || dia.source),
        serieCampoPrioritaria: fuenteCampo,
        coberturaPct: perenne
          ? numero(respuesta.summary.chillingTemperatureCoveragePct)
          : numero(respuesta.dataSource.completenessPercentage),
        continuidadSuficiente: continuidad,
        brechaMaximaHoras: perenne
          ? numero(respuesta.summary.chillingMaximumGapHours)
          : undefined,
        estado:
          (tieneFrio || tieneGdd) && continuidad !== false
            ? 'completo'
            : tieneFrio || tieneGdd
              ? 'parcial'
              : 'pendiente',
        versionModelo: perenne ? respuesta.summary.coldModelVersion : undefined,
        versionCalculo: respuesta.calculationVersion,
        versionParametros: respuesta.parametersVersion,
      };
    } catch (error: any) {
      this.logger.warn(
        `No se pudo adjuntar snapshot termico al registro fenologico ${siembra._id}: ${error?.message || error}`,
      );
      return pendiente;
    }
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<ISiembra>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async generarPrediccionEnfermedades(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IPrediccion[]> {
    const siembra = await this.getById(idSiembra, permiso);
    const versionObjetivo = this.versionSanitariaObjetivo(siembra);
    await this.repository.reprocesarAgrometeorologia(idSiembra, true);
    this.logger.log(
      `Reconstruccion sanitaria manual${versionObjetivo ? ` v${versionObjetivo}` : ''} para ${siembra.semilla?.cultivo} ${idSiembra} con clima canonico actualizado`,
    );
    return await this.prediccionsService.reconstruir(idSiembra, permiso);
  }

  private versionSanitariaObjetivo(siembra: ISiembra): number | undefined {
    if (siembra.semilla?.cultivo === 'Trigo') {
      return TRIGO_MOTOR_SANITARIO_VERSION;
    }
    if (siembra.semilla?.cultivo === 'Arveja') {
      return ARVEJA_MOTOR_SANITARIO_VERSION;
    }
    return undefined;
  }

  async create(data: ICreateSiembra, permiso: IPermiso): Promise<ISiembra> {
    this.assertAdvisorReadOnly(permiso);
    data = this.sinHistorialFenologicoGenerico(data);
    if (!data.idLote) {
      throw new BadRequestException('No se ingresó el lote');
    }
    const lote = await this.lotesService.getById(data.idLote, permiso);
    data.idDepartamento = lote?.idDepartamento;
    data.idEstablecimiento = lote?.idEstablecimiento;
    data.idProductor = lote?.idProductor;
    data.idDistribuidor = lote?.idDistribuidor;
    data.idQuimica = lote?.idQuimica;
    data.coordenadas = lote?.ubicacion?.centro;
    data.geojson = {
      type: 'Point',
      coordinates: HelperService.coorToGeoJson(data.coordenadas),
    };
    const crono = await this.getCrono(data);
    data.idCrono = crono?._id;

    const created = await this.repository.create(data);
    const idSiembra = created._id;
    // Si el lote no tiene siembra o la siembra es anterior a la nueva, se actualiza el idSiembra del lote
    if (!lote.siembra || lote.siembra.fechaSiembra < data.fechaSiembra) {
      this.updateIdSiembraEnLote(data.idLote, idSiembra, permiso);
    }
    await this.encolarPipelineDecision(
      idSiembra,
      {
        trigger: 'siembra.created',
        changedFields: Object.keys(data || {}),
        sincronizarClima: true,
      },
      permiso,
      false,
    );
    this.encolarNdvi(data.idLote, permiso);
    return await this.getById(created._id, permiso);
  }

  async cosechar(
    id: string,
    data: IUpdateSiembra,
    permiso: IPermiso,
  ): Promise<ISiembra> {
    this.assertAdvisorReadOnly(permiso);
    data = this.sinHistorialFenologicoGenerico(data);
    const siembra = await this.getById(id, permiso);
    // La autorizacion del lote se mantiene en la API publica, pero el calculo
    // y los efectos de cosecha se ejecutan una unica vez en sdc-datos.
    await this.lotesService.getById(siembra.idLote, permiso);
    return this.repository.cosechar(id, data);
  }

  async update(
    id: string,
    data: IUpdateSiembra,
    permiso: IPermiso,
  ): Promise<ISiembra> {
    this.assertAdvisorReadOnly(permiso);
    data = this.sinHistorialFenologicoGenerico(data);
    const siembraActual = await this.getById(id, permiso);
    const idLoteActual = String(siembraActual.idLote || '');
    if (!idLoteActual) {
      throw new BadRequestException(
        'La siembra existente no tiene un lote valido asociado.',
      );
    }
    if (data.idLote && String(data.idLote) !== idLoteActual) {
      throw new BadRequestException(
        'No se puede trasladar una siembra existente a otro lote.',
      );
    }
    data.idLote = idLoteActual;
    const lote = await this.lotesService.getById(idLoteActual, permiso);
    data.idDepartamento = lote?.idDepartamento;
    data.idEstablecimiento = lote?.idEstablecimiento;
    data.idProductor = lote?.idProductor;
    data.idDistribuidor = lote?.idDistribuidor;
    data.idQuimica = lote?.idQuimica;
    data.coordenadas = lote?.ubicacion?.centro;
    data.geojson = {
      type: 'Point',
      coordinates: HelperService.coorToGeoJson(data.coordenadas),
    };
    const crono = await this.getCrono(data);
    data.idCrono = crono?._id;

    await this.repository.update(id, data);
    await this.encolarPipelineDecision(
      id,
      {
        trigger: 'siembra.updated',
        changedFields: Object.keys(data || {}),
        sincronizarClima: true,
      },
      permiso,
      true,
    );
    this.encolarNdvi(idLoteActual, permiso);
    return await this.getById(id, permiso);
  }

  async delete(id: string, permiso: IPermiso): Promise<ISiembra> {
    this.assertAdvisorReadOnly(permiso);
    const siembra = await this.getById(id, permiso);
    const deleted = await this.repository.delete(id);
    await this.actualizarLoteAlEliminarSiembra(siembra, permiso);
    return deleted;
  }

  private async siembraAnterior(idLote: string, fechaSiembraAnteriorA: string) {
    const filter: IFilter<ISiembra> = {
      idLote,
      fechaSiembra: { $lt: fechaSiembraAnteriorA },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fechaSiembra',
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  private async actualizarLoteAlEliminarSiembra(
    siembra: ISiembra,
    permiso: IPermiso,
  ) {
    // Actualizo los suelos del lote de la siembra
    const lote = await this.lotesService.getById(siembra.idLote, permiso);
    if (!lote) {
      console.debug('No se encontró el lote de la siembra');
    } else {
      let update = false;
      // Si se está eliminando la siembra actual, se actualiza el idSiembra del lote a la siembra anterior si existe
      if (lote.idSiembra === siembra._id) {
        const siembraAnterior = await this.siembraAnterior(
          lote._id,
          siembra.fechaSiembra,
        );
        lote.idSiembra = siembraAnterior?._id || null;
        update = true;
      }

      // Elimina las raices de los suelos del lote
      if (!lote.suelos) {
        console.debug('No se encontraron los suelos del lote');
      } else {
        for (const l of lote.suelos) {
          l.hayRaices = false;
        }
        update = true;
      }

      if (update) {
        await this.lotesService.update(lote._id, lote, permiso);
      }
    }
  }

  private async ultimaSiembra(idLote: string, permiso: IPermiso) {
    const filter: IFilter<ISiembra> = { idLote };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fechaSiembra',
      limit: 1,
    };
    const res = await this.get(query, permiso);
    return res.datos[0];
  }

  private async updateIdSiembraEnLote(
    idLote: string,
    idSiembra: string,
    permiso: IPermiso,
  ) {
    try {
      await this.lotesService.update(idLote, { idSiembra }, permiso);
    } catch (error) {
      this.logger.error(
        `Error al actualizar el idSiembra ${idSiembra} en el lote ${idLote}`,
      );
      console.error(error);
    }
  }

  private async crearPrediccion(idSiembra: string) {
    await this.prediccionsService.prediccion(idSiembra);
  }

  private encolarNdvi(idLote: string, permiso: IPermiso) {
    this.lotesService.generarNdvi(idLote, permiso).catch((error) => {
      this.logger.error(`Error al encolar NDVI para el lote ${idLote}`);
      console.error(error);
    });
  }

  private evaluarAgroclima(idSiembra: string) {
    this.prediccionsService.agroclima(idSiembra).catch((error) => {
      this.logger.error(
        `Error al evaluar riesgos agroclimaticos para la siembra ${idSiembra}`,
      );
      console.error(error);
    });
  }

  // HUELLA HIDRICA
  private datosValidos(siembra: ISiembra, lote: ILote) {
    if (!siembra.dosisN) {
      throw new BadRequestException('No se ingresó la dosis de Nitrógeno');
    }
    if (!siembra.dosisP) {
      throw new BadRequestException('No se ingresó la dosis de Fósforo');
    }
    if (!siembra.rendimientoObtenidoKgHaSeco) {
      throw new BadRequestException('No se ingresó el rendimiento obtenido');
    }
    if (!lote.texturaEscorrentia) {
      throw new BadRequestException('No se ingresó la textura de escorrentía');
    }
    if (!lote.texturaLixiviacion) {
      throw new BadRequestException('No se ingresó la textura de lixiviación');
    }
    if (!lote.drenajeNaturalEscorrentia) {
      throw new BadRequestException(
        'No se ingresó el drenaje natural de escorrentía',
      );
    }
    if (!lote.drenajeNaturalLixiviacion) {
      throw new BadRequestException(
        'No se ingresó el drenaje natural de lixiviación',
      );
    }
    if (!lote.depositoN) {
      throw new BadRequestException('No se ingresó el depósito de Nitrógeno');
    }
    if (!siembra.lluviasPromedio) {
      throw new BadRequestException('No se ingresó las lluvias promedio');
    }
    if (!siembra.fijacionN) {
      throw new BadRequestException('No se ingresó la fijación de Nitrógeno');
    }
    if (!siembra.manejoAgronomico) {
      throw new BadRequestException('No se ingresó el manejo agronómico');
    }
    if (!siembra.intensidadLluvias) {
      throw new BadRequestException('No se ingresó la intensidad de lluvias');
    }
  }

  public async calcularHuellaHidrica(
    siembra: ISiembra,
    lote: ILote,
    permiso: IPermiso,
  ) {
    console.debug(
      `Calculando Huella Hídrica para ${siembra.semilla?.cultivo} entre las fechas ${siembra.fechaSiembra} y ${siembra.fechaCosecha} - rendimiento seco ${siembra.rendimientoObtenidoKgHaSeco}`,
    );

    this.datosValidos(siembra, lote);

    // const f = await this.HHGFertilizantes(siembra, lote);
    // console.debug('HHGris Fertilizantes:', f);

    const [HHGFertilizantes, HHGFumigaciones, HHVyA] = await Promise.all([
      this.HHGFertilizantes(siembra, lote),
      this.HHGFumigaciones(siembra, lote, permiso),
      this.HHVerdeYAzul(siembra, lote),
    ]);
    console.debug('HHGris Fertilizantes:', HHGFertilizantes);
    console.debug('HHGris Fumigaciones:', HHGFumigaciones);
    console.debug('HHAzul:', HHVyA.HHGAzul);
    console.debug('HHVerde:', HHVyA.HHGVerde);

    const hh: IHuellaHidrica = {
      azul: {
        litrosKg: HHVyA.HHGAzul,
        litrosKcal: this.kgToKcal(HHVyA.HHGAzul, siembra),
      },
      verde: {
        litrosKg: HHVyA.HHGVerde,
        litrosKcal: this.kgToKcal(HHVyA.HHGVerde, siembra),
      },
      gris: {
        litrosKgAgroquimico: HHGFumigaciones,
        litrosKgFertilizante: HHGFertilizantes,
        litrosKg: HHGFertilizantes + HHGFumigaciones,
        litrosKcal: this.kgToKcal(HHGFumigaciones + HHGFertilizantes, siembra),
      },
      total: {
        litrosKg:
          HHGFertilizantes + HHGFumigaciones + HHVyA.HHGVerde + HHVyA.HHGAzul,
        litrosKcal: this.kgToKcal(
          HHGFertilizantes + HHGFumigaciones + HHVyA.HHGVerde + HHVyA.HHGAzul,
          siembra,
        ),
      },
    };
    console.debug('Huella Hídrica:', hh);
    return hh;
  }

  private kgToKcal(valor: number, siembra: ISiembra) {
    const cultivo = siembra.semilla?.cultivo;
    const valorKcal = KCAL_X_KG[cultivo];
    return (valor / siembra.rendimientoObtenidoKgHaSeco) * valorKcal;
  }

  // HUELLA HIDRICA GRIS
  // FERTILIZACION
  private calcularPotencialTotalN(siembra: ISiembra, lote: ILote) {
    let suma = 0;
    suma += EQ.depositoN[lote.depositoN] * PESOS_N.depositoN;
    suma +=
      EQ.texturaLixiviacion[lote.texturaLixiviacion] *
      PESOS_N.texturaLixiviacion;
    suma +=
      EQ.texturaEscorrentia[lote.texturaEscorrentia] *
      PESOS_N.texturaEscorrentia;
    suma +=
      EQ.drenajeNaturalLixiviacion[lote.drenajeNaturalLixiviacion] *
      PESOS_N.drenajeNaturalLixiviacion;
    suma +=
      EQ.drenajeNaturalEscorrentia[lote.drenajeNaturalEscorrentia] *
      PESOS_N.drenajeNaturalEscorrentia;
    suma +=
      EQ.lluviasPromedio[siembra.lluviasPromedio] * PESOS_N.lluviasPromedio;
    suma += EQ.fijacionN[siembra.fijacionN] * PESOS_N.fijacionN;
    suma += EQ.dosisN[siembra.dosisN] * PESOS_N.dosisN;
    suma += EQ.rendimiento[siembra.rendimiento] * PESOS_N.rendimiento;
    suma +=
      EQ.manejoAgronomico[siembra.manejoAgronomico] * PESOS_N.manejoAgronomico;
    return suma;
  }

  private calcularPotencialTotalP(siembra: ISiembra, lote: ILote) {
    let suma = 0;
    suma +=
      EQ.texturaLixiviacion[lote.texturaLixiviacion] *
      PESOS_P.texturaLixiviacion;
    suma +=
      EQ.erosionEscorrentiaPendiente[lote.erosionEscorrentiaPendiente] *
      PESOS_P.erosionEscorrentiaPendiente;
    suma += EQ.contenidoP[lote.contenidoP] * PESOS_P.contenidoP;
    suma +=
      EQ.intensidadLluvias[siembra.intensidadLluvias] *
      PESOS_P.intensidadLluvias;
    suma += EQ.dosisP[siembra.dosisP] * PESOS_P.dosisP;
    suma += EQ.rendimiento[siembra.rendimiento] * PESOS_P.rendimiento;
    suma +=
      EQ.manejoAgronomico[siembra.manejoAgronomico] * PESOS_P.manejoAgronomico;
    return suma;
  }

  private calcularAporteTotalN(fertilizaciones: IFertilizacion[]) {
    let aporteTotalN = 0;
    for (const f of fertilizaciones) {
      for (const linea of getLineasFertilizacion(f)) {
        aporteTotalN +=
          (Number(linea.dosisKgHa || 0) *
            Number(linea.fertilizante?.porcentajeN || 0)) /
          100;
      }
    }
    return aporteTotalN;
  }

  private calcularAporteTotalP(fertilizaciones: IFertilizacion[]) {
    let aporteTotalP = 0;
    for (const f of fertilizaciones) {
      for (const linea of getLineasFertilizacion(f)) {
        aporteTotalP +=
          (Number(linea.dosisKgHa || 0) *
            Number(linea.fertilizante?.porcentajeP || 0)) /
          100;
      }
    }
    return aporteTotalP;
  }

  private calcularExtraccionNxTn(siembra: ISiembra) {
    const cultivo = siembra.semilla?.cultivo;
    return (EXTRACCION_N[cultivo] * siembra.rendimientoObtenidoKgHaSeco) / 1000;
  }

  private calcularExtraccionPxTn(siembra: ISiembra) {
    const cultivo = siembra.semilla?.cultivo;
    return (EXTRACCION_P[cultivo] * siembra.rendimientoObtenidoKgHaSeco) / 1000;
  }

  private async HHGFertilizantes(siembra: ISiembra, lote: ILote) {
    const potencialP: number = this.calcularPotencialTotalP(siembra, lote);
    const potencialN: number = this.calcularPotencialTotalN(siembra, lote);
    console.debug('Potencial Total N:', potencialN);
    console.debug('Potencial Total P:', potencialP);

    const desde = new Date(siembra.fechaSiembra);
    desde.setDate(desde.getDate() - 30);
    const fertilizaciones =
      await this.fertilizacionsService.getByIdLoteAndFechasInternal(
        siembra.idLote,
        desde.toISOString(),
        siembra.fechaCosecha,
      );
    console.debug('Fertilizaciones:', fertilizaciones?.length);

    const aporteTotalN = this.calcularAporteTotalN(fertilizaciones);
    const aporteTotalP = this.calcularAporteTotalP(fertilizaciones);
    console.debug('Aporte Total N:', aporteTotalN);
    console.debug('Aporte Total P:', aporteTotalP);

    const extracionNxTn = this.calcularExtraccionNxTn(siembra);
    const extracionNxTp = this.calcularExtraccionPxTn(siembra);
    console.debug('Extraccion NxTn:', extracionNxTn);
    console.debug('Extraccion PxTn:', extracionNxTp);

    const saldoN = aporteTotalN - extracionNxTn;
    const saldoP = aporteTotalP - extracionNxTp;
    console.debug('Saldo N:', saldoN);
    console.debug('Saldo P:', saldoP);

    const excedenteN = (saldoN * potencialN) / 100;
    const excedenteP = (saldoP * potencialP) / 100;
    console.debug('Excedente N:', excedenteN);
    console.debug('Excedente P:', excedenteP);

    const CONST_N = 35;
    const CONST_P = 4;

    const LtHaN = (excedenteN / CONST_N) * 1000;
    const LtHaP = (excedenteP / CONST_P) * 1000;
    console.debug('Litros por Ha N:', LtHaN);
    console.debug('Litros por Ha P:', LtHaP);

    const LtKgN = (LtHaN / siembra.rendimientoObtenidoKgHaSeco) * 1000;
    const LtKgP = (LtHaP / siembra.rendimientoObtenidoKgHaSeco) * 1000;
    console.debug('Litros por Kg N:', LtKgN);
    console.debug('Litros por Kg P:', LtKgP);

    const LtKgTotal = LtKgN + LtKgP;
    return LtKgTotal;
  }

  // FUMIGACION
  private calcularPotencialTotalCPP(
    siembra: ISiembra,
    lote: ILote,
    fumigacion: IFumigacion,
  ) {
    let suma = 0;
    suma += fumigacion.principioActivo?.koc * PESOS_CPP.koc;
    suma +=
      fumigacion.principioActivo?.persistencia *
      PESOS_CPP.persistenciaEscorrentia;
    suma +=
      fumigacion.principioActivo?.persistencia *
      PESOS_CPP.persistenciaLixiviacion;
    suma +=
      EQ.texturaLixiviacion[lote.texturaLixiviacion] *
      PESOS_CPP.texturaLixiviacion;
    suma +=
      EQ.texturaEscorrentia[lote.texturaEscorrentia] *
      PESOS_CPP.texturaEscorrentia;
    suma +=
      EQ.materiaOrganica[siembra.materiaOrganica] * PESOS_CPP.materiaOrganica;
    suma +=
      EQ.intensidadLluvias[siembra.intensidadLluvias] *
      PESOS_CPP.intensidadLluvias;
    suma +=
      EQ.lluviasPromedio[siembra.lluviasPromedio] * PESOS_CPP.lluviasPromedio;
    suma +=
      EQ.manejoAgronomico[siembra.manejoAgronomico] *
      PESOS_CPP.manejoAgronomico;
    return suma;
  }

  private async HHGFumigaciones(
    siembra: ISiembra,
    lote: ILote,
    permiso: IPermiso,
  ) {
    const res = await this.fumigacionsService.getByIdSiembra(
      siembra._id,
      permiso,
    );
    const fumigaciones = res.datos;
    console.debug('Fumigaciones:', fumigaciones?.length);

    let sumaHhIa = 0;
    for (const f of fumigaciones) {
      for (const linea of getLineasFumigacion(f)) {
        const producto = { ...f, ...linea } as IFumigacion;
        const potencialCPP: number = this.calcularPotencialTotalCPP(
          siembra,
          lote,
          producto,
        );
        const IaHa =
          (Number(linea.dosisLtHa || 0) * Number(linea.concentracion || 0)) /
          100;
        sumaHhIa += IaHa * potencialCPP;
      }
    }

    console.debug('Suma HHG Ia:', sumaHhIa);

    const total = sumaHhIa / 0.0005 / siembra.rendimientoObtenidoKgHaSeco;
    return total;
  }

  // HUELLA HIDRICA VERDE y AZUL

  private getStages(cultivo: Cultivo, crono: ICrono): Stage[] {
    const stagesMaiz: Stage[] = [
      { name: 'Siembra', kcProm: 0.1, days: 0 },
      { name: 'siembra_emergencia', kcProm: 0.175, days: 0 },
      // { name: 'V4', kcProm: 0.425, days: 38 },
      // { name: 'V8', kcProm: 0.825, days: 56 },
      // { name: 'V12', kcProm: 0.94, days: 63 },
      // { name: 'VT', kcProm: 1.06, days: 71 },
      { name: 'emergencia_floracion', kcProm: 1.2, days: 76 },
      // { name: 'R2', kcProm: 1.15, days: 84 },
      // { name: 'R3', kcProm: 1.05, days: 93 },
      // { name: 'R4', kcProm: 0.9, days: 105 },
      // { name: 'R5', kcProm: 0.725, days: 112 },
      // { name: 'R6', kcProm: 0.35, days: 118 },
      { name: 'floracion_madurez', kcProm: 0.125, days: 160 },
    ];
    const stagesSoja: Stage[] = [
      { name: 'Siembra', kcProm: 0.1, days: 0 },
      { name: 'siembra_emergencia', kcProm: 0.4, days: 0 },
      // { name: 'V4', kcProm: 0.5, days: 11 },
      // { name: 'V8', kcProm: 0.75, days: 22 },
      // { name: 'V12', kcProm: 0.95, days: 33 },
      { name: 'emergencia_R1', kcProm: 1.05, days: 44 },
      // { name: 'R2', kcProm: 1.16, days: 51 },
      { name: 'R1_R3', kcProm: 1.02, days: 66 },
      // { name: 'R4', kcProm: 0.9, days: 70 },
      { name: 'R3_R5', kcProm: 0.85, days: 80 },
      // { name: 'R6', kcProm: 0.65, days: 92 },
      { name: 'R5_R7', kcProm: 0.4, days: 118 },
    ];
    const stagesTrigo: Stage[] = [
      { name: 'Siembra', kcProm: 0.1, days: 0 }, // Siembra
      { name: 'R0_R1', kcProm: 0.3, days: 0 }, // Emergencia
      { name: 'R1_R2', kcProm: 0.5, days: 0 }, // Espiguilla terminal
      { name: 'R2_R3', kcProm: 0.75, days: 0 }, // Hoja bandera
      { name: 'R3_R4', kcProm: 0.95, days: 0 }, // Espigazon
      { name: 'R4_R5', kcProm: 1.15, days: 0 }, // Antesis
      { name: 'R5_R6', kcProm: 0.9, days: 0 }, // Llenado de granos
      { name: 'R6_R7', kcProm: 0.4, days: 0 }, // Madurez fisiologica
    ];

    if (cultivo === 'Trigo') {
      const etapas = crono.etapas as IEtapasTrigo;
      let tiempoAcumulado = etapas.R0_R1;
      stagesTrigo[1].days = tiempoAcumulado;
      for (let i = 2; i < stagesTrigo.length; i++) {
        const stage = stagesTrigo[i];
        const tiempoEtapa = etapas[stage.name] as number;
        tiempoAcumulado += tiempoEtapa;
        stage.days = tiempoAcumulado;
      }
      return stagesTrigo;
    }

    if (cultivo === 'Maiz') {
      const etapas = crono.etapas as IEtapasMaiz;
      let tiempoAcumulado = etapas.emergencia_floracion;
      stagesMaiz[1].days = tiempoAcumulado;
      for (let i = 2; i < stagesMaiz.length; i++) {
        const stage = stagesMaiz[i];
        const tiempoEtapa = etapas[stage.name] as number;
        tiempoAcumulado += tiempoEtapa;
        stage.days = tiempoAcumulado;
      }
      return stagesMaiz;
    }

    if (cultivo === 'Soja') {
      const etapas = crono.etapas as IEtapasSoja;
      let tiempoAcumulado = etapas.siembra_emergencia;
      stagesSoja[1].days = tiempoAcumulado;
      for (let i = 2; i < stagesSoja.length; i++) {
        const stage = stagesSoja[i];
        const tiempoEtapa = etapas[stage.name] as number;
        tiempoAcumulado += tiempoEtapa;
        stage.days = tiempoAcumulado;
      }
      return stagesSoja;
    }

    return this.getGenericStages(crono);
  }

  private getGenericStages(crono: ICrono): Stage[] {
    const etapas = (crono?.etapas || {}) as Record<string, number>;
    const keys = Object.keys(etapas);
    const stages: Stage[] = [{ name: 'Inicio', kcProm: 0.35, days: 0 }];
    let acumulado = 0;

    for (const key of keys) {
      acumulado += Number(etapas[key] || 0);
      stages.push({
        name: key,
        kcProm: 0.75,
        days: acumulado,
      });
    }

    return stages.length > 1
      ? stages
      : [{ name: 'Inicio', kcProm: 0.5, days: 0 }];
  }

  private getKc(diasDesdeSiembra: number, cultivo: Cultivo, crono: ICrono) {
    const stages = this.getStages(cultivo, crono);
    if (diasDesdeSiembra === 0) {
      console.debug('Etapas:', stages);
    }

    // Si los días están fuera del rango, devuelve el valor más cercano
    if (diasDesdeSiembra <= stages[0].days) return stages[0].kcProm;
    if (diasDesdeSiembra >= stages[stages.length - 1].days)
      return stages[stages.length - 1].kcProm;

    // Buscar los estadios entre los que cae la cantidad de días
    for (let i = 0; i < stages.length - 1; i++) {
      const currentStage = stages[i];
      const nextStage = stages[i + 1];

      if (
        diasDesdeSiembra >= currentStage.days &&
        diasDesdeSiembra <= nextStage.days
      ) {
        // Interpolación lineal para estimar el Kc Prom
        const proportion =
          (diasDesdeSiembra - currentStage.days) /
          (nextStage.days - currentStage.days);

        const suma = proportion * (nextStage.kcProm - currentStage.kcProm);
        const result = currentStage.kcProm + suma;
        return +result.toFixed(2);
      }
    }

    // Si no se encuentra, devolver 0 por seguridad
    return 0;
  }

  private calcularETC(
    siembra: ISiembra,
    clima: IClimaEstacionMeteorologica,
    diaDesdeSiembra: number,
    crono: ICrono,
  ) {
    const cultivo = siembra.semilla?.cultivo;
    // const crono = await this.cronosService.getById(siembra.idCrono);
    const kc = this.getKc(diaDesdeSiembra, cultivo, crono);
    const et0Dia = clima.et0?.result || 0;
    return kc * et0Dia;
  }

  private getPendiente(lote: ILote) {
    switch (lote.erosionEscorrentiaPendiente) {
      case 'Baja (0 - 3%)':
        return 0.015;
      case 'Moderada (3 - 8%)':
        return 0.055;
      case 'Alta (8 - 15%)':
        return 0.115;
      case 'Muy Alta (> 15%)':
        return 0.15;
    }
  }

  private getFactorTextura(lote: ILote) {
    switch (lote.texturaEscorrentia) {
      case 'Arcilloso':
        return 0.8;
      case 'Franco arcilloso':
        return 0.8;
      case 'Franco limoso':
        return 0.82;
      case 'Limoso':
        return 0.82;
      case 'Franco':
        return 0.85;
      case 'Franco arenoso':
        return 0.8;
      case 'Arenoso':
        return 0.7;
    }
  }

  private getFactorCobertura(siembra: ISiembra) {
    switch (siembra.labranza) {
      case 'Siembra Directa':
        return 0.95;
      case 'Convencional':
        return 0.7;
      case 'Labranza':
        return 0.95;
      case 'Reducida':
        return 0.8;
    }
  }

  private calcularLluviasEfectivas(
    siembra: ISiembra,
    lote: ILote,
    clima: IClimaEstacionMeteorologica,
  ) {
    const lluvia = clima.lluvia?.sum || 0;
    const intensidad = lluvia > 20 ? 0.7 : lluvia > 10 ? 0.8 : 0.9;
    const pendiente = this.getPendiente(lote);
    const factorPendiente = 1 - pendiente;
    const factorTextura = this.getFactorTextura(lote);
    const factorCobertura = this.getFactorCobertura(siembra);
    const llEfectivaPorc =
      intensidad * factorPendiente * factorTextura * factorCobertura;
    const llEfectivaMM = lluvia * llEfectivaPorc;
    return llEfectivaMM;
  }

  private async HHVerdeYAzul(siembra: ISiembra, lote: ILote) {
    const clima = await this.climaService.getClimaEntreFechas(
      lote.ubicacion?.centro?.lat,
      lote.ubicacion?.centro?.lng,
      siembra.fechaSiembra,
      siembra.fechaCosecha,
    );
    console.debug('Clima:', clima?.length);

    let ETVerde = 0;
    let ETAzul = 0;
    const crono = siembra.crono;

    const promises = clima.map(async (diaClima, dia) => {
      const etc = await this.calcularETC(siembra, diaClima, dia, crono);
      const lluviasEfectivas = this.calcularLluviasEfectivas(
        siembra,
        lote,
        diaClima,
      );
      console.debug(`ETC día ${dia}:`, etc);
      console.debug(`Lluvias efectivas día ${dia}:`, lluviasEfectivas);
      const ETV = etc <= lluviasEfectivas ? etc : lluviasEfectivas;
      const ETA = etc - lluviasEfectivas > 0 ? etc - lluviasEfectivas : 0;
      console.debug(`ET Verde día ${dia}:`, ETV);
      console.debug(`ET Azul día ${dia}:`, ETA);
      return { ETV, ETA };
    });

    const results = await Promise.all(promises);

    results.forEach(({ ETV, ETA }) => {
      ETVerde += ETV;
      ETAzul += ETA;
    });

    console.debug('ET Verde total:', ETVerde);
    console.debug('ET Azul total:', ETAzul);

    const HHGVerde = (ETVerde * 10000) / siembra.rendimientoObtenidoKgHaSeco;
    const HHGAzul = (ETAzul * 10000) / siembra.rendimientoObtenidoKgHaSeco;

    return { HHGVerde, HHGAzul };
  }

  // Private

  private assertAdvisorReadOnly(permiso: IPermiso): void {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor supervisa la red; la gestion de campana corresponde al usuario productor',
      );
    }
  }

  private async actualizarPrediccion(idSiembra: string, permiso: IPermiso) {
    await this.prediccionsService.reconstruir(idSiembra, permiso);
  }

  private puedeVer(data: ISiembra, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return Boolean(data.idQuimica && data.idQuimica === permiso.idQuimica);
    }
    if (permiso.nivel === 'Distribuidor') {
      return Boolean(
        data.idDistribuidor && data.idDistribuidor === permiso.idDistribuidor,
      );
    }
    if (permiso.nivel === 'Productor') {
      return Boolean(
        data.idProductor && data.idProductor === permiso.idProductor,
      );
    }
    if (permiso.nivel === 'Establecimiento') {
      return Boolean(
        data.idEstablecimiento &&
        data.idEstablecimiento === permiso.idEstablecimiento,
      );
    }
    if (permiso.nivel === 'Asesor') {
      const establecimientos = establecimientosDelPermiso(permiso);
      return Boolean(
        data.idEstablecimiento &&
        establecimientos.includes(String(data.idEstablecimiento)) &&
        (!permiso.idLotes?.length ||
          permiso.idLotes.includes(String(data.idLote))),
      );
    }
    return false;
  }

  private tieneAlcancePersistido(data: ISiembra, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Quimica') return Boolean(data.idQuimica);
    if (permiso.nivel === 'Distribuidor') return Boolean(data.idDistribuidor);
    if (permiso.nivel === 'Productor') return Boolean(data.idProductor);
    if (permiso.nivel === 'Establecimiento') {
      return Boolean(data.idEstablecimiento);
    }
    if (permiso.nivel === 'Asesor') {
      return Boolean(data.idEstablecimiento && data.idLote);
    }
    return permiso.nivel === 'Admin';
  }

  private async ejecutarPipelineDecision(
    idSiembra: string,
    permiso: IPermiso,
    sincronizarClima: boolean,
    reemplazarPrediccion: boolean,
  ): Promise<void> {
    const key = String(idSiembra);
    const anterior = this.pipelinesDecision.get(key) || Promise.resolve();
    const actual: Promise<void> = anterior
      .catch((error) => {
        this.logger.error(
          `La ejecucion anterior del pipeline de decision fallo para ${key}: ${error?.message || error}`,
        );
      })
      .then(async () => {
        await this.repository.reprocesarAgrometeorologia(key, sincronizarClima);
        if (reemplazarPrediccion) {
          await this.actualizarPrediccion(key, permiso);
        } else {
          await this.crearPrediccion(key);
        }
        await this.prediccionsService.agroclima(key);
      })
      .finally(() => {
        if (this.pipelinesDecision.get(key) === actual) {
          this.pipelinesDecision.delete(key);
        }
      });
    this.pipelinesDecision.set(key, actual);
    return await actual;
  }

  private async encolarPipelineDecision(
    idSiembra: string,
    options: DecisionEnqueueOptions,
    permiso: IPermiso,
    reemplazarPrediccion: boolean,
  ): Promise<void> {
    if (this.decisionPipelineQueue) {
      await this.decisionPipelineQueue.enqueueForSowing(idSiembra, options);
      return;
    }

    // Compatibilidad exclusiva para pruebas unitarias que construyen el
    // servicio manualmente. En la aplicacion Nest el modulo durable siempre
    // provee DecisionPipelineQueueService.
    await this.ejecutarPipelineDecision(
      idSiembra,
      permiso,
      options.sincronizarClima,
      reemplazarPrediccion,
    );
  }

  private crearIdRegistroFenologico(): string {
    return `fen-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  private sinHistorialFenologicoGenerico<
    T extends ICreateSiembra | IUpdateSiembra,
  >(data: T): T {
    this.validarClavesPersistencia(data);
    const sanitized = { ...(data || {}) } as T & {
      registrosFenologicos?: unknown;
    };
    delete sanitized.registrosFenologicos;
    return sanitized;
  }

  private validarClavesPersistencia(value: unknown, path = 'siembra'): void {
    if (value === null || value === undefined || typeof value !== 'object') {
      return;
    }
    if (value instanceof Date) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.validarClavesPersistencia(item, `${path}[${index}]`),
      );
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        throw new BadRequestException(
          `La clave ${path}.${key} no esta permitida en una escritura de siembra.`,
        );
      }
      this.validarClavesPersistencia(nested, `${path}.${key}`);
    }
  }

  private normalizarObjetivosBiofix(
    tipoEvento: IRegistroFenologico['tipoEvento'],
    objetivos: IRegistroFenologico['objetivosBiofix'],
  ): TObjetivoBiofixFenologico[] | undefined {
    if (tipoEvento !== 'biofix') {
      return undefined;
    }
    if (!Array.isArray(objetivos) || objetivos.length === 0) {
      throw new BadRequestException(
        'Un biofix fenologico debe indicar al menos un objetivo biologico.',
      );
    }
    const invalidos = objetivos.filter(
      (objetivo) => !OBJETIVOS_BIOFIX_PERMITIDOS.has(objetivo),
    );
    if (invalidos.length) {
      throw new BadRequestException(
        `El biofix contiene objetivos no permitidos: ${[
          ...new Set(invalidos.map(String)),
        ].join(', ')}.`,
      );
    }
    return [...new Set(objetivos)];
  }

  private validarFechaRegistroFenologico(
    siembra: ISiembra,
    registro: IRegistroFenologico,
  ): string {
    if (!String(registro.etapa || '').trim()) {
      throw new BadRequestException('La etapa fenologica es obligatoria.');
    }
    const raw =
      registro.fechaInicioEtapa || registro.fecha || registro.fechaObservacion;
    const fecha = raw ? new Date(raw) : new Date();
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(
        'La fecha del registro fenologico no es valida.',
      );
    }
    const finHoy = new Date();
    finHoy.setHours(23, 59, 59, 999);
    if (fecha > finHoy) {
      throw new BadRequestException(
        'No se puede registrar una etapa fenologica futura.',
      );
    }
    const implantacion = siembra.fechaSiembra
      ? new Date(siembra.fechaSiembra)
      : undefined;
    if (
      implantacion &&
      !Number.isNaN(implantacion.getTime()) &&
      fecha < implantacion
    ) {
      throw new BadRequestException(
        'La etapa fenologica no puede comenzar antes de la implantacion.',
      );
    }
    const cosecha = siembra.fechaCosecha
      ? new Date(siembra.fechaCosecha)
      : undefined;
    if (cosecha && !Number.isNaN(cosecha.getTime()) && fecha > cosecha) {
      throw new BadRequestException(
        'La etapa fenologica no puede registrarse despues de la cosecha.',
      );
    }
    return fecha.toISOString();
  }

  private canonicalCultivo(cultivo?: string): string {
    const normalizado = (cultivo || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const cultivos: Record<string, string> = {
      trigo: 'Trigo',
      soja: 'Soja',
      maiz: 'Maiz',
      cebada: 'Cebada',
      arveja: 'Arveja',
      papa: 'Papa',
      vid: 'Vid',
      peral: 'Peral',
      pecan: 'Pecan',
      manzano: 'Manzano',
    };

    return cultivos[normalizado] || cultivo || '';
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<ISiembra> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ idDistribuidor: permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ idProductor: permiso.idProductor });
    }
    if (permiso.nivel === 'Establecimiento') {
      $and.push({ idEstablecimiento: permiso.idEstablecimiento });
    }
    if (permiso.nivel === 'Asesor') {
      $and.push({
        idEstablecimiento: { $in: establecimientosDelPermiso(permiso) },
      });
    }
    if (permiso.idLotes?.length) {
      $and.push({ idLote: { $in: permiso.idLotes } });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }

  private async getCrono(
    siembra: ICreateSiembra | IUpdateSiembra,
  ): Promise<ICrono | undefined> {
    const semilla = await this.semillasService.getById(siembra.idSemilla);
    const cultivo = semilla?.cultivo;
    const ciclo = semilla?.ciclo;
    const idDepartamento = siembra.idDepartamento;
    const diaSiembra = new Date(siembra.fechaSiembra).getDate();
    const mesSiembra = new Date(siembra.fechaSiembra).getMonth() + 1;
    const filtro = {
      ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
      idDepartamento,
      diaSiembra,
      mesSiembra,
      cultivo,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
    };
    const resp = await this.cronosService.get(query);
    if (resp.datos[0]) {
      return resp.datos[0];
    }

    const fallbackPorDepartamento: IQueryParam = {
      filter: JSON.stringify({
        ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
        idDepartamento,
        cultivo,
      }),
      limit: 1,
    };
    const porDepartamento = await this.cronosService.get(
      fallbackPorDepartamento,
    );
    if (porDepartamento.datos[0]) {
      return porDepartamento.datos[0];
    }

    const fallbackGenerico: IQueryParam = {
      filter: JSON.stringify({
        ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
        cultivo,
        idDepartamento: { $exists: false },
      }),
      limit: 1,
    };
    const generico = await this.cronosService.get(fallbackGenerico);
    return generico.datos[0];
  }
}
