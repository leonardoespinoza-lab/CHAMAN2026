import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  ILote,
  IListado,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
  IFilter,
  IReporteNDVI,
  IPermiso,
  IPrediccion,
  IFertilizacion,
  IFumigacion,
  ISiembra,
  IDispositivo,
  IFrioAcumulado,
  ISuelo,
  ISueloReferencia,
  IFrioTermicoCultivo,
  IRespuestaAgrometeorologiaSiembra,
  ISerieAgrometeorologicaDia,
  IRiesgoAgroclimatico,
  TTexturaSuelo,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
  ISueloInta,
  ICargaFitosanitaria,
  IFitosanitarioAplicacionResumen,
  IFitosanitarioRiesgoSanitario,
  TNivelCargaFitosanitaria,
  esCultivoPerenne,
  clasificarNivelRiesgoSanitario,
  esFechaPrediccionSanitariaReciente,
  esLecturaSanitariaOperativa,
  esPrediccionMalezasOperativa,
  esHuellaHidricaConsolidada,
  getEnfermedadPorId,
  getEtapasPerennesReferencia,
  IInteligenciaSueloLote,
  IEntradasAgronomicasSuelo,
  IUsuario,
  aplicarEntradasAgronomicasSuelo,
  obtenerRegistroFenologicoDecisorioEnFecha,
  SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT,
} from 'modelos/src';
import { CHAMAN_REPORT_LOGO_DATA_URI } from './chaman-report-logo';
import { HelperService } from '../../auxiliares/helper';
import { LotesRepository } from './repository';
import { EstablecimientosService } from '../establecimiento/service';
import { ReporteNDVIsService } from '../reporte-ndvis/service';
import { NdviKnownScene, NdviQueueService } from './ndvi-queue.service';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS, NDVI_SYNC_LIMIT } from '../../env';
import { ClimaService } from '../clima/service';
import { DecisionPipelineQueueService } from '../../auxiliares/decision-pipeline';
import {
  establecimientosDelPermiso,
  permisoPuedeVerLote,
} from '../../auxiliares/authorization/alcance-permiso';
import { renderHtmlToPdf } from './pdf-renderer';

interface IntaFeatureCollection {
  features?: {
    properties?: Record<string, any>;
  }[];
}

interface SueloIntaResponse {
  fuente: string;
  servicio: string;
  fechaConsulta: string;
  ubicacion: { lat: number; lng: number };
  encontrado: boolean;
  editable: true;
  confianza?: 'alta' | 'media' | 'baja';
  mensaje?: string;
  resumen?: Record<string, any>;
  sugerencias?: Partial<IUpdateLote>;
  raw?: Record<string, any>;
}

interface CertificadoDatos {
  lote: ILote;
  siembra?: ISiembra;
  soilAssessment?: IInteligenciaSueloLote | null;
  reportesNdvi: IReporteNDVI[];
  predicciones: IPrediccion[];
  fertilizaciones: IFertilizacion[];
  fumigaciones: IFumigacion[];
  cargaFitosanitaria: ICargaFitosanitaria;
  frio: CertificadoFrio;
  clima?: CertificadoClima;
  emisor?: IUsuario;
}

interface CertificadoClima {
  origen: 'canonico' | 'legacy';
  fuente: string;
  fuentes: string[];
  completitudPct: number;
  coberturaCampoPct?: number;
  sensores?: string[];
  ultimaObservacion?: string;
  versionCalculo?: string;
  periodo?: { desde: string; hasta: string };
  procesoTermico?: IRespuestaAgrometeorologiaSiembra['summary']['thermalProcess'];
  estadoParametros?: IRespuestaAgrometeorologiaSiembra['summary']['parametersStatus'];
  fuenteParametros?: string;
  advertencias: string[];
  requerimientoFrio?: IRespuestaAgrometeorologiaSiembra['summary']['coldRequirement'];
  acumulados: {
    lluvia?: number;
    gradosDia?: number;
    horasFrio?: number;
    unidadesFrioUtah?: number;
    porcionesFrio?: number;
    vernalizacion?: number;
  };
  requerimientos: {
    horasFrioObjetivo?: number;
    porcionesFrioObjetivo?: number;
    vernalizacionObjetivo?: number;
    temperaturaBaseGradosDia?: number;
  };
  riesgoHelada?: {
    nivel: 'bajo' | 'medio' | 'alto';
    dias: number;
    fechaCritica?: string;
    temperaturaMinima?: number;
    etapaFenologica?: string;
    umbralDanoLeveC?: number;
    umbralDanoSeveroC?: number;
    lectura?: string;
  };
  serie: Array<{
    fecha: string;
    temperaturaMin?: number;
    temperaturaMax?: number;
    lluvia?: number;
    horasFrio?: number;
    horasFrioAcumuladas?: number;
    unidadesUtah?: number;
    unidadesUtahAcumuladas?: number;
    porcionesFrio?: number;
    porcionesFrioAcumuladas?: number;
    gradosDia?: number;
    gradosDiaAcumulados?: number;
    esPronostico?: boolean;
  }>;
  lectura: string;
}

interface CertificadoFrio {
  aplica: boolean;
  fuente: string;
  titulo: string;
  detalle: string;
  lectura: string;
  acumulado?: IFrioAcumulado;
  dispositivo?: IDispositivo;
  objetivos: {
    horasFrio?: number;
    horasFrioEfectivas?: number;
    porcionesFrio?: number;
  };
}

interface CertificadoCalidadItem {
  modulo: string;
  fuente: string;
  confianza: string;
  score: number;
  ultimaActualizacion: string;
  lectura: string;
}

interface CertificadoNdviPunto {
  fechaIso: string;
  fecha: string;
  time: number;
  valor: number;
  delta?: number;
  diaCultivo?: number;
  etapa: string;
  etapaFuente: string;
  etapaConfirmada: boolean;
  coberturaValida?: number;
  coleccion: string;
  ndmi?: number;
  ndwi?: number;
  ndre?: number;
  savi?: number;
  evi?: number;
}

interface CertificadoEtapaSatelital {
  nombre: string;
  fuente: string;
  confirmada: boolean;
}

type CertificadoEstadoServicio =
  | 'con_dato'
  | 'sin_dato'
  | 'no_aplica'
  | 'no_consolidado';

interface CertificadoServicio {
  nombre: string;
  estado: CertificadoEstadoServicio;
  lectura: string;
  fuente: string;
}

const CERTIFICADO_TIMEOUT_DATOS_MS = 5_000;
const CERTIFICADO_TIMEOUT_CLIMA_MS = 12_000;

@Injectable()
export class LotesService {
  private readonly logger = new Logger(LotesService.name);

  constructor(
    private repository: LotesRepository,
    private establecimientosService: EstablecimientosService,
    private reportesNDVIsService: ReporteNDVIsService,
    private ndviQueue: NdviQueueService,
    private axios: AxiosService,
    private climaService: ClimaService,
    @Optional()
    private readonly decisionPipelineQueue?: DecisionPipelineQueueService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<ILote> {
    const data = await this.assertCanView(id, permiso);
    try {
      data.ubicacionAdministrativa =
        (await this.repository.getAdministrativeLocation(id)) as any;
    } catch (error) {
      this.logger.warn(
        `Ubicacion administrativa persistida no disponible para lote ${id}: ${error?.message || error}`,
      );
    }
    return data;
  }

  async getAdministrativeLocation(id: string, permiso: IPermiso) {
    await this.getById(id, permiso);
    return await this.repository.getAdministrativeLocation(id);
  }

  async resolveAdministrativeLocation(
    id: string,
    permiso: IPermiso,
    force = false,
  ) {
    await this.getById(id, permiso);
    return await this.repository.resolveAdministrativeLocation(id, force);
  }

  async getSoilIntelligence(
    id: string,
    permiso: IPermiso,
  ): Promise<IInteligenciaSueloLote | null> {
    await this.assertCanView(id, permiso);
    return this.repository.getSoilIntelligence(id);
  }

  async getSoilAgronomicInputs(
    id: string,
    permiso: IPermiso,
  ): Promise<IEntradasAgronomicasSuelo | null> {
    await this.assertCanView(id, permiso);
    return this.repository.getSoilAgronomicInputs(id);
  }

  async reprocessSoilIntelligence(
    id: string,
    permiso: IPermiso,
  ): Promise<IInteligenciaSueloLote> {
    await this.assertCanView(id, permiso);
    return this.repository.reprocessSoilIntelligence(id);
  }

  async get(filtro: IQueryParam, permiso: IPermiso): Promise<IListado<ILote>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async create(data: ICreateLote, permiso: IPermiso): Promise<ILote> {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor gestiona productores; los lotes los crea el usuario productor',
      );
    }
    data = this.withoutAutomaticDepartment(data);
    if (data.ubicacion?.poligono?.length) {
      data.ubicacion.geojson = {
        type: 'Polygon',
        coordinates: [HelperService.polyToGeojson(data.ubicacion.poligono)],
      };
    }
    if (!data.idEstablecimiento) {
      data.idEstablecimiento = permiso.idEstablecimiento;
    }
    const establecimiento = await this.establecimientosService.getById(
      data.idEstablecimiento,
      permiso,
    );
    data.idProductor = establecimiento.idProductor;
    data.idDistribuidor = establecimiento.idDistribuidor;
    data.idQuimica = establecimiento.idQuimica;
    (data as ICreateLote & { idTenant?: string }).idTenant =
      establecimiento.idTenant;
    (
      data as ICreateLote & { idAsesorPropietario?: string }
    ).idAsesorPropietario = establecimiento.idAsesorPropietario;
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException('No tiene permiso para crear este lote');
    }

    const lote = await this.repository.create(data);
    // Fire-and-forget: no bloquea la respuesta al cliente
    this.ndviQueue
      .enqueueLote(lote)
      .catch((err) =>
        this.logger.error(`Error encolando tarea NDVI: ${err.message}`),
      );
    return lote;
  }

  async update(
    id: string,
    data: IUpdateLote,
    permiso: IPermiso,
  ): Promise<ILote> {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor tiene acceso de supervision; la edicion corresponde al usuario productor',
      );
    }
    data = this.withoutAutomaticDepartment(data);
    const current = await this.getById(id, permiso);
    if (data.ubicacion?.poligono?.length) {
      data.ubicacion.geojson = {
        type: 'Polygon',
        coordinates: [HelperService.polyToGeojson(data.ubicacion.poligono)],
      };
    }

    if (data.idEstablecimiento) {
      const establecimiento = await this.establecimientosService.getById(
        data.idEstablecimiento,
        permiso,
      );
      data.idProductor = establecimiento.idProductor;
      data.idDistribuidor = establecimiento.idDistribuidor;
      data.idQuimica = establecimiento.idQuimica;
      (data as IUpdateLote & { idTenant?: string }).idTenant =
        establecimiento.idTenant;
      (
        data as IUpdateLote & { idAsesorPropietario?: string | null }
      ).idAsesorPropietario =
        String(establecimiento.idAsesorPropietario || '').trim() || null;
    }

    const updated = await this.repository.update(id, data);
    const changedFields = this.dependenciasAgrometeorologicas(data);
    if (changedFields.length) {
      if (this.decisionPipelineQueue) {
        await this.decisionPipelineQueue.enqueueForLot(id, {
          trigger: 'lote.science-updated',
          changedFields,
          sincronizarClima: changedFields.some((field) =>
            ['ubicacion', 'idEstablecimiento'].includes(field),
          ),
        });
      } else if (current.idSiembra) {
        await this.repository.reprocesarAgrometeorologia(current.idSiembra);
      }
    }
    return updated;
  }

  private dependenciasAgrometeorologicas(data: IUpdateLote): string[] {
    const keys = [
      'ubicacion',
      'suelos',
      'capacidadDeCampo',
      'puntoMarchitez',
      'sueloReferencia',
      'sueloProcedencia',
      'sueloConfirmadoPorUsuario',
      'sueloFechaConfirmacion',
      'aguaUtil',
      'idEstablecimiento',
      'idSondaSuelo',
      'idsDispositivo',
      'capacidadDeRiego',
    ];
    return keys.filter((key) =>
      Object.prototype.hasOwnProperty.call(data, key),
    );
  }

  private withoutAutomaticDepartment<T>(input: T): T {
    const data = { ...input } as T & Record<string, unknown>;
    delete data.idDepartamento;
    delete data.ubicacionDepartamentoLegado;
    delete data.idAsesorPropietario;
    delete data.idTenant;
    return data;
  }

  async delete(
    idLote: string,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<ILote> {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor tiene acceso de supervision; la eliminacion corresponde al usuario productor',
      );
    }
    await this.getById(idLote, permiso);
    // El lote y sus series historicas se conservan para auditoria.
    return await this.repository.delete(idLote, {
      archivadoPor: actor?.username || actor?._id || 'sistema',
      motivoArchivado: 'Lote archivado desde Chaman',
    });
  }

  async calcularCapacidadCampo(idSonda: string, fecha: string) {
    return await this.repository.calcularCapacidadCampo(idSonda, fecha);
  }

  async generarNdvi(id: string, permiso: IPermiso) {
    const lote = await this.getById(id, permiso);
    const ultimoReporte = await this.getUltimoReporteNdviReferencia(
      id,
      permiso,
    );
    const ultimaFechaImagen = ultimoReporte?.fecha || null;
    const reprocesarRender = this.debeReprocesarRenderSatelital(ultimoReporte);
    const encolado = await this.ndviQueue.enqueueLote(
      lote,
      ultimaFechaImagen,
      ultimoReporte?.coleccion || null,
      {
        forceRender: reprocesarRender,
        exactSceneDate: reprocesarRender,
        knownScenes: ultimoReporte?.knownScenes || [],
      },
    );
    return {
      encolado,
      ultimaFechaImagen,
      mensaje: encolado
        ? reprocesarRender
          ? 'Tarea NDVI satelital encolada para reprocesar la escala visual del ultimo reporte.'
          : 'Tarea NDVI satelital encolada. El reporte aparecera cuando el worker termine el procesamiento.'
        : 'No se pudo encolar NDVI. Verificar Redis, worker NDVI y poligono del lote.',
    };
  }

  async getNdviQueueStatus() {
    return await this.ndviQueue.getStatus();
  }

  async generarCertificado(
    id: string,
    permiso: IPermiso,
    emisor?: IUsuario,
  ): Promise<string> {
    const loteBase = await this.assertCanView(id, permiso);
    const [ubicacionAdministrativa, loteConSuelo] = await Promise.all([
      this.getFuenteCertificadoConLimite(
        'ubicacion administrativa',
        () => this.repository.getAdministrativeLocation(id),
        undefined,
        CERTIFICADO_TIMEOUT_DATOS_MS,
      ),
      this.getFuenteCertificadoConLimite(
        'entradas agronomicas de suelo',
        () => this.resolveLotWithSoilInputs(loteBase),
        loteBase,
        CERTIFICADO_TIMEOUT_DATOS_MS,
      ),
    ]);
    const lote = ubicacionAdministrativa
      ? ({ ...loteConSuelo, ubicacionAdministrativa } as ILote)
      : loteConSuelo;
    const siembra = lote.siembra;

    const [
      reportesNdvi,
      predicciones,
      fertilizaciones,
      fumigaciones,
      clima,
      soilAssessment,
    ] = await Promise.all([
      this.getFuenteCertificadoConLimite(
        'seguimiento satelital',
        () => this.getReportesNdviCertificado(id, permiso),
        [],
        CERTIFICADO_TIMEOUT_DATOS_MS,
      ),
      this.getFuenteCertificadoConLimite(
        'predicciones sanitarias',
        () =>
          this.getPrediccionesCertificado(
            siembra?._id,
            CERTIFICADO_TIMEOUT_DATOS_MS,
          ),
        [],
        CERTIFICADO_TIMEOUT_DATOS_MS,
      ),
      this.getFuenteCertificadoConLimite(
        'fertilizaciones',
        () =>
          this.getFertilizacionesCertificado(
            id,
            siembra,
            CERTIFICADO_TIMEOUT_DATOS_MS,
          ),
        [],
        CERTIFICADO_TIMEOUT_DATOS_MS,
      ),
      this.getFuenteCertificadoConLimite(
        'aplicaciones',
        () =>
          this.getFumigacionesCertificado(
            siembra?._id,
            CERTIFICADO_TIMEOUT_DATOS_MS,
          ),
        [],
        CERTIFICADO_TIMEOUT_DATOS_MS,
      ),
      this.getFuenteCertificadoConLimite(
        'clima historico',
        () => this.getClimaCertificado(lote, siembra),
        undefined,
        CERTIFICADO_TIMEOUT_CLIMA_MS,
      ),
      this.getFuenteCertificadoConLimite(
        'inteligencia de suelo',
        () => this.getSoilIntelligenceCertificado(id),
        null,
        CERTIFICADO_TIMEOUT_DATOS_MS,
      ),
    ]);
    const cargaFitosanitaria = this.calcularCargaFitosanitaria(
      lote,
      siembra,
      predicciones,
      fumigaciones,
    );

    return this.renderCertificadoHtml({
      lote,
      siembra,
      soilAssessment,
      reportesNdvi,
      predicciones,
      fertilizaciones,
      fumigaciones,
      cargaFitosanitaria,
      frio: this.getFrioCertificado(lote, siembra, clima),
      clima,
      emisor,
    });
  }

  async getCargaFitosanitaria(
    id: string,
    permiso: IPermiso,
  ): Promise<ICargaFitosanitaria> {
    const lote = await this.getById(id, permiso);
    const siembra = await this.getSiembraFitosanitaria(lote);
    const [predicciones, fumigaciones] = await Promise.all([
      this.getPrediccionesCertificado(siembra?._id),
      this.getFumigacionesFitosanitarias(siembra?._id),
    ]);
    return this.calcularCargaFitosanitaria(
      lote,
      siembra,
      predicciones,
      fumigaciones,
    );
  }

  async sincronizarNdviAutomatico(): Promise<{
    total: number;
    encolados: number;
    omitidos: number;
    legacy: {
      total: number;
      encolados: number;
      omitidos: number;
      lotesUnicos: number;
    };
    normal: {
      total: number;
      encolados: number;
      omitidos: number;
    };
  }> {
    const permisoSistema: IPermiso = { nivel: 'Admin', rol: 'Admin' };
    const legacy = await this.normalizarNdviLegacy(
      Math.max(NDVI_SYNC_LIMIT, 1000),
    );
    const normalLimit = Math.max(0, NDVI_SYNC_LIMIT - legacy.encolados);

    if (normalLimit <= 0) {
      return {
        total: legacy.total,
        encolados: legacy.encolados,
        omitidos: legacy.omitidos,
        legacy,
        normal: { total: 0, encolados: 0, omitidos: 0 },
      };
    }

    const query: IQueryParam = {
      filter: JSON.stringify({
        idSiembra: { $exists: true, $ne: null },
        'ubicacion.geojson.coordinates.0': { $exists: true },
      }),
      limit: normalLimit,
      sort: 'nombre',
    };
    const lotes = await this.repository.get(query);
    let encolados = 0;
    let omitidos = 0;

    for (const lote of lotes.datos || []) {
      try {
        const ultimoReporte = await this.getUltimoReporteNdviReferencia(
          lote._id,
          permisoSistema,
        );
        const encolado = await this.ndviQueue.enqueueLote(
          lote,
          ultimoReporte?.fecha || null,
          ultimoReporte?.coleccion || null,
          {
            forceRender: this.debeReprocesarRenderSatelital(ultimoReporte),
            exactSceneDate: this.debeReprocesarRenderSatelital(ultimoReporte),
            knownScenes: ultimoReporte?.knownScenes || [],
          },
        );
        if (encolado) {
          encolados++;
        } else {
          omitidos++;
        }
      } catch (error) {
        omitidos++;
        this.logger.error(
          `Error encolando satelite automatico para lote ${lote._id}: ${error?.message || error}`,
        );
      }
    }

    return {
      total: legacy.total + (lotes.totalCount || lotes.datos?.length || 0),
      encolados: legacy.encolados + encolados,
      omitidos: legacy.omitidos + omitidos,
      legacy,
      normal: {
        total: lotes.totalCount || lotes.datos?.length || 0,
        encolados,
        omitidos,
      },
    };
  }

  async normalizarNdviLegacy(limit = NDVI_SYNC_LIMIT): Promise<{
    total: number;
    encolados: number;
    omitidos: number;
    lotesUnicos: number;
  }> {
    const permisoSistema: IPermiso = { nivel: 'Admin', rol: 'Admin' };
    const query: IQueryParam = {
      filter: JSON.stringify({
        idLote: { $exists: true, $ne: null },
        fechaDeLaImagen: { $exists: true, $ne: null },
        'metadataImagen.renderVersion': { $ne: 'fixed-index-v3' },
      }),
      limit: Math.max(1, Math.min(Number(limit) || NDVI_SYNC_LIMIT, 1000)),
      sort: '-fechaDeLaImagen',
    };
    const reportes = await this.reportesNDVIsService.get(query, permisoSistema);
    const vistos = new Set<string>();
    const lotesUnicos = new Set<string>();
    const ultimaFechaFixedPorLote = new Map<string, Promise<string | null>>();
    let encolados = 0;
    let omitidos = 0;

    for (const reporte of reportes.datos || []) {
      try {
        const idLote = `${reporte.idLote || ''}`;
        const fecha = this.toIsoString(
          reporte.fechaDeLaImagen || reporte.fechaCreacion,
        );
        if (!idLote || !fecha) {
          omitidos++;
          continue;
        }

        const clave = `${idLote}:${fecha.slice(0, 10)}`;
        if (vistos.has(clave)) {
          continue;
        }
        vistos.add(clave);
        lotesUnicos.add(idLote);

        let ultimaFechaFixed = ultimaFechaFixedPorLote.get(idLote);
        if (!ultimaFechaFixed) {
          ultimaFechaFixed = this.getUltimaFechaNdviFixed(
            idLote,
            permisoSistema,
          );
          ultimaFechaFixedPorLote.set(idLote, ultimaFechaFixed);
        }
        const fechaFixed = await ultimaFechaFixed;
        if (
          fechaFixed &&
          new Date(fechaFixed).getTime() >= new Date(fecha).getTime()
        ) {
          omitidos++;
          continue;
        }

        const lote = await this.repository.getById(idLote);
        const encolado = await this.ndviQueue.enqueueLote(
          lote,
          fecha,
          reporte.coleccion || null,
          {
            forceRender: true,
            exactSceneDate: true,
          },
        );
        if (encolado) {
          encolados++;
        } else {
          omitidos++;
        }
      } catch (error) {
        omitidos++;
        this.logger.error(
          `Error normalizando reporte satelital legacy ${reporte?._id || ''}: ${error?.message || error}`,
        );
      }
    }

    return {
      total: reportes.totalCount || reportes.datos?.length || 0,
      encolados,
      omitidos,
      lotesUnicos: lotesUnicos.size,
    };
  }

  async getSueloInta(
    latParam: string | number,
    lngParam: string | number,
  ): Promise<SueloIntaResponse> {
    const lat = Number(latParam);
    const lng = Number(lngParam);
    const base = this.crearRespuestaSueloInta(lat, lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('Latitud y longitud invalidas');
    }

    const local = await this.consultarSueloIntaLocal(lat, lng);
    if (local?.properties) {
      return this.crearRespuestaSueloIntaEncontrada(local.properties, {
        ...base,
        fuente: local.fuente || base.fuente,
        servicio: 'sdc-datos/suelos_inta',
      });
    }

    try {
      const delta = 0.0001;
      const response = await this.axios.GET<IntaFeatureCollection>(
        'https://geo-backend.inta.gob.ar/geoserver/ows',
        {
          timeout: 12000,
          params: {
            service: 'WFS',
            version: '2.0.0',
            request: 'GetFeature',
            typeNames: 'geonode:suelos_argentina_1_500',
            outputFormat: 'application/json',
            srsName: 'EPSG:4326',
            count: 3,
            bbox: `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`,
          },
        },
      );

      const properties = response?.features?.[0]?.properties;
      if (!properties) {
        return {
          ...base,
          mensaje:
            'INTA no devolvio una unidad de suelo para esta ubicacion. Los campos quedan editables.',
        };
      }

      return this.crearRespuestaSueloIntaEncontrada(properties, base);
    } catch (error) {
      this.logger.error(
        `Error consultando suelo INTA: ${error?.message || error}`,
      );
      return {
        ...base,
        mensaje:
          'No se pudo consultar INTA en este momento. Los campos quedan editables.',
      };
    }
  }

  // Private

  private async resolveLotWithSoilInputs(lote: ILote): Promise<ILote> {
    if (!lote?._id) return aplicarEntradasAgronomicasSuelo(lote, null);
    try {
      const inputs = await this.repository.getSoilAgronomicInputs(lote._id);
      return aplicarEntradasAgronomicasSuelo(lote, inputs);
    } catch (error) {
      this.logger.warn(
        `Entradas edaficas no disponibles para el informe del lote ${lote._id}; se conserva el perfil operativo previo: ${error?.message || error}`,
      );
      return aplicarEntradasAgronomicasSuelo(lote, null);
    }
  }

  private async getSoilIntelligenceCertificado(
    idLote: string,
  ): Promise<IInteligenciaSueloLote | null> {
    try {
      return await this.repository.getSoilIntelligence(idLote);
    } catch (error) {
      this.logger.warn(
        `Inteligencia de suelo no disponible para el informe del lote ${idLote}: ${error?.message || error}`,
      );
      return null;
    }
  }

  private async assertCanView(id: string, permiso: IPermiso): Promise<ILote> {
    const data = await this.repository.getById(id);
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException('No tiene permiso para ver este lote');
    }
    return data;
  }

  private async getSiembraFitosanitaria(
    lote: ILote,
  ): Promise<ISiembra | undefined> {
    if (lote.siembra?._id || lote.siembra?.fechaSiembra) {
      return lote.siembra;
    }
    if (!lote.idSiembra) {
      return undefined;
    }
    try {
      return await this.axios.GET<ISiembra>(
        `${API_DATOS}/siembras/${lote.idSiembra}`,
        {
          params: {
            populate: JSON.stringify([{ path: 'semilla' }, { path: 'crono' }]),
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo obtener siembra para carga fitosanitaria: ${error?.message || error}`,
      );
      return undefined;
    }
  }

  private async getFumigacionesFitosanitarias(
    idSiembra?: string,
  ): Promise<IFumigacion[]> {
    if (!idSiembra) {
      return [];
    }
    return this.getListadoInterno<IFumigacion>(
      'fumigacions',
      { idSiembra },
      {
        limit: 0,
        sort: '-fechaFumigacion',
        populate: JSON.stringify([
          { path: 'agroquimico' },
          { path: 'principioActivo' },
        ]),
      },
    );
  }

  private calcularCargaFitosanitaria(
    lote: ILote,
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
    fumigaciones: IFumigacion[] = [],
  ): ICargaFitosanitaria {
    const prediccion = this.getPrediccionSanitariaReciente(
      siembra,
      predicciones,
    );
    const enfermedades = this.resumirEnfermedadesFitosanitarias(prediccion);
    const aplicaciones = fumigaciones.map((item) =>
      this.resumirAplicacionFitosanitaria(item),
    );
    const presionEnfermedades =
      this.calcularPresionEnfermedadesFitosanitarias(enfermedades);
    const cargaQuimica = this.limitarPorcentaje(
      aplicaciones.reduce((total, item) => total + item.aporte, 0),
    );
    const aplicacionesUltimos30Dias = aplicaciones.filter((item) =>
      this.estaEnUltimosDias(item.fecha, 30),
    ).length;
    const recenciaAplicaciones = this.limitarPorcentaje(
      aplicacionesUltimos30Dias * 25,
    );
    const tieneDatos = enfermedades.length > 0 || aplicaciones.length > 0;
    const score = tieneDatos
      ? Math.round(
          presionEnfermedades * 0.45 +
            cargaQuimica * 0.45 +
            recenciaAplicaciones * 0.1,
        )
      : 0;
    const nivel = tieneDatos
      ? this.getNivelCargaFitosanitaria(score)
      : 'sin_datos';
    const etapaActual = this.getEstadoFenologico(siembra, predicciones);

    return {
      loteId: lote._id,
      siembraId: siembra?._id,
      fechaCalculo: new Date().toISOString(),
      cultivo: siembra?.semilla?.cultivo,
      variedad: siembra?.semilla?.variedad,
      etapaActual,
      score,
      nivel,
      lectura: this.getLecturaCargaFitosanitaria(
        nivel,
        siembra?.semilla?.cultivo,
        etapaActual,
        enfermedades.length,
        aplicaciones.length,
      ),
      recomendacion: this.getRecomendacionCargaFitosanitaria(nivel, tieneDatos),
      presionEnfermedades,
      cargaQuimica,
      recenciaAplicaciones,
      aplicacionesTotales: aplicaciones.length,
      aplicacionesUltimos30Dias,
      enfermedadesMonitoreadas: enfermedades.length,
      factores: [
        {
          nombre: 'Presion sanitaria',
          valor: presionEnfermedades,
          peso: 45,
          detalle: `${enfermedades.length} enfermedad(es) con prediccion vigente.`,
        },
        {
          nombre: 'Carga de aplicaciones',
          valor: cargaQuimica,
          peso: 45,
          detalle: `${aplicaciones.length} fumigacion(es) registradas en la campana.`,
        },
        {
          nombre: 'Recencia operativa',
          valor: recenciaAplicaciones,
          peso: 10,
          detalle: `${aplicacionesUltimos30Dias} aplicacion(es) en los ultimos 30 dias.`,
        },
      ],
      aplicaciones,
      enfermedades,
      metodologia: [
        'Indicador tecnico orientativo de carga fitosanitaria por lote y campana.',
        'Integra prediccion sanitaria vigente, fumigaciones registradas, recencia e informacion disponible de principio activo.',
        'La lectura se contextualiza por cultivo, variedad y etapa fenologica operativa.',
        'No reemplaza diagnostico a campo, marbete vigente ni certificacion ambiental formal.',
      ],
      advertencias: this.getAdvertenciasCargaFitosanitaria(
        siembra,
        enfermedades,
        aplicaciones,
      ),
    };
  }

  private resumirEnfermedadesFitosanitarias(
    prediccion?: IPrediccion,
  ): IFitosanitarioRiesgoSanitario[] {
    return (prediccion?.enfermedades || [])
      .filter((item) => esLecturaSanitariaOperativa(item))
      .map((item) => {
        const resultado = this.normalizarResultadoFitosanitario(item.resultado);
        return {
          enfermedad: item.enfermedad,
          resultado,
          nivel: this.getNivelCargaFitosanitaria(resultado),
          variables: item.variables as Record<string, number>,
        };
      })
      .sort((a, b) => b.resultado - a.resultado);
  }

  private getPrediccionSanitariaReciente(
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
  ): IPrediccion | undefined {
    const candidatos = [
      ...predicciones,
      ...(siembra?.ultimaPrediccion ? [siembra.ultimaPrediccion] : []),
    ];
    return candidatos.find((item) =>
      esFechaPrediccionSanitariaReciente(item?.fechaPrediccion || item?.fecha),
    );
  }

  private getLecturasSanitariasOperativas(
    prediccion?: IPrediccion,
  ): NonNullable<IPrediccion['enfermedades']> {
    return (prediccion?.enfermedades || []).filter((item) =>
      esLecturaSanitariaOperativa(item),
    );
  }

  private getEstadoLecturaSanitaria(
    item: NonNullable<IPrediccion['enfermedades']>[number],
  ): string {
    if (esLecturaSanitariaOperativa(item)) return 'Operativo';
    if (item.estado && item.estado !== 'calculado') {
      return `No agregable: ${item.estado.replace('_', ' ')}`;
    }
    if (!Number.isFinite(Number(item.resultado))) {
      return 'No agregable: resultado invalido';
    }
    if (['baja', 'sin_datos'].includes(item.calidadDatos?.nivel || '')) {
      return `No agregable: calidad ${item.calidadDatos?.nivel?.replace('_', ' ')}`;
    }
    if (
      !item.resistenciaUsada?.estado ||
      item.resistenciaUsada.estado === 'desconocida'
    ) {
      return 'No agregable: resistencia sin trazabilidad';
    }
    if (item.modelo?.validacion && item.modelo.validacion !== 'operativo') {
      return `No agregable: modelo ${item.modelo.validacion.replace('_', ' ')}`;
    }
    return 'No agregable: version o trazabilidad no vigente';
  }

  private calcularPresionEnfermedadesFitosanitarias(
    enfermedades: IFitosanitarioRiesgoSanitario[],
  ): number {
    if (!enfermedades.length) {
      return 0;
    }
    const valores = enfermedades.map((item) => item.resultado);
    const max = Math.max(...valores);
    const promedio =
      valores.reduce((total, value) => total + value, 0) / valores.length;
    return this.redondearPorcentaje(max * 0.65 + promedio * 0.35);
  }

  private normalizarResultadoFitosanitario(value?: number): number {
    const numero = Number(value);
    if (!Number.isFinite(numero)) {
      return 0;
    }
    return this.redondearPorcentaje(numero);
  }

  private resumirAplicacionFitosanitaria(
    fumigacion: IFumigacion,
  ): IFitosanitarioAplicacionResumen {
    const principio =
      fumigacion.principioActivo || fumigacion.agroquimico?.principioActivo;
    const tipo = this.compactar([
      fumigacion.agroquimico?.segmento,
      ...(fumigacion.agroquimico?.subsegmentos || []),
    ]).join(' / ');

    return {
      fecha: fumigacion.fechaFumigacion || fumigacion.fechaCreacion,
      producto:
        fumigacion.agroquimico?.nombre ||
        principio?.nombre ||
        fumigacion.idAgroquimico ||
        'Producto sin nombre',
      principioActivo: principio?.nombre,
      tipo: tipo || undefined,
      dosisLtHa: this.toNumber(fumigacion.dosisLtHa),
      concentracion: this.toNumber(fumigacion.concentracion),
      persistencia: this.toNumber(principio?.persistencia),
      koc: this.toNumber(principio?.koc),
      aporte: this.calcularAporteAplicacionFitosanitaria(fumigacion),
    };
  }

  private calcularAporteAplicacionFitosanitaria(
    fumigacion: IFumigacion,
  ): number {
    const principio =
      fumigacion.principioActivo || fumigacion.agroquimico?.principioActivo;
    const dosis = this.toNumber(fumigacion.dosisLtHa) || 0;
    const concentracion = this.toNumber(fumigacion.concentracion) || 0;
    const persistencia = this.toNumber(principio?.persistencia);
    const koc = this.toNumber(principio?.koc);
    let aporte = 10;

    aporte += Math.min(14, Math.max(0, dosis) * 4);
    aporte += Math.min(12, Math.max(0, concentracion) / 8);
    if (persistencia !== undefined) {
      aporte += Math.min(14, Math.max(0, persistencia) / 6);
    }
    if (koc !== undefined) {
      if (koc < 100) {
        aporte += 10;
      } else if (koc < 300) {
        aporte += 8;
      } else if (koc < 1000) {
        aporte += 5;
      } else {
        aporte += 2;
      }
    }
    if (this.aplicacionSigueActiva(fumigacion)) {
      aporte += 5;
    }

    aporte *= this.factorRecenciaAplicacion(fumigacion.fechaFumigacion);
    return Math.round(this.limitarPorcentaje(aporte, 45));
  }

  private factorRecenciaAplicacion(fecha?: string): number {
    const dias = this.getDiasDesdeFecha(fecha);
    if (dias === undefined) {
      return 1;
    }
    if (dias <= 7) {
      return 1.25;
    }
    if (dias <= 30) {
      return 1.15;
    }
    if (dias <= 60) {
      return 1.05;
    }
    return 1;
  }

  private aplicacionSigueActiva(fumigacion: IFumigacion): boolean {
    const fecha = fumigacion.fechaFumigacion;
    const duracion = this.toNumber(fumigacion.duracion);
    const dias = this.getDiasDesdeFecha(fecha);
    return dias !== undefined && duracion !== undefined && dias <= duracion;
  }

  private estaEnUltimosDias(
    fecha: string | undefined,
    diasMax: number,
  ): boolean {
    const dias = this.getDiasDesdeFecha(fecha);
    return dias !== undefined && dias <= diasMax;
  }

  private getDiasDesdeFecha(fecha?: string): number | undefined {
    if (!fecha) {
      return undefined;
    }
    const time = new Date(fecha).getTime();
    if (!Number.isFinite(time)) {
      return undefined;
    }
    return Math.max(0, Math.floor((Date.now() - time) / 86400000));
  }

  private getNivelCargaFitosanitaria(score: number): TNivelCargaFitosanitaria {
    if (score >= 85) {
      return 'critico';
    }
    if (score >= 65) {
      return 'alto';
    }
    if (score >= 35) {
      return 'medio';
    }
    return 'bajo';
  }

  private getLecturaCargaFitosanitaria(
    nivel: TNivelCargaFitosanitaria,
    cultivo?: string,
    etapa?: string,
    enfermedades = 0,
    aplicaciones = 0,
  ): string {
    const contexto = this.compactar([cultivo, etapa]).join(' en ') || 'Cultivo';
    if (nivel === 'sin_datos') {
      return `${contexto}: sin enfermedades ni fumigaciones registradas para estimar carga fitosanitaria.`;
    }
    if (nivel === 'critico') {
      return `${contexto}: carga fitosanitaria critica por presion sanitaria y/o intervenciones acumuladas.`;
    }
    if (nivel === 'alto') {
      return `${contexto}: carga alta; revisar recorridas, umbrales y secuencia de aplicaciones.`;
    }
    if (nivel === 'medio') {
      return `${contexto}: carga media con ${enfermedades} enfermedad(es) y ${aplicaciones} aplicacion(es) consideradas.`;
    }
    return `${contexto}: carga baja con los datos disponibles.`;
  }

  private getRecomendacionCargaFitosanitaria(
    nivel: TNivelCargaFitosanitaria,
    tieneDatos: boolean,
  ): string {
    if (!tieneDatos) {
      return 'Registrar monitoreos sanitarios y aplicaciones para construir trazabilidad por lote.';
    }
    if (nivel === 'critico' || nivel === 'alto') {
      return 'Priorizar auditoria tecnica: confirmar sintomas a campo, revisar productos, carencias, rotacion de modos de accion y justificacion de nuevas aplicaciones.';
    }
    if (nivel === 'medio') {
      return 'Mantener seguimiento semanal y validar que futuras intervenciones respondan a umbrales, fenologia y pronostico.';
    }
    return 'Continuar monitoreo preventivo y sostener el registro de aplicaciones con principio activo y dosis.';
  }

  private getAdvertenciasCargaFitosanitaria(
    siembra: ISiembra | undefined,
    enfermedades: IFitosanitarioRiesgoSanitario[],
    aplicaciones: IFitosanitarioAplicacionResumen[],
  ): string[] {
    const advertencias: string[] = [];
    if (!siembra?._id) {
      advertencias.push('No hay siembra o plantacion activa asociada al lote.');
    }
    if (!enfermedades.length) {
      advertencias.push('Sin prediccion sanitaria vigente para el cultivo.');
    }
    if (!aplicaciones.length) {
      advertencias.push('Sin fumigaciones registradas para la campana.');
    }
    if (
      aplicaciones.some(
        (item) =>
          !item.principioActivo ||
          item.persistencia === undefined ||
          item.koc === undefined,
      )
    ) {
      advertencias.push(
        'Hay aplicaciones con principio activo o parametros ambientales incompletos.',
      );
    }
    return advertencias;
  }

  private limitarPorcentaje(value: number, max = 100): number {
    const numero = Number(value);
    if (!Number.isFinite(numero)) {
      return 0;
    }
    return Math.max(0, Math.min(max, numero));
  }

  private redondearPorcentaje(value: number, decimales = 1): number {
    const factor = Math.pow(10, decimales);
    return Math.round(this.limitarPorcentaje(value) * factor) / factor;
  }

  private async getReportesNdviCertificado(
    idLote: string,
    permiso: IPermiso,
  ): Promise<IReporteNDVI[]> {
    try {
      const query: IQueryParam = {
        filter: JSON.stringify({ idLote }),
        limit: 8,
        sort: '-fechaDeLaImagen',
      };
      const response = await this.reportesNDVIsService.get(query, permiso);
      return response?.datos || [];
    } catch (error) {
      this.logger.warn(
        `No se pudieron obtener reportes satelitales para certificado: ${error?.message || error}`,
      );
      return [];
    }
  }

  private async getPrediccionesCertificado(
    idSiembra?: string,
    timeoutMs?: number,
  ): Promise<IPrediccion[]> {
    if (!idSiembra) {
      return [];
    }
    return this.getListadoInterno<IPrediccion>(
      'prediccions',
      { idSiembra },
      {
        limit: 5,
        sort: '-fechaPrediccion',
      },
      timeoutMs,
    );
  }

  private async getFertilizacionesCertificado(
    idLote: string,
    siembra?: ISiembra,
    timeoutMs?: number,
  ): Promise<IFertilizacion[]> {
    const ventana = this.getVentanaTemporalCultivo(siembra);
    const filter: Record<string, unknown> = { idLote };
    if (ventana) {
      const rango = {
        $gte: new Date(ventana.desde).toISOString(),
        $lte: new Date(ventana.hasta).toISOString(),
      };
      filter.$or = [
        { fechaFertilizacion: rango },
        {
          fechaFertilizacion: { $exists: false },
          fechaCreacion: rango,
        },
      ];
    }
    return this.getListadoInterno<IFertilizacion>(
      'fertilizacions',
      filter,
      {
        limit: 20,
        sort: '-fechaFertilizacion',
        populate: JSON.stringify({ path: 'fertilizante' }),
      },
      timeoutMs,
    );
  }

  private async getFumigacionesCertificado(
    idSiembra?: string,
    timeoutMs?: number,
  ): Promise<IFumigacion[]> {
    if (!idSiembra) {
      return [];
    }
    return this.getListadoInterno<IFumigacion>(
      'fumigacions',
      { idSiembra },
      {
        limit: 20,
        sort: '-fechaFumigacion',
        populate: JSON.stringify([
          { path: 'agroquimico' },
          { path: 'principioActivo' },
        ]),
      },
      timeoutMs,
    );
  }

  private async getClimaCertificado(
    lote: ILote,
    siembra?: ISiembra,
  ): Promise<CertificadoClima | undefined> {
    const centro = this.getCentroOperativo(lote);
    const idEstacionMeteorologica =
      lote.establecimiento?.idEstacionMeteorologica ||
      (lote.establecimiento?.estacionMeteorologica as any)?._id;

    const riesgoPromise = centro
      ? this.climaService.getRiesgosAgroclimaticos(
          centro.lat,
          centro.lng,
          siembra?.semilla?.cultivo,
          {
            variedad: siembra?.semilla?.variedad,
            fechaSiembra: siembra?.fechaSiembra,
            etapaFenologica: this.getEstadoFenologico(siembra, []),
            edadProductivaDesdeAnios:
              siembra?.semilla?.fenologiaReferencia?.edadProductivaDesdeAnios,
            ajusteVarietalC:
              siembra?.semilla?.sensibilidadHelada?.ajusteUmbralC,
            fuenteAjusteVarietal: siembra?.semilla?.sensibilidadHelada?.fuente,
            idEstacionMeteorologica,
          },
        )
      : Promise.resolve(undefined);

    if (siembra?._id) {
      const [canonicalResult, riskResult] = await Promise.allSettled([
        this.repository.getAgrometeorologia(siembra._id),
        riesgoPromise,
      ]);
      const canonical =
        canonicalResult.status === 'fulfilled'
          ? canonicalResult.value
          : undefined;
      const riesgo =
        riskResult.status === 'fulfilled'
          ? riskResult.value?.helada
          : undefined;

      if (this.hasCanonicalClimateData(canonical)) {
        return this.mapCanonicalClimate(canonical!, riesgo, siembra);
      }
      if (canonicalResult.status === 'rejected') {
        this.logger.warn(
          `No se pudo leer el motor agrometeorologico canonico para el certificado: ${canonicalResult.reason?.message || canonicalResult.reason}`,
        );
      }
    }

    this.logger.warn(
      `El certificado del lote ${String(lote._id || '')} no incluye clima: el motor canonico por siembra todavia no tiene una serie consolidada. El endpoint geografico legacy queda excluido porque no puede resolver sensores del lote ni calidad horaria.`,
    );
    return undefined;
  }

  private hasCanonicalClimateData(
    data?: IRespuestaAgrometeorologiaSiembra,
  ): boolean {
    if (!data) return false;
    const summary = data.summary || {};
    return !!(
      data.series?.length ||
      [
        summary.gddAccumulated,
        summary.rainAccumulatedMm,
        summary.chillingHoursAccumulated,
        summary.chillPortionsAccumulated,
        summary.vernalizationAccumulated,
      ].some((value) => Number.isFinite(value))
    );
  }

  private mapCanonicalClimate(
    data: IRespuestaAgrometeorologiaSiembra,
    riesgoHelada: IRiesgoAgroclimatico | undefined,
    siembra?: ISiembra,
  ): CertificadoClima {
    const source = data.dataSource;
    const sourceLabels = (source.sources || []).map((item) => {
      if (item === 'sensor') {
        return source.sensorNames?.length
          ? `Sensor ${source.sensorNames.join(', ')}`
          : 'Sensor de campo';
      }
      if (item === 'station') {
        return source.stationName || 'Central meteorologica';
      }
      return 'Open-Meteo';
    });
    const fuente =
      sourceLabels.join(' + ') ||
      (source.type === 'sensor'
        ? 'Sensor de campo'
        : source.type === 'station'
          ? source.stationName || 'Central meteorologica'
          : source.type === 'open_meteo'
            ? 'Open-Meteo'
            : 'Motor agrometeorologico Chaman');
    const requirement = data.summary.coldRequirement;
    const requirementValid =
      requirement?.status === 'validado' &&
      requirement.model !== 'sin_calibrar';

    return {
      origen: 'canonico',
      fuente,
      fuentes: sourceLabels.length ? sourceLabels : [fuente],
      completitudPct: this.limitarPorcentaje(
        source.completenessPercentage || 0,
      ),
      coberturaCampoPct: Number.isFinite(source.fieldCoveragePercentage)
        ? this.limitarPorcentaje(Number(source.fieldCoveragePercentage))
        : undefined,
      sensores: source.sensorNames,
      ultimaObservacion: source.lastObservationAt || source.lastCalculatedAt,
      versionCalculo: data.calculationVersion,
      periodo: data.series?.length
        ? {
            desde: data.series[0].date,
            hasta: data.series[data.series.length - 1].date,
          }
        : undefined,
      procesoTermico: data.summary.thermalProcess,
      estadoParametros: data.summary.parametersStatus,
      fuenteParametros: data.summary.parametersSource,
      advertencias: [...new Set(data.warnings || [])],
      requerimientoFrio: requirement,
      acumulados: {
        lluvia: data.summary.rainAccumulatedMm,
        gradosDia: data.summary.gddAccumulated,
        horasFrio: data.summary.chillingHoursAccumulated,
        unidadesFrioUtah: data.summary.utahChillUnitsAccumulated,
        porcionesFrio: data.summary.chillPortionsAccumulated,
        vernalizacion: data.summary.vernalizationAccumulated,
      },
      requerimientos: {
        horasFrioObjetivo:
          requirementValid && requirement?.model === 'HF'
            ? requirement.target
            : undefined,
        porcionesFrioObjetivo:
          requirementValid && requirement?.model === 'CP'
            ? requirement.target
            : undefined,
        vernalizacionObjetivo: data.summary.vernalizationRequirement,
        temperaturaBaseGradosDia:
          data.summary.gddBaseTemperatureC ??
          siembra?.semilla?.fenologiaReferencia?.temperaturaBaseC,
      },
      riesgoHelada: this.mapRiskFrost(riesgoHelada),
      serie: (data.series || []).map((item) =>
        this.mapCanonicalClimateDay(item),
      ),
      lectura: this.compactar([
        `Serie canonica ${data.calculationVersion}.`,
        source.type === 'mixed'
          ? 'Cada variable usa la mejor fuente disponible por intervalo.'
          : '',
        Number.isFinite(source.fieldCoveragePercentage)
          ? `Cobertura de temperatura de campo ${this.formatNumber(Number(source.fieldCoveragePercentage), 1)}%.`
          : '',
        requirement?.interpretation === 'datos_insuficientes'
          ? this.getLecturaRequisitoFrio(requirement)
          : requirement?.interpretation === 'compatible_requiere_confirmacion'
            ? 'El clima es compatible con el requisito varietal; la etapa requiere confirmacion a campo.'
            : requirement?.interpretation === 'sin_calibrar'
              ? 'Sin requisito varietal rector validado; no se declara cumplimiento biologico.'
              : '',
      ]).join(' '),
    };
  }

  private mapCanonicalClimateDay(
    item: ISerieAgrometeorologicaDia,
  ): CertificadoClima['serie'][number] {
    return {
      fecha: item.date,
      temperaturaMin:
        item.metrics.temperatureMinC ?? item.weather.temperatureMinC,
      temperaturaMax:
        item.metrics.temperatureMaxC ?? item.weather.temperatureMaxC,
      lluvia:
        item.metrics.precipitationMm ??
        item.weather.precipitationMm ??
        item.weather.rainMm,
      horasFrio: item.metrics.chillingHours,
      horasFrioAcumuladas: item.metrics.chillingHoursAccumulated,
      unidadesUtah: item.metrics.utahChillUnits,
      unidadesUtahAcumuladas: item.metrics.utahChillUnitsAccumulated,
      porcionesFrio: item.metrics.chillPortions,
      porcionesFrioAcumuladas: item.metrics.chillPortionsAccumulated,
      gradosDia: item.metrics.gddDaily,
      gradosDiaAcumulados: item.metrics.gddAccumulated,
      esPronostico: item.isForecast,
    };
  }

  private mapLegacyClimate(
    data: IFrioTermicoCultivo,
    riesgoHelada: IRiesgoAgroclimatico | undefined,
    siembra?: ISiembra,
  ): CertificadoClima {
    const req = siembra?.semilla?.requerimientoFrio;
    const validRequirement =
      req?.estado === 'validado' &&
      (req.modeloRector === 'HF' || req.modeloRector === 'CP') &&
      !!String(req.fuente || '').trim();
    const requirementTarget =
      validRequirement && req?.modeloRector === 'HF'
        ? this.toNumber(req.horasFrio)
        : validRequirement && req?.modeloRector === 'CP'
          ? this.toNumber(req.porcionesFrio)
          : undefined;
    const requirementAccumulated =
      validRequirement && req?.modeloRector === 'HF'
        ? this.toNumber(data.acumulados.horasFrio)
        : validRequirement && req?.modeloRector === 'CP'
          ? this.toNumber(data.acumulados.porcionesFrio)
          : undefined;
    return {
      origen: 'legacy',
      fuente: data.fuente,
      fuentes: [data.fuente],
      completitudPct: 45,
      versionCalculo: 'legacy-frio-termico',
      periodo: {
        desde: data.periodoFrio.desde,
        hasta: data.periodoFrio.hasta,
      },
      procesoTermico: esCultivoPerenne(siembra?.semilla?.cultivo)
        ? 'dormancia_perenne'
        : 'termico',
      estadoParametros: 'requiere_calibracion',
      fuenteParametros: 'Compatibilidad legacy; pendiente de serie canonica',
      advertencias: [
        'Informe generado con compatibilidad legacy porque el motor agrometeorologico canonico no tenia una serie disponible.',
        ...(data.calculo?.observaciones || []),
      ],
      requerimientoFrio: esCultivoPerenne(siembra?.semilla?.cultivo)
        ? {
            model: validRequirement
              ? (req?.modeloRector as 'HF' | 'CP')
              : 'sin_calibrar',
            status: validRequirement ? 'referencia' : 'requiere_calibracion',
            source: validRequirement ? req?.fuente : undefined,
            target: requirementTarget,
            accumulated: requirementAccumulated,
            coverageSufficient: false,
            continuitySufficient: false,
            interpretation: validRequirement
              ? 'datos_insuficientes'
              : 'sin_calibrar',
          }
        : undefined,
      acumulados: {
        lluvia: data.acumulados.lluvia,
        gradosDia: data.acumulados.gradosDia,
        horasFrio: esCultivoPerenne(siembra?.semilla?.cultivo)
          ? data.acumulados.horasFrio
          : undefined,
        porcionesFrio: esCultivoPerenne(siembra?.semilla?.cultivo)
          ? data.acumulados.porcionesFrio
          : undefined,
      },
      requerimientos: {
        horasFrioObjetivo:
          validRequirement && req?.modeloRector === 'HF'
            ? req.horasFrio
            : undefined,
        porcionesFrioObjetivo:
          validRequirement && req?.modeloRector === 'CP'
            ? req.porcionesFrio
            : undefined,
        temperaturaBaseGradosDia: data.requerimientos.temperaturaBaseGradosDia,
      },
      riesgoHelada: this.mapRiskFrost(riesgoHelada) || {
        ...data.riesgoHelada,
        lectura: 'Riesgo calculado por compatibilidad legacy.',
      },
      serie: (data.serie || []).map((item) => ({
        fecha: item.fecha,
        temperaturaMin: item.temperaturaMin,
        temperaturaMax: item.temperaturaMax,
        lluvia: item.lluvia,
        esPronostico: item.esPronostico,
      })),
      lectura:
        'Compatibilidad legacy de respaldo. No certifica CP ni cumplimiento varietal sin serie horaria canonica y metadatos validados.',
    };
  }

  private mapRiskFrost(
    risk?: IRiesgoAgroclimatico,
  ): CertificadoClima['riesgoHelada'] | undefined {
    if (!risk?.aplica) return undefined;
    const critical = risk.serie?.find(
      (item) => item.fecha === risk.fechaCritica,
    );
    return {
      nivel: risk.nivel,
      dias: risk.diasRiesgo,
      fechaCritica: risk.fechaCritica,
      temperaturaMinima: critical?.temperaturaMin,
      etapaFenologica: risk.etapaFenologica || critical?.etapaFenologica,
      umbralDanoLeveC: risk.umbralDanoLeveC,
      umbralDanoSeveroC: risk.umbralDanoSeveroC,
      lectura: risk.lectura,
    };
  }

  private async getListadoInterno<T>(
    recurso: string,
    filter: Record<string, unknown>,
    extraParams: Partial<IQueryParam> = {},
    timeoutMs?: number,
  ): Promise<T[]> {
    try {
      const response = await this.axios.GET<IListado<T>>(
        `${API_DATOS}/${recurso}`,
        {
          params: {
            ...extraParams,
            filter: JSON.stringify(filter),
          },
          ...(timeoutMs ? { timeout: timeoutMs } : {}),
        },
      );
      return response?.datos || [];
    } catch (error) {
      this.logger.warn(
        `No se pudieron obtener datos de ${recurso} para certificado: ${error?.message || error}`,
      );
      return [];
    }
  }

  private async getFuenteCertificadoConLimite<T>(
    fuente: string,
    obtener: () => Promise<T>,
    fallback: T,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
      timeoutHandle = setTimeout(() => {
        this.logger.warn(
          `La fuente ${fuente} supero ${timeoutMs} ms para el certificado; se informa sin dato.`,
        );
        resolve(fallback);
      }, timeoutMs);
    });

    try {
      return await Promise.race([obtener(), timeout]);
    } catch (error) {
      this.logger.warn(
        `La fuente ${fuente} fallo para el certificado; se informa sin dato: ${error?.message || error}`,
      );
      return fallback;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private getCentroOperativo(
    lote: ILote,
  ): { lat: number; lng: number } | undefined {
    const centro =
      lote.ubicacion?.centro ||
      lote.establecimiento?.ubicacion?.find((ubicacion) => ubicacion.centro)
        ?.centro;
    const lat = Number((centro as any)?.lat ?? (centro as any)?.latitude);
    const lng = Number(
      (centro as any)?.lng ??
        (centro as any)?.lon ??
        (centro as any)?.longitude,
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }
    return { lat, lng };
  }

  private renderCertificadoHtml(datos: CertificadoDatos): string {
    const {
      lote,
      siembra,
      reportesNdvi,
      predicciones,
      fertilizaciones,
      fumigaciones,
      cargaFitosanitaria,
      clima,
      soilAssessment,
      emisor,
    } = datos;
    const semilla = siembra?.semilla;
    const cultivo = semilla?.cultivo || 'Cultivo sin definir';
    const esPerenne = esCultivoPerenne(cultivo);
    const fechaInforme = this.formatDateTime(new Date().toISOString());
    const estado = siembra?.fechaCosecha
      ? 'Cierre de cosecha'
      : 'Seguimiento en curso';
    const etapa = this.getEstadoFenologico(siembra, predicciones);
    const riesgo = this.getResumenRiesgo(siembra, predicciones);
    const huella = this.getResumenHuella(lote, siembra);
    const frio = datos.frio;
    const pendientes = this.getPendientesCertificado(
      lote,
      siembra,
      predicciones,
      clima,
      soilAssessment,
    );
    const fenologia = this.getFenologiaItems(siembra);
    const lluviaAcumulada = this.formatClimaMetric(
      clima?.acumulados?.lluvia,
      'mm',
      1,
    );
    const helada = clima?.riesgoHelada?.nivel
      ? this.capitalize(clima.riesgoHelada.nivel)
      : 'Sin dato';

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Informe ejecutivo Chaman - ${this.escapeHtml(lote.nombre || 'lote')}</title>
  <style>
    @page { size: A4; margin: 9mm; }
    :root {
      --ink: #1f3047;
      --muted: #60708c;
      --line: #c7d7e8;
      --cyan: #2ed4ca;
      --green: #68be4a;
      --danger: #f04f45;
      --amber: #f59f22;
      --paper: #f7fafc;
      --dark: #132235;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #edf4f8;
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.34;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .page {
      width: 1120px;
      margin: 24px auto;
      background: white;
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(27, 48, 72, 0.14);
    }
    .hero {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      padding: 22px 26px;
      background:
        radial-gradient(circle at 15% 20%, rgba(46, 212, 202, 0.18), transparent 28%),
        linear-gradient(135deg, #ffffff 0%, #f6fbfd 45%, #e9f8f5 100%);
      border-bottom: 1px solid var(--line);
    }
    .brand { letter-spacing: 0; }
    .brand-logo {
      display: block;
      height: auto;
      margin: 0 0 10px;
      max-width: 210px;
      object-fit: contain;
      width: 54mm;
    }
    h1 {
      margin: 0;
      font-size: 27px;
      line-height: 1.05;
      font-weight: 800;
    }
    h2 {
      color: var(--cyan);
      font-size: 15px;
      margin: 0 0 6px;
      text-transform: uppercase;
    }
    h3 {
      margin: 0 0 6px;
      font-size: 14px;
    }
    .hero-meta {
      display: grid;
      gap: 7px;
      align-content: center;
    }
    .pill {
      display: inline-flex;
      width: max-content;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.75);
      font-weight: 700;
    }
    .issuer {
      display: grid;
      grid-template-columns: 54px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 10px 24px;
      border-bottom: 1px solid var(--line);
      background: #fbfefd;
    }
    .issuer-photo {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--cyan);
    }
    .issuer strong, .issuer span, .issuer small { display: block; }
    .issuer span, .issuer small { color: var(--muted); }
    .issuer-license { text-align: right; }
    .section {
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .grid.three { grid-template-columns: repeat(3, 1fr); }
    .card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
      background: linear-gradient(135deg, #fff, #f8fbfe);
      min-height: 68px;
    }
    .card span {
      display: block;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .card strong {
      display: block;
      font-size: 16px;
      line-height: 1.15;
    }
    .card small { color: var(--muted); }
    .executive-board {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-top: 10px;
    }
    .score-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
      background: #fff;
      min-height: 86px;
    }
    .score-card span {
      display: block;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .score-card strong {
      display: block;
      font-size: 18px;
      line-height: 1.1;
    }
    .score-card small {
      display: block;
      color: var(--muted);
      margin-top: 4px;
    }
    .score-meter {
      height: 9px;
      border-radius: 999px;
      background: #e9f1f8;
      overflow: hidden;
      margin-top: 7px;
    }
    .score-meter i {
      display: block;
      height: 100%;
      width: var(--value, 0%);
      border-radius: inherit;
      background: linear-gradient(90deg, var(--cyan), var(--green));
    }
    .score-card.warn .score-meter i { background: linear-gradient(90deg, #f7c35d, var(--amber)); }
    .score-card.danger .score-meter i { background: linear-gradient(90deg, #ff8b80, var(--danger)); }
    .score-row.warn .score-meter i { background: linear-gradient(90deg, #f7c35d, var(--amber)); }
    .score-row.danger .score-meter i { background: linear-gradient(90deg, #ff8b80, var(--danger)); }
    .action-panel {
      border: 1px solid rgba(46, 212, 202, 0.45);
      border-radius: 14px;
      padding: 10px 12px;
      background: linear-gradient(135deg, #f2fffd, #ffffff);
      margin-top: 10px;
    }
    .action-panel ol {
      margin: 10px 0 0;
      padding-left: 20px;
    }
    .action-panel li { margin: 3px 0; }
    .summary-chart {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px;
      background: #fff;
    }
    .score-row {
      display: grid;
      grid-template-columns: 170px 1fr 70px;
      gap: 8px;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid #e7eff6;
    }
    .score-row:last-child { border-bottom: none; }
    .score-row span { color: var(--muted); font-weight: 700; }
    .score-row strong { text-align: right; }
    .section-copy {
      margin-top: 0;
      color: var(--muted);
    }
    .dark-panel {
      background: linear-gradient(160deg, #132235, #1f344b);
      color: white;
      border-radius: 16px;
      padding: 18px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .dark-panel h3 { color: white; }
    .dark-panel small { color: #9fb1c7; }
    .chart {
      width: 100%;
      height: 160px;
      margin-top: 10px;
      background: #f8fbfe;
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    .ndvi-tracking {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      overflow: hidden;
      margin: 14px 0;
    }
    .ndvi-summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
      border-bottom: 1px solid var(--line);
      background: #f8fbfe;
    }
    .ndvi-summary div {
      padding: 8px 10px;
      border-right: 1px solid var(--line);
    }
    .ndvi-summary div:last-child { border-right: 0; }
    .ndvi-summary span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .ndvi-summary strong { display: block; font-size: 17px; }
    .ndvi-chart {
      display: block;
      width: 100%;
      height: auto;
      min-height: 250px;
      background: #fff;
    }
    .chart-caption {
      margin: 0;
      padding: 7px 10px 8px;
      color: var(--muted);
      font-size: 12px;
      border-top: 1px solid #e7eff6;
    }
    .thermal-charts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .thermal-chart {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      overflow: hidden;
      break-inside: avoid;
    }
    .thermal-chart header {
      padding: 9px 11px 7px;
      border-bottom: 1px solid #e7eff6;
    }
    .thermal-chart header strong,
    .thermal-chart header small { display: block; }
    .thermal-chart header strong { font-size: 15px; }
    .thermal-chart header small { color: var(--muted); margin-top: 3px; }
    .thermal-chart svg {
      display: block;
      width: 100%;
      height: auto;
      min-height: 220px;
    }
    .tracking-table td:nth-child(4),
    .tracking-table td:nth-child(5) {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .bar {
      height: 12px;
      border-radius: 999px;
      background: #e8f1f8;
      border: 1px solid #c8d8e8;
      overflow: hidden;
      margin-top: 10px;
    }
    .bar > i {
      display: block;
      height: 100%;
      width: var(--value, 0%);
      background: linear-gradient(90deg, var(--cyan), var(--green));
      border-radius: inherit;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    th, td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 10px;
      background: #f3f8fb;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    tr:last-child td { border-bottom: none; }
    .service-status {
      border-radius: 999px;
      display: inline-flex;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 8px;
      white-space: nowrap;
    }
    .service-status.con_dato { background: #e8f8ef; color: #257347; }
    .service-status.sin_dato { background: #fff4de; color: #8b6113; }
    .service-status.no_aplica { background: #edf1f5; color: #5c6878; }
    .service-status.no_consolidado { background: #eef6ff; color: #376c9b; }
    .note {
      border-left: 4px solid var(--cyan);
      background: #eafdfb;
      border-radius: 10px;
      padding: 8px 10px;
      margin-top: 8px;
    }
    .warn { border-left-color: var(--amber); background: #fff8e8; }
    .danger { border-left-color: var(--danger); background: #fff0ef; }
    .two-col {
      display: grid;
      grid-template-columns: 0.95fr 1.05fr;
      gap: 10px;
      align-items: start;
    }
    .source-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    .source-list div {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 7px;
      background: #f8fbfe;
    }
    .quality-board {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 7px;
      margin: 10px 0 12px;
    }
    .quality-item {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 8px;
      background: linear-gradient(135deg, #ffffff, #f8fbfe);
      min-height: 92px;
    }
    .quality-item span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .quality-item strong {
      display: block;
      font-size: 14px;
      line-height: 1.15;
    }
    .quality-item small,
    .quality-item em {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-style: normal;
      margin-top: 5px;
    }
    .quality-item .score-meter {
      margin: 6px 0 5px;
    }
    .sanitary-summary {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px;
      align-items: baseline;
      border: 1px solid #bfe5df;
      border-radius: 9px;
      background: #f3fcfa;
      padding: 8px 10px;
      margin: 0 0 8px;
    }
    .sanitary-summary.warn {
      border-color: #f2d39a;
      background: #fff9ed;
    }
    .sanitary-summary span { color: var(--muted); }
    .sanitary-source {
      margin: 7px 0 0;
      color: var(--muted);
      font-size: 10.5px;
    }
    .sanitary-table { table-layout: fixed; font-size: 11px; }
    .sanitary-table th:nth-child(1) { width: 24%; }
    .sanitary-table th:nth-child(2) { width: 19%; }
    .sanitary-table th:nth-child(3) { width: 18%; }
    .sanitary-table th:nth-child(4) { width: 39%; }
    .sanitary-table td { overflow-wrap: anywhere; }
    .sanitary-state {
      display: inline-flex;
      border-radius: 999px;
      background: #eef4f8;
      color: #476077;
      font-size: 10px;
      font-weight: 800;
      padding: 3px 7px;
    }
    .sanitary-state.operativo { background: #e8f8ef; color: #257347; }
    .sanitary-state.pendiente { background: #fff4de; color: #8b6113; }
    .sanitary-management {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
      margin: 10px 0 8px;
    }
    .sanitary-management > div {
      border: 1px solid var(--line);
      border-radius: 9px;
      padding: 7px 9px;
      background: #fbfdfe;
      min-width: 0;
    }
    .sanitary-management span {
      display: block;
      color: var(--muted);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .sanitary-management strong { display: block; margin-top: 2px; font-size: 14px; }
    .sanitary-recommendation { margin-top: 7px; }
    footer {
      padding: 18px 32px 28px;
      color: var(--muted);
      font-size: 12px;
    }
    @media screen and (max-width: 900px) {
      .page { width: auto; margin: 0; border-radius: 0; }
      .hero, .two-col { grid-template-columns: 1fr; }
      .grid, .grid.three, .executive-board, .quality-board { grid-template-columns: 1fr; }
      .score-row { grid-template-columns: 1fr; gap: 6px; }
      .score-row strong { text-align: left; }
      .ndvi-summary { grid-template-columns: repeat(2, 1fr); }
      .ndvi-summary div:nth-child(2) { border-right: 0; }
      .ndvi-summary div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
      .tracking-table { font-size: 12px; }
      .thermal-charts { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: white; }
      .page { width: auto; margin: 0; border: none; border-radius: 0; box-shadow: none; overflow: visible; }
      .section { break-inside: auto; }
      .card, .score-card, .summary-chart, .ndvi-tracking { break-inside: avoid; }
      table { break-inside: auto; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      .ndvi-chart { min-height: 0; }
      .thermal-section { break-before: page; page-break-before: always; }
      .sanitary-section { break-before: page; page-break-before: always; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">
        <img class="brand-logo" src="${CHAMAN_REPORT_LOGO_DATA_URI}" alt="Chaman Agro" />
        <h1>Informe ejecutivo de ambiente productivo</h1>
        <p>Trazabilidad agronomica, sanitaria y ambiental para ${this.escapeHtml(cultivo)} en el lote <strong>${this.escapeHtml(lote.nombre || 'Sin nombre')}</strong>.</p>
        <span class="pill">${this.escapeHtml(lote.establecimiento?.nombre || 'Sin establecimiento')}</span>
      </div>
      <div class="hero-meta">
        <div class="card"><span>Fecha de emision</span><strong>${fechaInforme}</strong><small>${this.escapeHtml(estado)}</small></div>
        <div class="card"><span>Etapa fenologica</span><strong>${this.escapeHtml(etapa)}</strong><small>${this.getDiasCultivoTexto(siembra)}</small></div>
      </div>
    </section>

    ${this.renderEmisorInforme(emisor)}

    <section class="section">
      <h2>Executive Summary · Resumen ejecutivo</h2>
      <p class="section-copy">Indicadores principales del ambiente/lote para seguimiento operativo, auditoria y conversacion tecnica con clientes.</p>
      ${this.renderTableroEjecutivo(datos, riesgo, clima)}
      ${this.renderPrioridadesEjecutivas(datos, riesgo, huella, frio, clima)}
      <h3 style="margin-top:18px;">Datos del ambiente</h3>
      <div class="grid">
        ${this.metricCard('Cultivo', cultivo, this.getVariedadTexto(siembra))}
        ${this.metricCard('Superficie', this.formatHectareas(lote.ubicacion?.superficie), 'Poligono Chaman')}
        ${this.metricCard('Suelo', this.getSueloTexto(lote, soilAssessment), this.getFuenteSuelo(lote, soilAssessment))}
        ${this.metricCard('Lluvia operativa', lluviaAcumulada, clima?.periodo ? `Periodo ${this.formatDate(clima.periodo.desde)} a ${this.formatDate(clima.periodo.hasta)}` : 'Sin periodo climatico consolidado')}
        ${this.metricCard('Riesgo sanitario', riesgo.titulo, riesgo.detalle)}
        ${this.metricCard('Riego', this.getRiegoTexto(siembra), this.getAguaUtilTexto(siembra))}
        ${this.metricCard('Huella hidrica', huella.total, huella.detalle)}
        ${this.metricCard('Carga fitosanitaria', `${cargaFitosanitaria.score}/100`, `${this.capitalize(cargaFitosanitaria.nivel.replace('_', ' '))} - ${cargaFitosanitaria.aplicacionesTotales} aplicacion(es)`)}
        ${this.metricCard(esPerenne ? 'Frio / CP' : 'Heladas', esPerenne ? this.getResumenFrioTermico(clima, frio) : helada, esPerenne ? this.getDetalleFrioTermico(clima, frio) : this.getDetalleHelada(clima))}
      </div>
      <div class="note ${riesgo.clase}">
        <strong>Lectura Chaman:</strong> ${this.escapeHtml(this.getLecturaEjecutiva(datos, riesgo, huella, frio, clima))}
      </div>
    </section>

    <section class="section">
      <h2>Cobertura de servicios Chaman</h2>
      <p class="section-copy">Estado al momento de emision. “Sin dato” no equivale a cero y “No consolidado” indica que el servicio existe en la app, pero este documento no dispone de una lectura auditable para presentarla.</p>
      ${this.renderCoberturaServicios(datos)}
    </section>

    <section class="section two-col">
      <div>
        <h2>Tablero de indicadores</h2>
        <p class="section-copy">Sintesis comparativa de presion sanitaria, carga quimica y recencia de aplicaciones. La escala es 0-100 y no reemplaza el diagnostico a campo.</p>
        ${this.renderIndicadoresEjecutivos(datos, riesgo)}
      </div>
      <div>
        <h2>${esPerenne ? 'Frio y acumulacion termica' : 'Clima agronomico resumido'}</h2>
        <p class="section-copy">Variables de decision: lluvia, grados dia, heladas y ventanas agronomicas. Se excluyen curvas de temperatura/humedad para mantener foco ejecutivo.</p>
        ${this.renderTablaClimaAgronomica(clima, frio, esPerenne)}
      </div>
    </section>

    ${
      esPerenne
        ? `<section class="section thermal-section">
      <h2>Evolucion del frio y del forzado</h2>
      <p class="section-copy">La vista acumulada documenta la trayectoria de HF, Unidades Utah y Porciones de Frio. La vista diaria permite auditar cuanto suma cada jornada y cuando el modelo Utah descuenta por efecto del calor. El documento utiliza exclusivamente las series canonicas vigentes.</p>
      ${this.renderGraficosFrio(clima)}
    </section>`
        : ''
    }

    <section class="section">
      <h2>Fenologia y ciclo</h2>
      ${this.renderTablaFenologia(fenologia, siembra)}
    </section>

    <section class="section sanitary-section">
      <h2>Monitoreo sanitario</h2>
      ${this.renderTablaEnfermedades(siembra, predicciones)}
      <h3 style="margin-top:12px;">Manejo fitosanitario registrado</h3>
      ${this.renderCargaFitosanitaria(cargaFitosanitaria)}
    </section>

    <section class="section two-col">
      <div>
        <h2>Fertilizaciones</h2>
        <p class="section-copy">${this.escapeHtml(this.getPeriodoManejoTexto(siembra))}</p>
        ${this.renderTablaFertilizaciones(fertilizaciones)}
      </div>
      <div>
        <h2>Fumigaciones</h2>
        ${this.renderTablaFumigaciones(fumigaciones)}
      </div>
    </section>

    <section class="section">
      <h2>Ubicacion, suelo, agua y huella</h2>
      ${this.renderUbicacionTerritorial(lote)}
      <div class="grid three">
        ${this.metricCard('Huella verde', huella.verde, 'Lluvia efectiva consumida')}
        ${this.metricCard('Huella azul', huella.azul, 'Riego registrado')}
        ${this.metricCard('Huella gris', huella.gris, 'Fertilizantes y fitosanitarios registrados')}
      </div>
      ${this.renderTablaSuelo(lote, soilAssessment)}
    </section>

    <section class="section">
      <h2>Seguimiento satelital del cultivo</h2>
      <p>La curva principal usa una escala NDVI fija de 0 a 1 para que los cambios sean comparables entre fechas y no se exageren variaciones pequenas. Cada escena se relaciona con el dia del ciclo y la mejor referencia fenologica disponible.</p>
      ${this.renderNdviSparkline(reportesNdvi, siembra)}
      <div class="note"><strong>Lectura satelital:</strong> ${this.escapeHtml(this.getResumenSatelital(reportesNdvi, siembra))}</div>
      ${this.renderTablaSatelital(reportesNdvi, siembra)}
    </section>

    <section class="section">
      <h2>Fuentes de datos</h2>
      <p class="section-copy">Cada decision debe leerse con su calidad de input. Una fuente modelada o incompleta sirve para orientar, pero las decisiones criticas deben contrastarse con sensor, recorrida o dato de campo.</p>
      ${this.renderCalidadDatosCertificado(datos)}
      <div class="source-list">
        <div><strong>Lote y superficie</strong><br/>Poligono y ubicacion cargados en Chaman.</div>
        <div><strong>Fenologia</strong><br/>Base Chaman por cultivo/departamento o fenologia editable del cultivo.</div>
        <div><strong>Clima y frio</strong><br/>Open-Meteo / estacion o sensor asociado cuando existe historico operativo.</div>
        <div><strong>Satelite</strong><br/>Worker Chaman con escenas Sentinel/Landsat disponibles y validadas.</div>
        <div><strong>Aplicaciones</strong><br/>Fertilizaciones y fumigaciones registradas por usuario autorizado.</div>
        <div><strong>Carga fitosanitaria</strong><br/>Motor Chaman sobre prediccion sanitaria, aplicaciones y fenologia.</div>
        <div><strong>Suelo</strong><br/>Motor edafico Chaman con INTA + SoilGrids; laboratorio, sensor y datos confirmados conservan prioridad cuando existen.</div>
      </div>
      ${this.renderPendientes(pendientes)}
    </section>

    <footer>
      Este informe es un documento tecnico generado automaticamente por Chaman Agro. Debe interpretarse junto con observacion a campo, criterio profesional y marbetes vigentes de productos aplicados. La validez agronomica depende de la calidad de los datos cargados y de los sensores/servicios conectados.
    </footer>
  </main>
</body>
</html>`;
  }

  private renderEmisorInforme(emisor?: IUsuario): string {
    if (!emisor) return '';
    const nombre =
      emisor.datosPersonales?.nombre || emisor.username || 'Usuario autorizado';
    const profesional = emisor.datosProfesionales;
    const foto = this.fotoProfesionalSegura(profesional?.foto);
    const profesion = [profesional?.profesion, profesional?.especialidad]
      .filter(Boolean)
      .join(' · ');
    const matricula = profesional?.matricula
      ? `Matricula ${profesional.matricula}`
      : 'Matricula no informada';
    return `<section class="issuer">
      ${foto ? `<img class="issuer-photo" src="${foto}" alt="Profesional responsable" />` : '<div></div>'}
      <div><small>Informe emitido por</small><strong>${this.escapeHtml(nombre)}</strong><span>${this.escapeHtml(profesion || 'Usuario autorizado de Chaman')}</span></div>
      <div class="issuer-license"><strong>${this.escapeHtml(matricula)}</strong><small>${this.escapeHtml(profesional?.consejoProfesional || '')}</small></div>
    </section>`;
  }

  private fotoProfesionalSegura(foto?: string): string | undefined {
    if (!foto || foto.length > 1_500_000) return undefined;
    return /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(foto)
      ? foto
      : undefined;
  }

  private renderCoberturaServicios(datos: CertificadoDatos): string {
    const rows = this.getCoberturaServicios(datos)
      .map(
        (item) => `<tr>
          <td><strong>${this.escapeHtml(item.nombre)}</strong></td>
          <td><span class="service-status ${item.estado}">${this.escapeHtml(this.getEstadoServicioLabel(item.estado))}</span></td>
          <td>${this.escapeHtml(item.lectura)}</td>
          <td>${this.escapeHtml(item.fuente)}</td>
        </tr>`,
      )
      .join('');
    return `<table class="service-coverage"><thead><tr><th>Servicio</th><th>Estado</th><th>Lectura disponible</th><th>Fuente / alcance</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private getCoberturaServicios(
    datos: CertificadoDatos,
  ): CertificadoServicio[] {
    const { lote, siembra, reportesNdvi, predicciones, clima, soilAssessment } =
      datos;
    const ubicacion = lote.ubicacionAdministrativa;
    const prediccion = this.getPrediccionSanitariaReciente(
      siembra,
      predicciones,
    );
    const lecturasOperativas = this.getLecturasSanitariasOperativas(prediccion);
    const noAgregables = Math.max(
      0,
      (prediccion?.enfermedades || []).length - lecturasOperativas.length,
    );
    const fueraVentana = (prediccion?.enfermedades || []).filter(
      (item) => item.estado === 'fuera_ventana',
    ).length;
    const tieneSuelo = this.tieneSueloConsolidado(lote, soilAssessment);
    const estadoRiego = this.getEstadoRecomendacionRiego(siembra);
    const tieneRecomendacionRiego =
      ['calculada', 'estimada'].includes(estadoRiego) &&
      (siembra?.ultimaPrediccionRiego || []).some(
        (item) =>
          typeof item.cantidad === 'number' &&
          Number.isFinite(item.cantidad) &&
          item.cantidad >= 0,
      );
    const tieneRiego =
      tieneRecomendacionRiego || this.tieneAguaUtilValida(siembra);
    const tieneHuella = this.tieneHuellaConsolidada(lote, siembra);
    const tieneOperaciones = !!(
      datos.fertilizaciones.length || datos.fumigaciones.length
    );
    const tieneCamara = !!(
      lote.serialCamara ||
      lote.dispositivos?.some((item: any) =>
        /camara|camera/i.test(`${item?.tipo || ''} ${item?.nombre || ''}`),
      )
    );
    const tieneSensor = this.tieneSensorOMeteorologiaAsociada(lote);
    const rendimiento =
      siembra?.rendimientoObtenidoKgHaSeco ?? siembra?.rendimientoObtenidoKgHa;
    const tieneRendimiento =
      typeof rendimiento === 'number' && Number.isFinite(Number(rendimiento));
    const malezasOperativas = esPrediccionMalezasOperativa(
      siembra?.ultimaPrediccionMalezas,
    );
    const malezasNoAplica =
      siembra?.ultimaPrediccionMalezas?.estado === 'no_aplica';
    const puntosSatelitales = this.getPuntosNdviCertificado(
      reportesNdvi,
      siembra,
    );

    return [
      {
        nombre: 'Ubicacion territorial',
        estado: ['ready', 'partial'].includes(ubicacion?.estado || '')
          ? 'con_dato'
          : 'sin_dato',
        lectura: ubicacion
          ? `${ubicacion.provincia?.nombre || 'Provincia pendiente'} · ${ubicacion.nivelAdministrativo2?.nombre || 'Jurisdiccion pendiente'}`
          : 'Sin clasificacion GeoRef consolidada',
        fuente: ubicacion?.fuente || 'GeoRef Argentina / motor Chaman',
      },
      {
        nombre: 'Fenologia',
        estado: siembra ? 'con_dato' : 'no_aplica',
        lectura: siembra
          ? `${this.getEstadoFenologico(siembra, predicciones)} · ${this.getDiasCultivoTexto(siembra)}`
          : 'El lote no tiene siembra operativa',
        fuente: siembra
          ? 'Cronograma y registros fenologicos Chaman'
          : 'Sin siembra',
      },
      {
        nombre: 'Clima y agrometeorologia',
        estado: clima ? 'con_dato' : 'sin_dato',
        lectura: clima
          ? `Lluvia ${this.formatMaybe(clima.acumulados.lluvia, 1)} mm · GD ${this.formatMaybe(clima.acumulados.gradosDia, 1)} · ${this.formatNumber(clima.completitudPct, 0)}% completitud`
          : 'Sin serie climatica consolidada en este corte',
        fuente: clima?.fuente || 'Sensor / central / Open-Meteo',
      },
      {
        nombre: 'Suelo y ambiente',
        estado: tieneSuelo ? 'con_dato' : 'sin_dato',
        lectura: tieneSuelo
          ? `${this.getSueloTexto(lote, soilAssessment)} · ${this.getFuenteSuelo(lote, soilAssessment)}`
          : 'Sin perfil edafico consolidado',
        fuente:
          soilAssessment?.source?.provider ||
          lote.sueloReferencia?.fuente ||
          (lote.suelos?.length ||
          lote.texturaEscorrentia ||
          lote.texturaLixiviacion
            ? 'Carga operativa/manual del lote'
            : 'Sin fuente edafica consolidada'),
      },
      {
        nombre: 'Monitoreo sanitario',
        estado: lecturasOperativas.length
          ? 'con_dato'
          : noAgregables
            ? 'no_consolidado'
            : 'sin_dato',
        lectura: lecturasOperativas.length
          ? `${lecturasOperativas.length} modelo(s) operativo(s) reciente(s)${fueraVentana ? `; ${fueraVentana} fuera de ventana sensible` : ''}`
          : fueraVentana === noAgregables && fueraVentana > 0
            ? `${fueraVentana} modelo(s) fuera de ventana sensible; permanecen en seguimiento`
            : noAgregables
              ? `${noAgregables} evaluacion(es) pendiente(s) de validacion; sin alerta operativa`
              : 'Sin lectura sanitaria operativa reciente',
        fuente: 'Motor sanitario Chaman + clima + fenologia + resistencia',
      },
      {
        nombre: 'Riesgos agroclimaticos y granizo',
        estado: 'no_consolidado',
        lectura:
          'Disponible en la app; sin snapshot auditable incluido en este informe',
        fuente: 'Motor agroclimatico Chaman',
      },
      {
        nombre: 'Riego y balance hidrico',
        estado: tieneRiego ? 'con_dato' : 'sin_dato',
        lectura: tieneRiego
          ? `${this.getRiegoTexto(siembra)} · ${this.getAguaUtilTexto(siembra)}`
          : 'Sin recomendacion ni balance validos',
        fuente:
          lote.sondaSuelo || lote.idSondaSuelo
            ? 'Sensor de suelo'
            : 'ET0 + cultivo + suelo',
      },
      {
        nombre: 'Malezas',
        estado: malezasOperativas
          ? 'con_dato'
          : malezasNoAplica
            ? 'no_aplica'
            : 'sin_dato',
        lectura: malezasOperativas
          ? `${siembra?.ultimaPrediccionMalezas?.especies?.length || 0} especie(s) evaluada(s) por el motor operativo`
          : malezasNoAplica
            ? 'El motor determino que el analisis no aplica a esta siembra'
            : siembra?.ultimaPrediccionMalezas?.estado === 'sin_clima'
              ? 'Sin clima suficiente para calcular malezas'
              : siembra?.ultimaPrediccionMalezas?.estado === 'sin_modelos'
                ? 'Sin modelos de malezas aplicables al cultivo'
                : 'Sin prediccion operativa de malezas consolidada',
        fuente: 'Motor de malezas Chaman',
      },
      {
        nombre: 'Viento y ventana de aplicacion',
        estado: 'no_consolidado',
        lectura:
          'Disponible en la tarjeta del lote; sin lectura historica fijada en este corte',
        fuente: 'Clima operativo Chaman',
      },
      {
        nombre: 'Seguimiento satelital',
        estado: puntosSatelitales.length ? 'con_dato' : 'sin_dato',
        lectura: puntosSatelitales.length
          ? `${puntosSatelitales.length} escena(s) valida(s); ${this.getResumenSatelital(reportesNdvi, siembra)}`
          : 'Sin escena valida disponible',
        fuente:
          puntosSatelitales[0]?.coleccion ||
          'Sentinel / Landsat / worker Chaman',
      },
      {
        nombre: 'Camaras',
        estado: tieneCamara ? 'con_dato' : 'sin_dato',
        lectura: tieneCamara
          ? 'Camara asociada al lote'
          : 'Sin camara asociada',
        fuente: 'Inventario de dispositivos Chaman',
      },
      {
        nombre: 'Napa y agua subterranea',
        estado: 'no_consolidado',
        lectura: 'Sin lectura de napa incorporada al snapshot del informe',
        fuente: 'Servicio de napa Chaman',
      },
      {
        nombre: 'Huella hidrica',
        estado: tieneHuella ? 'con_dato' : 'sin_dato',
        lectura: tieneHuella
          ? this.getResumenHuella(lote, siembra).total
          : 'Sin huella consolidada',
        fuente: 'Registros de lluvia, riego, manejo y rendimiento',
      },
      {
        nombre: 'Labores y aplicaciones',
        estado: tieneOperaciones ? 'con_dato' : 'sin_dato',
        lectura: tieneOperaciones
          ? `${datos.fertilizaciones.length} fertilizacion(es) · ${datos.fumigaciones.length} fumigacion(es)`
          : 'Sin operaciones registradas en el corte',
        fuente: 'Registros operativos Chaman',
      },
      {
        nombre: 'Sensores y central meteorologica',
        estado: tieneSensor ? 'con_dato' : 'sin_dato',
        lectura: tieneSensor
          ? this.getResumenSensoresMeteorologicos(lote)
          : 'Sin sensor poblado; clima modelado cuando corresponde',
        fuente: tieneSensor
          ? lote.establecimiento?.idEstacionMeteorologica ||
            lote.establecimiento?.estacionMeteorologica
            ? 'Central meteorologica del establecimiento'
            : 'Sensores meteorologicos del lote'
          : 'Fallback automatico Open-Meteo',
      },
      {
        nombre: 'Rendimiento',
        estado: tieneRendimiento ? 'con_dato' : 'sin_dato',
        lectura: tieneRendimiento
          ? `${this.formatNumber(Number(rendimiento), 0)} kg/ha`
          : 'Sin rendimiento observado cargado',
        fuente: 'Registro de cosecha / usuario autorizado',
      },
    ];
  }

  private getEstadoServicioLabel(estado: CertificadoEstadoServicio): string {
    const labels: Record<CertificadoEstadoServicio, string> = {
      con_dato: 'Con dato',
      sin_dato: 'Sin dato',
      no_aplica: 'No aplica',
      no_consolidado: 'No consolidado',
    };
    return labels[estado];
  }

  private renderUbicacionTerritorial(lote: ILote): string {
    const ubicacion = lote.ubicacionAdministrativa;
    if (!ubicacion || !['ready', 'partial'].includes(ubicacion.estado)) {
      return '<div class="note warn"><strong>Ubicacion territorial:</strong> Sin clasificacion administrativa oficial consolidada para este corte.</div>';
    }
    const conflicto = ubicacion.conflictoManual?.existe
      ? `<div class="note warn"><strong>Observacion territorial:</strong> ${this.escapeHtml(ubicacion.conflictoManual.detalle || 'El dato manual difiere de la clasificacion automatica y no fue sobrescrito.')}</div>`
      : '';
    return `<table style="margin-bottom:14px;"><thead><tr><th>Provincia</th><th>Jurisdiccion</th><th>Localidad de referencia</th><th>Confianza</th><th>Fuente</th></tr></thead><tbody><tr>
      <td>${this.escapeHtml(ubicacion.provincia?.nombre || 'Sin determinar')}</td>
      <td>${this.escapeHtml(`${ubicacion.nivelAdministrativo2?.tipo || 'Departamento'} ${ubicacion.nivelAdministrativo2?.nombre || 'sin determinar'}`)}</td>
      <td>${this.escapeHtml(ubicacion.localidadReferencia?.nombre || ubicacion.localidadCensal?.nombre || 'Sin referencia')}</td>
      <td>${this.escapeHtml(this.capitalize(ubicacion.confianza || 'sin calcular'))}</td>
      <td>${this.escapeHtml(ubicacion.fuente || 'GeoRef Argentina')} · ${this.escapeHtml(ubicacion.metodo || 'interseccion poligonal')}</td>
    </tr></tbody></table>${conflicto}`;
  }

  private metricCard(label: string, value: string, detail?: string): string {
    return `<article class="card"><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(value || '-')}</strong><small>${this.escapeHtml(detail || '')}</small></article>`;
  }

  private renderCalidadDatosCertificado(datos: CertificadoDatos): string {
    const items = this.getCalidadDatosCertificado(datos);
    return `<div class="quality-board">
      ${items.map((item) => this.renderCalidadDatosItem(item)).join('')}
    </div>`;
  }

  private renderCalidadDatosItem(item: CertificadoCalidadItem): string {
    const score = this.limitarPorcentaje(item.score);
    return `<article class="quality-item">
      <span>${this.escapeHtml(item.modulo)}</span>
      <strong>${this.escapeHtml(item.confianza)} ${this.formatNumber(score, 0)}/100</strong>
      <div class="score-meter" style="--value:${this.formatCssNumber(score, 0)}%"><i></i></div>
      <small>Fuente: ${this.escapeHtml(item.fuente)}</small>
      <small>${this.escapeHtml(item.lectura)}</small>
      <em>${this.escapeHtml(item.ultimaActualizacion)}</em>
    </article>`;
  }

  private getCalidadDatosCertificado(
    datos: CertificadoDatos,
  ): CertificadoCalidadItem[] {
    const {
      lote,
      siembra,
      reportesNdvi,
      predicciones,
      fertilizaciones,
      fumigaciones,
      clima,
      soilAssessment,
    } = datos;
    const climaActual = lote.establecimiento?.climaActual as any;
    const tieneClimaConsolidado = !!clima;
    const climaFuente = tieneClimaConsolidado
      ? clima?.fuente ||
        climaActual?.clima?.fuente ||
        climaActual?.fuente ||
        lote.establecimiento?.fuenteClimaPreferida ||
        'Open-Meteo'
      : 'Sin fuente consolidada';
    const climaScore = tieneClimaConsolidado
      ? this.getScoreFuenteClimatica(clima)
      : 0;
    const puntosNdvi = this.getPuntosNdviCertificado(reportesNdvi, siembra);
    const ultimoNdvi = puntosNdvi[puntosNdvi.length - 1];
    const ndviScore = ultimoNdvi
      ? this.limitarPorcentaje(ultimoNdvi.coberturaValida || 0)
      : 0;
    const ultimaPrediccion = this.getPrediccionSanitariaReciente(
      siembra,
      predicciones,
    );
    const enfermedades = this.getLecturasSanitariasOperativas(ultimaPrediccion);
    const noAgregables =
      (ultimaPrediccion?.enfermedades || []).length - enfermedades.length;
    const fueraVentana = (ultimaPrediccion?.enfermedades || []).filter(
      (item) => item.estado === 'fuera_ventana',
    ).length;
    const sueloScore = Number.isFinite(soilAssessment?.source?.confidenceScore)
      ? Number(soilAssessment?.source?.confidenceScore)
      : soilAssessment?.source?.confidence
        ? this.getScoreConfianzaTexto(
            ({ high: 'alta', medium: 'media', low: 'baja' } as const)[
              soilAssessment.source.confidence as 'high' | 'medium' | 'low'
            ],
          )
        : lote.sueloReferencia?.confianza
          ? this.getScoreConfianzaTexto(lote.sueloReferencia.confianza)
          : lote.suelos?.length
            ? Math.min(82, 55 + lote.suelos.length * 7)
            : 30;
    const tieneSonda = !!lote.sondaSuelo || !!lote.idSondaSuelo;
    const estadoRiego = this.getEstadoRecomendacionRiego(siembra);
    const tieneRecomendacionRiego =
      ['calculada', 'estimada'].includes(estadoRiego) &&
      (siembra?.ultimaPrediccionRiego || []).some(
        (item) =>
          typeof item.cantidad === 'number' &&
          Number.isFinite(item.cantidad) &&
          item.cantidad >= 0,
      );
    const tieneDatoRiego =
      tieneRecomendacionRiego || this.tieneAguaUtilValida(siembra);
    const riegoScore = !tieneDatoRiego
      ? 0
      : estadoRiego === 'estimada'
        ? 62
        : estadoRiego === 'calculada'
          ? tieneSonda
            ? 90
            : 75
          : this.tieneAguaUtilValida(siembra)
            ? 65
            : 38;
    const operaciones = fertilizaciones.length + fumigaciones.length;
    const manejoScore = operaciones ? Math.min(90, 55 + operaciones * 6) : 35;
    const huellaCalidad =
      siembra?.huellaHidrica?.calidad || lote.huellaHidrica?.calidad;
    const huellaScore =
      huellaCalidad?.score ??
      (siembra?.huellaHidrica || lote.huellaHidrica ? 58 : 35);

    return [
      {
        modulo: 'Clima',
        fuente: climaFuente,
        confianza: this.getConfianzaTexto(climaScore),
        score: climaScore,
        ultimaActualizacion: this.getActualizacionTexto(
          clima?.ultimaObservacion ||
            climaActual?.clima?.calidadDatos?.fechaActualizacion ||
            climaActual?.clima?.fecha ||
            climaActual?.fecha,
        ),
        lectura: clima
          ? `Serie ${clima.origen === 'canonico' ? 'canonica' : 'legacy de respaldo'}; ${this.formatNumber(clima.completitudPct, 0)}% completitud${Number.isFinite(clima.coberturaCampoPct) ? ` y ${this.formatNumber(Number(clima.coberturaCampoPct), 0)}% cobertura de temperatura de campo` : ''}.`
          : 'Sin clima consolidado para el informe; se recomienda validar fuente.',
      },
      {
        modulo: 'Satelite',
        fuente: ultimoNdvi?.coleccion || 'Sin escena certificada',
        confianza: this.getConfianzaTexto(ndviScore),
        score: ndviScore,
        ultimaActualizacion: this.getActualizacionTexto(ultimoNdvi?.fechaIso),
        lectura: ultimoNdvi
          ? `Escena certificada para la campana; NDVI ${this.formatMaybe(ultimoNdvi.valor, 3)} y cobertura valida ${this.formatMaybe(ultimoNdvi.coberturaValida, 1)}%.`
          : 'Sin escena satelital certificada para la campana en el informe.',
      },
      {
        modulo: 'Sanidad',
        fuente: 'Motor Chaman + clima + fenologia',
        confianza: this.getConfianzaTexto(enfermedades.length ? 68 : 35),
        score: enfermedades.length ? 68 : 35,
        ultimaActualizacion: this.getActualizacionTexto(
          ultimaPrediccion?.fechaPrediccion || ultimaPrediccion?.fecha,
        ),
        lectura: enfermedades.length
          ? `${enfermedades.length} modelo(s) operativo(s) vigente(s).${fueraVentana > 0 ? ` ${fueraVentana} modelo(s) fuera de ventana se mantienen en seguimiento.` : ''}`
          : fueraVentana === noAgregables && fueraVentana > 0
            ? `${fueraVentana} modelo(s) fuera de ventana sensible; sin alerta operativa vigente.`
            : noAgregables > 0
              ? `${noAgregables} evaluacion(es) pendiente(s) de validacion; sin alerta operativa vigente.`
              : 'Sin prediccion sanitaria operativa vigente para esta siembra.',
      },
      {
        modulo: 'Riego',
        fuente: tieneDatoRiego
          ? tieneSonda
            ? 'Sensor de suelo'
            : 'ET0 + cultivo + suelo'
          : 'Sin resultado consolidado',
        confianza: this.getConfianzaTexto(riegoScore),
        score: riegoScore,
        ultimaActualizacion: this.getActualizacionTexto(
          tieneDatoRiego
            ? this.getUltimaFechaDispositivos(lote.dispositivos)
            : undefined,
        ),
        lectura: !tieneDatoRiego
          ? 'Sin recomendacion de riego ni agua util consolidada para este corte.'
          : tieneSonda
            ? 'La sonda asignada debe guiar la decision operativa.'
            : 'Recomendacion modelada; mejora con sonda o perfil de suelo completo.',
      },
      {
        modulo: 'Suelo',
        fuente:
          soilAssessment?.source?.provider ||
          lote.sueloReferencia?.fuente ||
          (lote.suelos?.length ? 'Carga del lote' : 'Sin perfil'),
        confianza: this.getConfianzaTexto(sueloScore),
        score: sueloScore,
        ultimaActualizacion: this.getActualizacionTexto(
          soilAssessment?.calculatedAt ||
            soilAssessment?.source?.calculatedAt ||
            lote.sueloReferencia?.fechaConsulta,
        ),
        lectura:
          soilAssessment?.summary?.canonicalTexture ||
          soilAssessment?.summary?.estimatedTexture ||
          lote.sueloReferencia?.unidadCartografica ||
          `${lote.suelos?.length || 0} nivel(es) cargado(s).`,
      },
      {
        modulo: 'Manejo',
        fuente: 'Carga operativa Chaman',
        confianza: this.getConfianzaTexto(manejoScore),
        score: manejoScore,
        ultimaActualizacion: this.getActualizacionTexto(
          this.getUltimaFechaOperaciones(fertilizaciones, fumigaciones),
        ),
        lectura: operaciones
          ? `${operaciones} registro(s) considerados en trazabilidad.`
          : 'Sin fertilizaciones/fumigaciones registradas para la campana.',
      },
      {
        modulo: 'Huella hidrica',
        fuente:
          siembra?.huellaHidrica?.metodologia?.fuenteClima ||
          'WFN / FAO-56 + registros Chaman',
        confianza: this.getConfianzaTexto(huellaScore),
        score: huellaScore,
        ultimaActualizacion: this.getActualizacionTexto(
          siembra?.huellaHidrica?.metodologia?.fechaCalculo,
        ),
        lectura:
          huellaCalidad?.observaciones?.[0] ||
          'Depende de clima, riego, aplicaciones y rendimiento/cosecha.',
      },
    ];
  }

  private getScoreFuenteClimatica(clima?: CertificadoClima): number {
    if (!clima) return 0;
    const normalizada = this.normalizar(clima.fuente);
    const sourceScore = normalizada.includes('sensor')
      ? 90
      : normalizada.includes('central') || normalizada.includes('fieldclimate')
        ? 84
        : normalizada.includes('open') && normalizada.includes('meteo')
          ? 68
          : 55;
    const completeness = this.limitarPorcentaje(clima.completitudPct || 0);
    const fieldComponent = Number.isFinite(clima.coberturaCampoPct)
      ? this.limitarPorcentaje(Number(clima.coberturaCampoPct))
      : completeness;
    const provenancePenalty = clima.origen === 'legacy' ? 18 : 0;
    return this.limitarPorcentaje(
      Math.round(
        completeness * 0.5 +
          sourceScore * 0.3 +
          fieldComponent * 0.2 -
          provenancePenalty,
      ),
    );
  }

  private getScoreConfianzaTexto(confianza?: string): number {
    if (confianza === 'alta') return 88;
    if (confianza === 'media') return 68;
    if (confianza === 'baja') return 46;
    return 35;
  }

  private getConfianzaTexto(score: number): string {
    if (score >= 80) return 'Alta';
    if (score >= 60) return 'Media';
    if (score >= 35) return 'Baja';
    return 'Sin datos';
  }

  private getActualizacionTexto(value?: string): string {
    return value
      ? `Actualizado ${this.formatDateTime(value) || this.formatDate(value)}`
      : 'Actualizacion no registrada';
  }

  private getUltimaFechaDispositivos(
    dispositivos?: IDispositivo[],
  ): string | undefined {
    return this.getFechaMasReciente(
      (dispositivos || []).map(
        (dispositivo: any) =>
          dispositivo?.estado?.ultimoReporte ||
          dispositivo?.ultimoReporte ||
          dispositivo?.updatedAt,
      ),
    );
  }

  private getUltimaFechaOperaciones(
    fertilizaciones: IFertilizacion[],
    fumigaciones: IFumigacion[],
  ): string | undefined {
    return this.getFechaMasReciente([
      ...fertilizaciones.map(
        (item: any) => item.fechaFertilizacion || item.fecha,
      ),
      ...fumigaciones.map((item: any) => item.fechaFumigacion || item.fecha),
    ]);
  }

  private getFechaMasReciente(
    values: (string | undefined)[],
  ): string | undefined {
    return values
      .filter(Boolean)
      .map((fecha) => ({ fecha: fecha!, time: new Date(fecha!).getTime() }))
      .filter((item) => Number.isFinite(item.time))
      .sort((a, b) => b.time - a.time)[0]?.fecha;
  }

  private renderTableroEjecutivo(
    datos: CertificadoDatos,
    riesgo: { titulo: string; detalle: string; clase?: string },
    clima?: CertificadoClima,
  ): string {
    const riesgoScore = this.getRiesgoSanitarioScore(
      datos.siembra,
      datos.predicciones,
    );
    const ndvi = this.getUltimoNdvi(datos.reportesNdvi, datos.siembra);
    const riegoScore = this.getRiegoScore(datos.siembra);
    const huellaConsolidada = this.tieneHuellaConsolidada(
      datos.lote,
      datos.siembra,
    );
    const sateliteScore = ndvi
      ? this.limitarPorcentaje(ndvi.coberturaValida)
      : 0;
    const climaDetalle = clima
      ? `Lluvia ${this.formatMaybe(clima.acumulados.lluvia, 1)} mm | GD ${this.formatMaybe(clima.acumulados.gradosDia, 1)} | ${clima.fuente}`
      : 'Sin clima consolidado';

    return `<div class="executive-board">
      ${this.scoreCard('Sanidad', riesgo.titulo, riesgoScore, riesgo.detalle, riesgo.clase || '')}
      ${this.scoreCard('Carga fitosanitaria', `${this.formatNumber(datos.cargaFitosanitaria.score, 0)}/100`, datos.cargaFitosanitaria.score, datos.cargaFitosanitaria.recomendacion, this.getRiesgoTone(datos.cargaFitosanitaria.score))}
      ${this.scoreCard('Agua y riego', this.getRiegoTexto(datos.siembra), riegoScore, this.getAguaUtilTexto(datos.siembra), riegoScore < 45 ? 'warn' : '')}
      ${this.scoreCard('Satelite', ndvi ? `NDVI ${this.formatNumber(ndvi.valor, 3)}` : 'Sin escena', sateliteScore, ndvi ? `Ultima escena ${ndvi.fecha || 'sin fecha'} · cobertura valida ${this.formatNumber(ndvi.coberturaValida, 1)}%` : 'Pendiente de escena certificada para la campana', ndvi ? '' : 'warn')}
      ${this.scoreCard('Huella / clima', huellaConsolidada ? 'Con datos' : 'Parcial', huellaConsolidada ? 80 : 35, climaDetalle, huellaConsolidada ? '' : 'warn')}
    </div>`;
  }

  private scoreCard(
    label: string,
    value: string,
    score: number,
    detail: string,
    tone = '',
  ): string {
    const safeScore = this.limitarPorcentaje(score);
    const className = this.compactar(['score-card', tone]).join(' ');
    return `<article class="${className}">
      <span>${this.escapeHtml(label)}</span>
      <strong>${this.escapeHtml(value || '-')}</strong>
      <div class="score-meter" style="--value:${this.formatCssNumber(safeScore, 1)}%"><i></i></div>
      <small>${this.escapeHtml(detail || '')}</small>
    </article>`;
  }

  private renderPrioridadesEjecutivas(
    datos: CertificadoDatos,
    riesgo: { titulo: string; detalle: string },
    huella: { total: string },
    frio: CertificadoFrio,
    clima?: CertificadoClima,
  ): string {
    const acciones = this.getPrioridadesEjecutivas(
      datos,
      riesgo,
      huella,
      frio,
      clima,
    );
    return `<div class="action-panel">
      <h3>Prioridades de gestion</h3>
      <ol>${acciones.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ol>
    </div>`;
  }

  private getPrioridadesEjecutivas(
    datos: CertificadoDatos,
    riesgo: { titulo: string; detalle: string },
    huella: { total: string },
    frio: CertificadoFrio,
    clima?: CertificadoClima,
  ): string[] {
    const acciones: string[] = [];
    const riesgoScore = this.getRiesgoSanitarioScore(
      datos.siembra,
      datos.predicciones,
    );
    const cultivo = datos.siembra?.semilla?.cultivo || 'Cultivo';
    const etapa = this.getEstadoFenologico(datos.siembra, datos.predicciones);

    acciones.push(
      `${cultivo} en ${etapa}: sostener lectura por ambiente y actualizar el informe cuando cambie fenologia, aplicaciones o clima.`,
    );

    if (riesgoScore >= 40) {
      acciones.push(
        `Priorizar recorrida sanitaria: ${riesgo.titulo.toLowerCase()} (${riesgo.detalle}) antes de nuevas decisiones de aplicacion.`,
      );
    } else {
      acciones.push(
        `Mantener monitoreo sanitario preventivo; el mayor riesgo calculado se mantiene bajo con los datos disponibles.`,
      );
    }

    if (datos.cargaFitosanitaria.score >= 35) {
      acciones.push(
        `Auditar carga fitosanitaria: revisar productos, principios activos, dosis, carencias y justificacion tecnica por etapa.`,
      );
    } else {
      acciones.push(
        `Carga fitosanitaria baja: conservar trazabilidad de aplicaciones y confirmar sintomas a campo antes de intervenir.`,
      );
    }

    if (!clima) {
      acciones.push(
        'Consolidar clima del establecimiento o estacion asociada para mejorar sanidad, riego, heladas y huella hidrica.',
      );
    } else if (
      clima.riesgoHelada?.nivel &&
      clima.riesgoHelada.nivel !== 'bajo'
    ) {
      acciones.push(
        `Revisar alerta de helada segun estadio fenologico: ${this.capitalize(clima.riesgoHelada.nivel)} (${this.getDetalleHelada(clima)}).`,
      );
    }

    if (!this.tieneSueloConsolidado(datos.lote, datos.soilAssessment)) {
      acciones.push(
        'Completar perfil de suelo por profundidad para mejorar riego, capacidad productiva y huella.',
      );
    }

    if (huella.total === 'En seguimiento') {
      acciones.push(
        'Cargar rendimiento esperado/cosecha y riegos para consolidar huella hidrica en litros por kilo.',
      );
    }

    if (frio.aplica && !frio.acumulado && !clima) {
      acciones.push(
        'Asociar sensor o clima confiable para consolidar frio acumulado en cultivos perennes.',
      );
    }

    return acciones.slice(0, 6);
  }

  private renderIndicadoresEjecutivos(
    datos: CertificadoDatos,
    riesgo: { titulo: string; detalle: string; clase?: string },
  ): string {
    const rows = [
      {
        label: 'Riesgo sanitario',
        value: this.getRiesgoSanitarioScore(datos.siembra, datos.predicciones),
        detail: riesgo.titulo,
        tone: riesgo.clase || '',
      },
      {
        label: 'Carga fitosanitaria',
        value: datos.cargaFitosanitaria.score,
        detail: this.capitalize(
          datos.cargaFitosanitaria.nivel.replace('_', ' '),
        ),
      },
      {
        label: 'Presion de enfermedades',
        value: datos.cargaFitosanitaria.presionEnfermedades,
        detail: `${datos.cargaFitosanitaria.enfermedadesMonitoreadas} enfermedad(es)`,
      },
      {
        label: 'Carga de aplicaciones',
        value: datos.cargaFitosanitaria.cargaQuimica,
        detail: `${datos.cargaFitosanitaria.aplicacionesTotales} aplicacion(es)`,
      },
      {
        label: 'Recencia operativa',
        value: datos.cargaFitosanitaria.recenciaAplicaciones,
        detail: `${datos.cargaFitosanitaria.aplicacionesUltimos30Dias} en 30 dias`,
      },
    ];

    return `<div class="summary-chart">
      ${rows.map((item) => this.renderScoreRow(item.label, item.value, item.detail, item.tone)).join('')}
    </div>`;
  }

  private renderScoreRow(
    label: string,
    value: number,
    detail: string,
    toneOverride = '',
  ): string {
    const safeValue = this.limitarPorcentaje(value);
    const tone = toneOverride || this.getRiesgoTone(safeValue);
    return `<div class="score-row ${tone}">
      <span>${this.escapeHtml(label)}</span>
      <div class="score-meter" style="--value:${this.formatCssNumber(safeValue, 1)}%"><i></i></div>
      <strong>${this.escapeHtml(`${this.formatNumber(safeValue, 1)}/100`)}</strong>
      <small style="grid-column: 1 / -1; color: var(--muted);">${this.escapeHtml(detail || '')}</small>
    </div>`;
  }

  private getRiesgoSanitarioScore(
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
  ): number {
    const prediccion = this.getPrediccionSanitariaReciente(
      siembra,
      predicciones,
    );
    const enfermedades = this.getLecturasSanitariasOperativas(prediccion);
    if (!enfermedades.length) {
      return 0;
    }
    return this.limitarPorcentaje(
      Math.max(
        ...enfermedades.map((item) => this.normalizarRiesgo(item.resultado)),
      ),
    );
  }

  private getRiesgoTone(score: number): string {
    if (score >= 70) {
      return 'danger';
    }
    if (score >= 40) {
      return 'warn';
    }
    return '';
  }

  private getRiegoScore(siembra?: ISiembra): number {
    const estado = this.getEstadoRecomendacionRiego(siembra);
    if (estado === 'calculada') {
      return 85;
    }
    if (estado === 'estimada') {
      return 62;
    }
    if (this.tieneAguaUtilValida(siembra)) {
      return 65;
    }
    return 0;
  }

  private tieneHuellaConsolidada(lote: ILote, siembra?: ISiembra): boolean {
    return esHuellaHidricaConsolidada(
      siembra?.huellaHidrica || lote.huellaHidrica,
    );
  }

  private getUltimoNdvi(
    reportes: IReporteNDVI[],
    siembra?: ISiembra,
  ): { valor: number; fecha: string; coberturaValida: number } | undefined {
    const puntos = this.getPuntosNdviCertificado(reportes, siembra);
    const ultimo = puntos[puntos.length - 1];
    return ultimo
      ? {
          valor: ultimo.valor,
          fecha: ultimo.fecha,
          coberturaValida: ultimo.coberturaValida || 0,
        }
      : undefined;
  }

  private getResumenSatelital(
    reportes: IReporteNDVI[],
    siembra?: ISiembra,
  ): string {
    const puntos = this.getPuntosNdviCertificado(reportes, siembra);
    if (!puntos.length) {
      return 'Sin escenas limpias con NDVI procesado para este lote.';
    }

    const ultimo = puntos[puntos.length - 1];
    const anterior = puntos[puntos.length - 2];
    if (!anterior) {
      return `Ultima escena ${ultimo.fecha || 'sin fecha'} con NDVI ${this.formatNumber(Number(ultimo.valor), 3)}${ultimo.coleccion ? ` (${ultimo.coleccion})` : ''}.`;
    }

    const diferencia = Number(ultimo.valor) - Number(anterior.valor);
    const tendencia =
      Math.abs(diferencia) < 0.02
        ? 'estable'
        : diferencia > 0
          ? 'en mejora'
          : 'en descenso';
    return `Ultima escena ${ultimo.fecha || 'sin fecha'} con NDVI ${this.formatNumber(Number(ultimo.valor), 3)}; tendencia ${tendencia} contra ${anterior.fecha || 'escena anterior'} (${this.formatNumber(diferencia, 3)}).`;
  }

  private renderNdviSparkline(
    reportes: IReporteNDVI[],
    siembra?: ISiembra,
  ): string {
    const puntos = this.getPuntosNdviCertificado(reportes, siembra);
    if (!puntos.length) {
      return '<div class="chart" style="display:grid;place-items:center;color:#60708c;">Sin escenas satelitales procesadas</div>';
    }

    const width = 760;
    const height = 286;
    const left = 62;
    const right = 730;
    const top = 38;
    const bottom = 208;
    const x = (index: number) =>
      left + (index * (right - left)) / Math.max(puntos.length - 1, 1);
    const y = (valor: number) => {
      const normalizado = Math.max(0, Math.min(1, valor));
      return bottom - normalizado * (bottom - top);
    };
    const coords = puntos.map((item, index) => ({
      x: x(index),
      y: y(item.valor),
      item,
    }));
    const area = [
      `${left},${bottom}`,
      ...coords.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`),
      `${right},${bottom}`,
    ].join(' ');
    const grilla = [0, 0.2, 0.4, 0.6, 0.8, 1]
      .map((tick) => {
        const tickY = y(tick);
        return `<line x1="${left}" x2="${right}" y1="${tickY.toFixed(1)}" y2="${tickY.toFixed(1)}" stroke="#dbe6ef" stroke-width="1" />
          <text x="${left - 12}" y="${(tickY + 4).toFixed(1)}" text-anchor="end" fill="#60708c" font-size="11">${this.formatCssNumber(tick, 1)}</text>`;
      })
      .join('');
    const puntosSvg = coords
      .map(({ x: pointX, y: pointY, item }, index) => {
        const etiquetaY = Math.max(top + 13, pointY - 12);
        const dia =
          item.diaCultivo === undefined ? 'Sin dia' : `D+${item.diaCultivo}`;
        const fechaCorta = this.formatDateShort(item.fechaIso);
        const pointClass = index === coords.length - 1 ? '#132235' : '#2ed4ca';
        return `<g>
          <line x1="${pointX.toFixed(1)}" x2="${pointX.toFixed(1)}" y1="${bottom}" y2="${(bottom + 7).toFixed(1)}" stroke="#9fb1c7" />
          <circle cx="${pointX.toFixed(1)}" cy="${pointY.toFixed(1)}" r="7" fill="#ffffff" stroke="${pointClass}" stroke-width="3" />
          <text x="${pointX.toFixed(1)}" y="${etiquetaY.toFixed(1)}" text-anchor="middle" fill="#1f3047" font-size="11" font-weight="700">${this.escapeHtml(this.formatNumber(item.valor, 3))}</text>
          <text x="${pointX.toFixed(1)}" y="230" text-anchor="middle" fill="#1f3047" font-size="11" font-weight="700">${this.escapeHtml(fechaCorta)}</text>
          <text x="${pointX.toFixed(1)}" y="246" text-anchor="middle" fill="#60708c" font-size="10">${this.escapeHtml(dia)}</text>
        </g>`;
      })
      .join('');
    const ultimo = puntos[puntos.length - 1];
    const primero = puntos[0];
    const cambio = ultimo.valor - primero.valor;
    const cambioTexto =
      puntos.length > 1
        ? `${cambio >= 0 ? '+' : ''}${this.formatNumber(cambio, 3)}`
        : 'Sin comparacion';
    const periodo =
      puntos.length > 1
        ? `${this.formatDateShort(primero.fechaIso)} a ${this.formatDateShort(ultimo.fechaIso)}`
        : this.formatDateShort(ultimo.fechaIso);

    return `<div class="ndvi-tracking">
      <div class="ndvi-summary">
        <div><span>Ultima lectura</span><strong>NDVI ${this.escapeHtml(this.formatNumber(ultimo.valor, 3))}</strong></div>
        <div><span>Cambio del periodo</span><strong>${this.escapeHtml(cambioTexto)}</strong></div>
        <div><span>Escenas comparables</span><strong>${puntos.length}</strong></div>
        <div><span>Etapa en ultima escena</span><strong>${this.escapeHtml(ultimo.etapa)}</strong></div>
      </div>
      <svg class="ndvi-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolucion temporal de NDVI en escala fija de cero a uno">
        <defs>
          <linearGradient id="areaNdvi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2ed4ca" stop-opacity="0.28" />
            <stop offset="100%" stop-color="#2ed4ca" stop-opacity="0.03" />
          </linearGradient>
          <linearGradient id="lineaNdvi" x1="0" x2="1">
            <stop offset="0%" stop-color="#2ed4ca" />
            <stop offset="100%" stop-color="#68be4a" />
          </linearGradient>
        </defs>
        <text x="${left}" y="20" fill="#1f3047" font-size="12" font-weight="700">NDVI medio del lote · escala fija 0-1</text>
        ${grilla}
        <line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="#9fb1c7" />
        <line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#9fb1c7" />
        <polygon points="${area}" fill="url(#areaNdvi)" />
        <polyline fill="none" stroke="url(#lineaNdvi)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${coords.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ')}" />
        ${puntosSvg}
        <text x="${(left + right) / 2}" y="274" text-anchor="middle" fill="#60708c" font-size="11">Fecha de escena y dia desde implantacion · periodo ${this.escapeHtml(periodo)}</text>
      </svg>
      <p class="chart-caption">La escala permanece fija entre informes. Los cambios deben interpretarse contra fenologia, calidad de escena, clima, manejo y recorrida; NDVI por si solo no diagnostica causa.</p>
    </div>`;
  }

  private getPuntosNdviCertificado(
    reportes: IReporteNDVI[],
    siembra?: ISiembra,
  ): CertificadoNdviPunto[] {
    const ventana = this.getVentanaTemporalCultivo(siembra);
    const puntos = reportes
      .map((reporte): CertificadoNdviPunto | undefined => {
        const fechaIso =
          reporte.fechaDeLaImagen ||
          reporte.fechaDelReporte ||
          reporte.fechaCreacion ||
          '';
        const time = new Date(fechaIso).getTime();
        const valor = this.toNumber(
          reporte.indices?.ndvi ?? reporte.ndviPromedio,
        );
        const coberturaValida = this.getCoberturaNdvi(reporte);
        const qaNdvi = reporte.metadataImagen?.renderQa?.ndvi;
        if (
          !Number.isFinite(time) ||
          !Number.isFinite(valor) ||
          valor < -1 ||
          valor > 1 ||
          reporte.metadataImagen?.renderVersion !== 'fixed-index-v3' ||
          qaNdvi?.status !== 'ok' ||
          !Number.isFinite(coberturaValida) ||
          coberturaValida < SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT ||
          (ventana && (time < ventana.desde || time > ventana.hasta))
        ) {
          return undefined;
        }
        const etapa = this.getEtapaSatelitalCertificado(
          siembra,
          new Date(time),
        );
        return {
          fechaIso,
          fecha: this.formatDate(fechaIso),
          time,
          valor,
          diaCultivo: this.getDiasEntreFechas(siembra?.fechaSiembra, fechaIso),
          etapa: etapa.nombre,
          etapaFuente: etapa.fuente,
          etapaConfirmada: etapa.confirmada,
          coberturaValida,
          coleccion: reporte.coleccion || 'Satelite',
          ndmi: this.getIndiceSatelitalValido(reporte.indices?.ndmi),
          ndwi: this.getIndiceSatelitalValido(reporte.indices?.ndwi),
          ndre: this.getIndiceSatelitalValido(reporte.indices?.ndre),
          savi: this.getIndiceSatelitalValido(reporte.indices?.savi),
          evi: this.getIndiceSatelitalValido(reporte.indices?.evi),
        };
      })
      .filter((item): item is CertificadoNdviPunto => !!item)
      .sort((a, b) => a.time - b.time);

    puntos.forEach((punto, index) => {
      if (index > 0) {
        punto.delta = punto.valor - puntos[index - 1].valor;
      }
    });
    return puntos;
  }

  private getVentanaTemporalCultivo(
    siembra?: ISiembra,
  ): { desde: number; hasta: number } | undefined {
    const implantacion = new Date(siembra?.fechaSiembra || '').getTime();
    if (!Number.isFinite(implantacion)) return undefined;
    const cosecha = new Date(siembra?.fechaCosecha || '').getTime();
    const hasta = Number.isFinite(cosecha) ? cosecha : Date.now();
    const perenne =
      siembra?.semilla?.tipoCultivo === 'Perenne' ||
      esCultivoPerenne(siembra?.semilla?.cultivo);
    const unAnioMs = 366 * 24 * 60 * 60 * 1000;
    return {
      desde: perenne ? Math.max(implantacion, hasta - unAnioMs) : implantacion,
      hasta,
    };
  }

  private getPeriodoManejoTexto(siembra?: ISiembra): string {
    const ventana = this.getVentanaTemporalCultivo(siembra);
    if (!ventana)
      return 'Historial del lote; no hay un ciclo activo para acotar el periodo.';
    const perenne =
      siembra?.semilla?.tipoCultivo === 'Perenne' ||
      esCultivoPerenne(siembra?.semilla?.cultivo);
    return perenne
      ? `Periodo movil del ciclo perenne: ${this.formatDate(new Date(ventana.desde).toISOString())} a ${this.formatDate(new Date(ventana.hasta).toISOString())}.`
      : `Campana de la siembra: ${this.formatDate(new Date(ventana.desde).toISOString())} a ${this.formatDate(new Date(ventana.hasta).toISOString())}.`;
  }

  private getIndiceSatelitalValido(value: unknown): number | undefined {
    const numero = this.toNumber(value);
    return Number.isFinite(numero) && numero >= -1 && numero <= 1
      ? numero
      : undefined;
  }

  private getCoberturaNdvi(reporte: IReporteNDVI): number | undefined {
    const cobertura = this.toNumber(
      reporte.metadataImagen?.renderQa?.ndvi?.validCoveragePct ??
        reporte.metadataImagen?.qualityMask?.validCoveragePct ??
        reporte.metadataImagen?.indicesStats?.ndvi?.validCoveragePct,
    );
    return Number.isFinite(cobertura)
      ? Math.max(0, Math.min(100, cobertura))
      : undefined;
  }

  private getEtapaSatelitalCertificado(
    siembra: ISiembra | undefined,
    fecha: Date,
  ): CertificadoEtapaSatelital {
    if (!Number.isFinite(fecha.getTime())) {
      return {
        nombre: 'Sin etapa confirmada',
        fuente: 'Fecha de escena invalida',
        confirmada: false,
      };
    }

    const registro = obtenerRegistroFenologicoDecisorioEnFecha(siembra, fecha);
    if (registro?.etapa) {
      const puntual =
        registro.tipoEvento === 'observacion' ||
        (registro.accion === 'observacion' && !registro.fechaInicioEtapa);
      const cobertura =
        registro.coberturaObservadaPct == null
          ? ''
          : `; ${this.formatNumber(registro.coberturaObservadaPct, 0)}% del lote`;
      return {
        nombre: registro.etapa,
        fuente: `${puntual ? 'Observacion' : 'Inicio de etapa'} de campo · confianza ${registro.confianza || 'media'}${cobertura}`,
        confirmada: true,
      };
    }

    const cultivo = siembra?.semilla?.cultivo;
    if (esCultivoPerenne(cultivo)) {
      const referencia = siembra?.semilla?.fenologiaReferencia?.etapas;
      const etapas =
        referencia && Object.keys(referencia).length
          ? Object.entries(referencia)
              .map(([nombre, value]) => ({
                nombre: this.prettyKey(nombre),
                dia: Number(String(value).replace(',', '.')),
              }))
              .filter((item) => Number.isFinite(item.dia))
          : getEtapasPerennesReferencia(cultivo).map((item) => ({
              nombre: item.nombre,
              dia: item.dia,
            }));
      if (etapas.length) {
        const inicioCampania = new Date(
          fecha.getMonth() + 1 >= 7
            ? fecha.getFullYear()
            : fecha.getFullYear() - 1,
          6,
          1,
        );
        const diaCampania = Math.max(
          0,
          Math.floor((fecha.getTime() - inicioCampania.getTime()) / 86400000),
        );
        let etapa = etapas.sort((a, b) => a.dia - b.dia)[0].nombre;
        for (const item of etapas) {
          if (diaCampania >= item.dia) {
            etapa = item.nombre;
          }
        }
        return {
          nombre: etapa,
          fuente: referencia
            ? 'Referencia fenologica de la variedad'
            : 'Referencia de campania perenne',
          confirmada: false,
        };
      }
    }

    if (!siembra?.fechaSiembra) {
      return {
        nombre: 'Sin etapa confirmada',
        fuente: 'Falta fecha de implantacion',
        confirmada: false,
      };
    }
    const dias = this.getDiasEntreFechas(
      siembra.fechaSiembra,
      fecha.toISOString(),
    );
    if (dias === undefined) {
      return {
        nombre: 'Sin etapa confirmada',
        fuente: 'Fecha de implantacion invalida',
        confirmada: false,
      };
    }
    if (dias < 0) {
      return {
        nombre: 'Pre-siembra',
        fuente: 'Escena anterior a la implantacion',
        confirmada: false,
      };
    }

    const referencia = siembra.semilla?.fenologiaReferencia;
    if (referencia?.unidadEtapas === 'grados_dia') {
      return {
        nombre: `Dia ${dias} · etapa termica a confirmar`,
        fuente: 'La etapa requiere GDD historico o registro de campo',
        confirmada: false,
      };
    }

    const etapas =
      siembra.crono?.etapas ||
      (referencia?.unidadEtapas === 'dias' ? referencia.etapas : undefined);
    const etapa = this.getEtapaPorDuraciones(
      etapas as Record<string, number | string> | undefined,
      dias,
    );
    if (etapa) {
      return {
        nombre: etapa,
        fuente: siembra.crono
          ? 'Cronologia de la siembra'
          : 'Referencia fenologica de la variedad',
        confirmada: false,
      };
    }

    return {
      nombre: `Dia ${dias} · etapa no registrada`,
      fuente: 'Sin cronologia fenologica util para esa fecha',
      confirmada: false,
    };
  }

  private getEtapaPorDuraciones(
    etapas: Record<string, number | string> | undefined,
    dias: number,
  ): string | undefined {
    const items = Object.entries(etapas || {})
      .map(([nombre, value]) => ({
        nombre: this.prettyKey(nombre),
        duracion: Number(String(value).replace(',', '.')),
      }))
      .filter((item) => Number.isFinite(item.duracion) && item.duracion >= 0);
    if (!items.length) {
      return undefined;
    }

    const sonHitosAcumulados = items.every(
      (item, index) =>
        index === 0 || item.duracion >= items[index - 1].duracion,
    );
    if (sonHitosAcumulados) {
      let actual = items[0].nombre;
      for (const item of items) {
        if (dias >= item.duracion) {
          actual = item.nombre;
        }
      }
      return actual;
    }

    let acumulado = 0;
    for (const item of items) {
      acumulado += item.duracion;
      if (dias < acumulado) {
        return item.nombre;
      }
    }
    return items[items.length - 1].nombre;
  }

  private getDiasEntreFechas(
    desde?: string,
    hasta?: string,
  ): number | undefined {
    if (!desde || !hasta) {
      return undefined;
    }
    const desdeTime = new Date(desde).getTime();
    const hastaTime = new Date(hasta).getTime();
    if (!Number.isFinite(desdeTime) || !Number.isFinite(hastaTime)) {
      return undefined;
    }
    return Math.floor((hastaTime - desdeTime) / 86400000);
  }

  private renderClimaSparkline(clima?: CertificadoClima): string {
    const serie = (clima?.serie || [])
      .slice(-50)
      .filter(
        (dia) =>
          Number.isFinite(dia.temperaturaMin) ||
          Number.isFinite(dia.temperaturaMax) ||
          Number.isFinite(dia.lluvia),
      );

    if (!serie.length) {
      return '<div class="chart" style="display:grid;place-items:center;color:#9fb1c7;">Sin serie climatica consolidada</div>';
    }

    const temperaturas = serie
      .flatMap((dia) => [dia.temperaturaMin, dia.temperaturaMax])
      .map((valor) => Number(valor))
      .filter(Number.isFinite);
    const minTemp = Math.min(...temperaturas, 0);
    const maxTemp = Math.max(...temperaturas, 1);
    const tempRange = maxTemp - minTemp || 1;
    const maxLluvia = Math.max(
      ...serie.map((dia) => Number(dia.lluvia) || 0),
      1,
    );
    const x = (index: number) =>
      34 + (index * 520) / Math.max(serie.length - 1, 1);
    const yTemp = (valor?: number) =>
      120 - (((Number(valor) || 0) - minTemp) * 84) / tempRange;
    const puntosMax = serie
      .map(
        (dia, index) =>
          `${x(index).toFixed(1)},${yTemp(dia.temperaturaMax).toFixed(1)}`,
      )
      .join(' ');
    const puntosMin = serie
      .map(
        (dia, index) =>
          `${x(index).toFixed(1)},${yTemp(dia.temperaturaMin).toFixed(1)}`,
      )
      .join(' ');
    const barras = serie
      .map((dia, index) => {
        const alto = Math.max(1, ((Number(dia.lluvia) || 0) * 72) / maxLluvia);
        return `<rect x="${(x(index) - 2).toFixed(1)}" y="${(126 - alto).toFixed(1)}" width="4" height="${alto.toFixed(1)}" rx="2" fill="#7ce0c0" opacity="0.55" />`;
      })
      .join('');
    const labels = serie
      .filter((_dia, index) => index === 0 || index === serie.length - 1)
      .map((dia, index) => {
        const sourceIndex = index === 0 ? 0 : serie.length - 1;
        return `<text x="${x(sourceIndex).toFixed(1)}" y="146" text-anchor="${index === 0 ? 'start' : 'end'}" fill="#9fb1c7" font-size="10">${this.escapeHtml(this.formatDate(dia.fecha) || '')}</text>`;
      })
      .join('');

    return `<svg class="chart" viewBox="0 0 600 160" role="img" aria-label="Temperatura y lluvia">
      <g opacity="0.18">
        <line x1="34" x2="554" y1="36" y2="36" stroke="#ffffff" />
        <line x1="34" x2="554" y1="78" y2="78" stroke="#ffffff" />
        <line x1="34" x2="554" y1="120" y2="120" stroke="#ffffff" />
      </g>
      ${barras}
      <polyline fill="none" stroke="#f04f45" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${puntosMax}" />
      <polyline fill="none" stroke="#36a2eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${puntosMin}" />
      ${labels}
      <text x="34" y="18" fill="#9fb1c7" font-size="11">Temp max/min y lluvia diaria</text>
      <g transform="translate(330,14)" font-size="10" fill="#9fb1c7">
        <circle cx="0" cy="0" r="4" fill="#f04f45" /><text x="10" y="4">Max</text>
        <circle cx="52" cy="0" r="4" fill="#36a2eb" /><text x="62" y="4">Min</text>
        <rect x="104" y="-4" width="8" height="8" rx="2" fill="#7ce0c0" /><text x="118" y="4">Lluvia</text>
      </g>
    </svg>`;
  }

  async generarCertificadoPdf(
    id: string,
    permiso: IPermiso,
    emisor?: IUsuario,
  ): Promise<Buffer> {
    const html = await this.generarCertificado(id, permiso, emisor);
    return await renderHtmlToPdf(html);
  }

  private renderGraficosFrio(clima?: CertificadoClima): string {
    const serie = (clima?.serie || []).filter(
      (dia) =>
        !dia.esPronostico &&
        [
          dia.horasFrio,
          dia.horasFrioAcumuladas,
          dia.unidadesUtah,
          dia.unidadesUtahAcumuladas,
          dia.porcionesFrio,
          dia.porcionesFrioAcumuladas,
        ].some((valor) => Number.isFinite(valor)),
    );
    if (!serie.length) {
      return '<div class="note warn"><strong>Serie termica pendiente:</strong> el informe conserva los acumulados disponibles, pero aun no dispone de puntos diarios suficientes para graficar.</div>';
    }

    const width = 520;
    const height = 336;
    const left = 54;
    const right = 20;
    const plotWidth = width - left - right;
    const panelHeight = 44;
    const panelTops = [24, 92, 160, 228];
    const x = (index: number) =>
      left + (index * plotWidth) / Math.max(serie.length - 1, 1);
    const numberValues = (key: keyof CertificadoClima['serie'][number]) =>
      serie
        .map((dia) => Number(dia[key]))
        .filter((valor) => Number.isFinite(valor));
    const points = (
      key: keyof CertificadoClima['serie'][number],
      y: (value: number) => number,
    ) =>
      serie
        .map((dia, index) => {
          const value = Number(dia[key]);
          return Number.isFinite(value)
            ? `${x(index).toFixed(1)},${y(value).toFixed(1)}`
            : '';
        })
        .filter(Boolean)
        .join(' ');
    const dateLabels = () => {
      const indices = [
        ...new Set([0, Math.floor((serie.length - 1) / 2), serie.length - 1]),
      ];
      return indices
        .map((index) => {
          const anchor =
            index === 0
              ? 'start'
              : index === serie.length - 1
                ? 'end'
                : 'middle';
          return `<text x="${x(index).toFixed(1)}" y="326" text-anchor="${anchor}" fill="#60708c" font-size="10">${this.escapeHtml(this.formatDate(serie[index].fecha) || '')}</text>`;
        })
        .join('');
    };
    const range = (values: number[]) => {
      const minBase = Math.min(0, ...values);
      const maxBase = Math.max(0, ...values);
      const span = maxBase - minBase;
      if (!span) return { min: 0, max: 1 };
      const padding = span * 0.08;
      return {
        min: minBase < 0 ? minBase - padding : 0,
        max: maxBase > 0 ? maxBase + padding : 0,
      };
    };
    const temperatureRange = (values: number[]) => {
      if (!values.length) return { min: 0, max: 20 };
      const minBase = Math.min(...values);
      const maxBase = Math.max(...values);
      const span = maxBase - minBase;
      const padding = Math.max(1, span * 0.08);
      return span
        ? { min: minBase - padding, max: maxBase + padding }
        : { min: minBase - 1, max: maxBase + 1 };
    };
    const panelY = (
      value: number,
      top: number,
      limits: { min: number; max: number },
    ) =>
      top +
      ((limits.max - value) / Math.max(limits.max - limits.min, 1)) *
        panelHeight;
    const panelGrid = (top: number, limits: { min: number; max: number }) =>
      [0, 0.5, 1]
        .map((ratio) => {
          const y = top + ratio * panelHeight;
          return `<line x1="${left}" x2="${width - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#dce7f0" stroke-width="1" />`;
        })
        .concat(
          limits.min < 0 && limits.max > 0
            ? [
                `<line x1="${left}" x2="${width - right}" y1="${panelY(0, top, limits).toFixed(1)}" y2="${panelY(0, top, limits).toFixed(1)}" stroke="#60708c" stroke-width="1.4" />`,
              ]
            : [],
        )
        .join('');
    const panelLabel = (
      name: string,
      unit: string,
      color: string,
      top: number,
      limits: { min: number; max: number },
    ) => `<text x="${left - 8}" y="${top + panelHeight / 2 + 3}" text-anchor="end" fill="${color}" font-size="10" font-weight="700">${name}</text>
      <text x="${left}" y="${top - 5}" fill="#60708c" font-size="9">${this.escapeHtml(this.formatNumber(limits.min, unit === 'CP' ? 2 : 1))} a ${this.escapeHtml(this.formatNumber(limits.max, unit === 'CP' ? 2 : 1))} ${unit}</text>`;

    const temperatureLimits = temperatureRange([
      ...numberValues('temperaturaMin'),
      ...numberValues('temperaturaMax'),
    ]);
    const temperatureBand = (from: number, to: number, color: string) => {
      const start = Math.max(from, temperatureLimits.min);
      const end = Math.min(to, temperatureLimits.max);
      if (end <= start) return '';
      const yTop = panelY(end, panelTops[0], temperatureLimits);
      const yBottom = panelY(start, panelTops[0], temperatureLimits);
      return `<rect x="${left}" y="${yTop.toFixed(1)}" width="${plotWidth}" height="${Math.max(0, yBottom - yTop).toFixed(1)}" fill="${color}" />`;
    };
    const temperatureContext = `
      ${temperatureBand(15.9, 18, 'rgba(215,131,61,0.08)')}
      ${temperatureBand(18, temperatureLimits.max, 'rgba(215,131,61,0.14)')}
      ${temperatureLimits.min <= 15.9 && temperatureLimits.max >= 15.9 ? `<line x1="${left}" x2="${width - right}" y1="${panelY(15.9, panelTops[0], temperatureLimits).toFixed(1)}" y2="${panelY(15.9, panelTops[0], temperatureLimits).toFixed(1)}" stroke="#d7833d" stroke-width="1" stroke-dasharray="4 3" />` : ''}
      <polyline data-panel="temperature-min" fill="none" stroke="#60708c" stroke-width="1.5" stroke-dasharray="4 3" stroke-linejoin="round" points="${points('temperaturaMin', (value) => panelY(value, panelTops[0], temperatureLimits))}" />
      <polyline data-panel="temperature-max" fill="none" stroke="#d7833d" stroke-width="1.8" stroke-linejoin="round" points="${points('temperaturaMax', (value) => panelY(value, panelTops[0], temperatureLimits))}" />`;

    const accumulatedRanges = [
      range(numberValues('horasFrioAcumuladas')),
      range(numberValues('unidadesUtahAcumuladas')),
      range(numberValues('porcionesFrioAcumuladas')),
    ];
    const accumulatedSvg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Temperatura y evolucion acumulada de horas de frio, unidades Utah y porciones de frio">
      ${panelGrid(panelTops[0], temperatureLimits)}
      ${panelGrid(panelTops[1], accumulatedRanges[0])}
      ${panelGrid(panelTops[2], accumulatedRanges[1])}
      ${panelGrid(panelTops[3], accumulatedRanges[2])}
      ${panelLabel('Temp', 'C', '#60708c', panelTops[0], temperatureLimits)}
      ${panelLabel('HF', 'HF', '#168d82', panelTops[1], accumulatedRanges[0])}
      ${panelLabel('Utah', 'UF', '#547ec8', panelTops[2], accumulatedRanges[1])}
      ${panelLabel('CP', 'CP', '#8d65b8', panelTops[3], accumulatedRanges[2])}
      ${temperatureContext}
      <polyline data-panel="hf" fill="none" stroke="#168d82" stroke-width="2.6" stroke-linejoin="round" points="${points('horasFrioAcumuladas', (value) => panelY(value, panelTops[1], accumulatedRanges[0]))}" />
      <polyline data-panel="utah" fill="none" stroke="#547ec8" stroke-width="2.6" stroke-linejoin="round" points="${points('unidadesUtahAcumuladas', (value) => panelY(value, panelTops[2], accumulatedRanges[1]))}" />
      <polyline data-panel="cp" fill="none" stroke="#8d65b8" stroke-width="2.4" stroke-linejoin="round" points="${points('porcionesFrioAcumuladas', (value) => panelY(value, panelTops[3], accumulatedRanges[2]))}" />
      ${dateLabels()}
    </svg>`;

    const dailyRanges = [
      range(numberValues('horasFrio')),
      range(numberValues('unidadesUtah')),
      range(numberValues('porcionesFrio')),
    ];
    const spacing = plotWidth / Math.max(serie.length, 1);
    const barWidth = Math.max(0.9, Math.min(5, spacing * 0.68));
    const dailyBars = (
      key: keyof CertificadoClima['serie'][number],
      top: number,
      limits: { min: number; max: number },
      color: string,
      negativeColor = color,
    ) =>
      serie
        .map((dia, index) => {
          const value = Number(dia[key]);
          if (!Number.isFinite(value)) return '';
          const zeroY = panelY(0, top, limits);
          const valueY = panelY(value, top, limits);
          return `<rect x="${(x(index) - barWidth / 2).toFixed(1)}" y="${Math.min(zeroY, valueY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0.8, Math.abs(zeroY - valueY)).toFixed(1)}" fill="${value < 0 ? negativeColor : color}" opacity="0.86" />`;
        })
        .join('');
    const dailySvg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Temperatura y aportes diarios de horas de frio, unidades Utah y porciones de frio">
      ${panelGrid(panelTops[0], temperatureLimits)}
      ${panelGrid(panelTops[1], dailyRanges[0])}
      ${panelGrid(panelTops[2], dailyRanges[1])}
      ${panelGrid(panelTops[3], dailyRanges[2])}
      ${panelLabel('Temp', 'C', '#60708c', panelTops[0], temperatureLimits)}
      ${panelLabel('HF', 'HF', '#168d82', panelTops[1], dailyRanges[0])}
      ${panelLabel('Utah', 'UF', '#547ec8', panelTops[2], dailyRanges[1])}
      ${panelLabel('CP', 'CP', '#8d65b8', panelTops[3], dailyRanges[2])}
      ${temperatureContext}
      <g data-panel="hf-daily">${dailyBars('horasFrio', panelTops[1], dailyRanges[0], '#168d82')}</g>
      <g data-panel="utah-daily">${dailyBars('unidadesUtah', panelTops[2], dailyRanges[1], '#547ec8', '#d7833d')}</g>
      <g data-panel="cp-daily">${dailyBars('porcionesFrio', panelTops[3], dailyRanges[2], '#8d65b8')}</g>
      ${dateLabels()}
    </svg>`;

    return `<div class="thermal-charts">
      <article class="thermal-chart"><header><strong>Evolucion acumulada</strong><small>Temperaturas minima y maxima dan contexto; HF, Utah y CP conservan escalas independientes.</small></header>${accumulatedSvg}</article>
      <article class="thermal-chart"><header><strong>Aporte diario</strong><small>Utah se calcula hora a hora; temperaturas mayores a 15,9 C pueden descontar unidades.</small></header>${dailySvg}</article>
    </div>`;
  }

  private renderTablaClimaAgronomica(
    clima: CertificadoClima | undefined,
    frio: CertificadoFrio,
    esPerenne: boolean,
  ): string {
    if (!clima) {
      return '<p>Sin clima consolidado para este informe. Chaman mantiene la trazabilidad con sensores y datos del lote disponibles.</p>';
    }

    const requirement = clima.requerimientoFrio;
    const requirementReading = this.getLecturaRequisitoFrio(requirement);
    const frostLevel = clima.riesgoHelada
      ? this.capitalize(clima.riesgoHelada.nivel)
      : 'Sin alerta consolidada';
    const thermalBase = Number.isFinite(
      clima.requerimientos.temperaturaBaseGradosDia,
    )
      ? `Base ${this.formatNumber(Number(clima.requerimientos.temperaturaBaseGradosDia), 0)} C`
      : 'Temperatura base no calibrada';

    const items: string[][] = esPerenne
      ? [
          [
            'Horas frio (HF)',
            this.formatClimaMetric(clima.acumulados.horasFrio, 'HF', 1),
            'Modelo 0 a 7,2 C sobre la serie horaria canonica',
          ],
          [
            'Unidades Utah',
            this.formatClimaMetric(clima.acumulados.unidadesFrioUtah, 'UF', 1),
            'Modelo Utah independiente; puede descontar calor',
          ],
          [
            'Chill portions (CP)',
            this.formatClimaMetric(clima.acumulados.porcionesFrio, 'CP', 2),
            'Dynamic Model horario; nunca convertido desde HF o HFE',
          ],
          [
            'Requisito varietal',
            requirementReading,
            requirement?.source || 'Pendiente de calibracion',
          ],
          [
            'Grados dia',
            this.formatClimaMetric(clima.acumulados.gradosDia, 'GD', 1),
            thermalBase,
          ],
          ['Riesgo helada', frostLevel, this.getDetalleHelada(clima)],
          [
            'Fuente y calidad',
            clima.fuente,
            `${this.formatNumber(clima.completitudPct, 0)}% completitud${Number.isFinite(clima.coberturaCampoPct) ? `; ${this.formatNumber(Number(clima.coberturaCampoPct), 0)}% temperatura de campo` : ''}`,
          ],
        ]
      : [
          [
            'Lluvia acumulada',
            this.formatClimaMetric(clima.acumulados.lluvia, 'mm', 1),
            'Periodo operativo del cultivo',
          ],
          [
            'Grados dia',
            this.formatClimaMetric(clima.acumulados.gradosDia, 'GD', 1),
            thermalBase,
          ],
          ...(clima.procesoTermico === 'vernalizacion_anual'
            ? [
                [
                  'Vernalizacion varietal',
                  this.formatClimaMetric(
                    clima.acumulados.vernalizacion,
                    'UV',
                    1,
                  ),
                  clima.estadoParametros === 'validado'
                    ? this.formatObjetivo(
                        clima.requerimientos.vernalizacionObjetivo,
                        'UV',
                      )
                    : 'No calculada sin habito, modelo, requisito y fuente varietal',
                ],
              ]
            : []),
          ['Riesgo helada', frostLevel, this.getDetalleHelada(clima)],
          [
            'Fuente y calidad',
            clima.fuente,
            `${this.formatNumber(clima.completitudPct, 0)}% completitud; motor ${clima.versionCalculo || 'sin version'}`,
          ],
        ];

    const rows = items
      .map(
        ([label, value, detail]) => `
        <tr>
          <td>${this.escapeHtml(label)}</td>
          <td>${this.escapeHtml(value)}</td>
          <td>${this.escapeHtml(detail)}</td>
        </tr>`,
      )
      .join('');

    return `<table><thead><tr><th>Variable</th><th>Valor</th><th>Lectura</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note"><strong>Lectura climatica:</strong> ${this.escapeHtml(clima.lectura)}</div>
      ${clima.advertencias.length ? `<div class="note warn"><strong>Calidad y supuestos:</strong> ${this.escapeHtml(clima.advertencias.slice(0, 4).join(' '))}</div>` : ''}`;
  }

  private renderTablaSatelital(
    reportes: IReporteNDVI[],
    siembra?: ISiembra,
  ): string {
    const puntos = this.getPuntosNdviCertificado(reportes, siembra);
    if (!puntos.length) {
      return '<p>Sin reportes satelitales procesados para este lote.</p>';
    }
    const rows = puntos
      .map((punto) => {
        const delta =
          punto.delta === undefined
            ? 'Base'
            : `${punto.delta >= 0 ? '+' : ''}${this.formatNumber(punto.delta, 3)}`;
        const dia =
          punto.diaCultivo === undefined ? '-' : `D+${punto.diaCultivo}`;
        const calidad =
          punto.coberturaValida === undefined
            ? 'No informada'
            : `${this.formatNumber(punto.coberturaValida, 1)}% valida`;
        const etapaEstado = punto.etapaConfirmada
          ? 'Confirmada a campo'
          : 'Referencia estimada';
        return `<tr>
        <td>${this.escapeHtml(punto.fecha || '-')}</td>
        <td>${this.escapeHtml(dia)}</td>
        <td><strong>${this.escapeHtml(punto.etapa)}</strong><br><small>${this.escapeHtml(`${etapaEstado} · ${punto.etapaFuente}`)}</small></td>
        <td>${this.escapeHtml(this.formatNumber(punto.valor, 3))}</td>
        <td>${this.escapeHtml(delta)}</td>
        <td>${this.escapeHtml(calidad)}</td>
        <td>${this.escapeHtml(punto.coleccion)}</td>
      </tr>`;
      })
      .join('');
    const complementarios = puntos
      .filter((punto) =>
        [punto.ndre, punto.evi, punto.savi, punto.ndmi, punto.ndwi].some(
          (value) => Number.isFinite(value),
        ),
      )
      .map(
        (punto) => `<tr>
        <td>${this.escapeHtml(punto.fecha || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(punto.ndre, 3))}</td>
        <td>${this.escapeHtml(this.formatMaybe(punto.evi, 3))}</td>
        <td>${this.escapeHtml(this.formatMaybe(punto.savi, 3))}</td>
        <td>${this.escapeHtml(this.formatMaybe(punto.ndmi, 3))}</td>
        <td>${this.escapeHtml(this.formatMaybe(punto.ndwi, 3))}</td>
      </tr>`,
      )
      .join('');
    const tablaComplementaria = complementarios
      ? `<h3 style="margin-top:18px;">Indices complementarios por escena</h3>
        <p class="section-copy">NDRE aporta sensibilidad a clorofila; EVI y SAVI complementan vigor/cobertura; NDMI y NDWI aportan contexto hidrico. No deben compararse como si fueran la misma variable.</p>
        <table><thead><tr><th>Escena</th><th>NDRE</th><th>EVI</th><th>SAVI</th><th>NDMI</th><th>NDWI</th></tr></thead><tbody>${complementarios}</tbody></table>`
      : '';
    return `<h3>Trazabilidad de escenas</h3>
      <table class="tracking-table"><thead><tr><th>Escena</th><th>Dia ciclo</th><th>Etapa fenologica</th><th>NDVI</th><th>Cambio</th><th>Calidad</th><th>Fuente</th></tr></thead><tbody>${rows}</tbody></table>
      ${tablaComplementaria}`;
  }

  private renderTablaFenologia(
    items: { nombre: string; valor: string }[],
    siembra?: ISiembra,
  ): string {
    if (!items.length) {
      return `<p>Sin cronograma fenologico cargado. ${this.escapeHtml(this.getDiasCultivoTexto(siembra))}</p>`;
    }
    const rows = items
      .map(
        (item) =>
          `<tr><td>${this.escapeHtml(item.nombre)}</td><td>${this.escapeHtml(item.valor)}</td></tr>`,
      )
      .join('');
    return `<table><thead><tr><th>Etapa</th><th>Referencia</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaEnfermedades(
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
  ): string {
    const prediccion = this.getPrediccionSanitariaReciente(
      siembra,
      predicciones,
    );
    const enfermedades = prediccion?.enfermedades || [];
    if (!enfermedades.length) {
      return '<p>Sin prediccion sanitaria reciente. El informe conserva el estado como pendiente de calculo y no interpreta un registro historico como riesgo actual.</p>';
    }
    const operativas = enfermedades.filter((item) =>
      esLecturaSanitariaOperativa(item),
    ).length;
    const fueraDeVentana = enfermedades.filter(
      (item) => item.estado === 'fuera_ventana',
    ).length;
    const rows = enfermedades
      .map((item) => {
        const operativa = esLecturaSanitariaOperativa(item);
        const nombreCanonico =
          getEnfermedadPorId(item.idEnfermedad)?.nombre || item.enfermedad;
        const estado = this.getEstadoSanitarioInforme(item);
        const estadoClase = operativa ? 'operativo' : 'pendiente';
        const manchaRedV4 =
          item.idEnfermedad === 'cebada.mancha_red' &&
          Number(item.modelo?.version || 0) >= 4;
        const lectura = operativa
          ? manchaRedV4
            ? `${this.formatMaybe(item.resultado, 1)}/100 - indice ambiental de infeccion`
            : `${this.formatMaybe(item.resultado, 1)}% - ${this.getNivelRiesgoTexto(item.resultado, siembra?.semilla?.cultivo)}`
          : item.estado === 'fuera_ventana'
            ? '0% operativo'
            : 'Sin porcentaje operativo';
        return `
      <tr>
        <td><strong>${this.escapeHtml(nombreCanonico)}</strong></td>
        <td><span class="sanitary-state ${estadoClase}">${this.escapeHtml(estado)}</span></td>
        <td>${this.escapeHtml(lectura)}</td>
        <td>${this.escapeHtml(this.getEvidenciaSanitariaInforme(item))}</td>
      </tr>`;
      })
      .join('');
    const pendientes = enfermedades.length - operativas;
    const resumen =
      fueraDeVentana === enfermedades.length
        ? `<div class="sanitary-summary"><strong>Sin riesgo sanitario activo en este corte</strong><span>Los ${fueraDeVentana} modelos estan fuera de su ventana sensible y permanecen en seguimiento.</span></div>`
        : pendientes
          ? `<div class="sanitary-summary warn"><strong>${operativas} modelo(s) operativo(s)</strong><span>${pendientes} evaluacion(es) permanecen pendientes o fuera de ventana y no elevan alertas.</span></div>`
          : `<div class="sanitary-summary"><strong>${operativas} modelo(s) operativo(s)</strong><span>Todos se encuentran dentro de su ventana de evaluacion.</span></div>`;
    return `${resumen}<table class="sanitary-table"><thead><tr><th>Enfermedad</th><th>Estado</th><th>Lectura actual</th><th>Evidencia principal</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="sanitary-source"><strong>Fuente sanitaria:</strong> temperatura, humedad relativa del aire, lluvia, acumulacion termica, fenologia y resistencia varietal. La humedad de suelo no sustituye humedad foliar ni integra por si sola este riesgo.</p>`;
  }

  private getEstadoSanitarioInforme(
    item: NonNullable<IPrediccion['enfermedades']>[number],
  ): string {
    if (esLecturaSanitariaOperativa(item)) return 'En ventana';
    if (item.estado === 'fuera_ventana') return 'Fuera de ventana';
    if (item.modelo?.validacion === 'experimental') return 'Experimental';
    if (['baja', 'sin_datos'].includes(item.calidadDatos?.nivel || '')) {
      return 'Datos insuficientes';
    }
    if (
      !item.resistenciaUsada?.estado ||
      item.resistenciaUsada.estado === 'desconocida'
    ) {
      return 'Resistencia pendiente';
    }
    return 'Pendiente';
  }

  private getEvidenciaSanitariaInforme(
    item: NonNullable<IPrediccion['enfermedades']>[number],
  ): string {
    const variables = (item.variables || {}) as Record<string, unknown>;
    if (
      item.idEnfermedad === 'cebada.mancha_red' &&
      Number(item.modelo?.version || 0) >= 4
    ) {
      const favorables = this.toNumber(
        variables.diasFavorablesVentana ?? variables.eventosCompatibles,
      );
      const dias = this.toNumber(variables.diasVentana);
      const cobertura = this.toNumber(variables.coberturaVentana) * 100;
      const mojado = this.toNumber(variables.horasMojadoContinuo);
      const temperatura = this.toNumber(variables.temperaturaMojado);
      const pico = this.toNumber(variables.intensidadPico);
      return `${this.formatNumber(favorables, 0)} dia(s) favorable(s) dentro de un ciclo de ${this.formatNumber(dias, 0)} dias; intensidad maxima ${this.formatNumber(pico, 1)}/100; cobertura horaria ${this.formatNumber(cobertura, 0)}%; ultimo mojado continuo ${this.formatNumber(mojado, 1)} h a ${this.formatNumber(temperatura, 1)} C. Es presion ambiental condicionada a inoculo y requiere recorrida para confirmar sintomas.`;
    }
    const gddSiembra = this.toNumber(variables.GDDBase0Siembra);
    const umbralGdd = this.toNumber(variables.UmbralInicioGdd);
    if (
      Number.isFinite(gddSiembra) &&
      Number.isFinite(umbralGdd) &&
      umbralGdd > 0
    ) {
      const avance = this.limitarPorcentaje((gddSiembra / umbralGdd) * 100);
      return `Seguimiento termico: ${this.formatNumber(gddSiembra, 1)} de ${this.formatNumber(umbralGdd, 0)} GDD base 0 C (${this.formatNumber(avance, 0)}% del umbral).`;
    }
    if (item.estado === 'fuera_ventana') {
      return /fusarium/i.test(item.enfermedad || '')
        ? 'El modelo se habilita desde espigazon/antesis observada.'
        : 'La etapa fenologica sensible aun no fue alcanzada.';
    }
    const etiquetas: Record<string, string> = {
      DPrHRT: 'dias con lluvia, HR y temperatura favorables',
      DPr: 'dias con precipitacion favorable',
      DHR: 'dias con humedad relativa favorable',
      GD: 'grados-dia dentro de la ventana',
      GDN: 'grados-dia desde antesis',
      PMoj: 'periodos de mojado',
      DL: 'dias sin lluvia',
    };
    const evidencia = Object.entries(etiquetas)
      .filter(([key]) => Number.isFinite(this.toNumber(variables[key])))
      .slice(0, 3)
      .map(
        ([key, label]) => `${label}: ${this.formatMaybe(variables[key], 1)}`,
      );
    return evidencia.length
      ? evidencia.join('; ')
      : 'Seguimiento por clima, fenologia y perfil varietal.';
  }

  private renderCargaFitosanitaria(carga: ICargaFitosanitaria): string {
    const factores = carga.factores
      .map(
        (factor) => `
      <tr>
        <td>${this.escapeHtml(factor.nombre)}</td>
        <td>${this.escapeHtml(`${this.formatNumber(factor.valor, 0)}/100`)}</td>
        <td>${this.escapeHtml(`${this.formatNumber(factor.peso, 0)}%`)}</td>
        <td>${this.escapeHtml(factor.detalle)}</td>
      </tr>`,
      )
      .join('');
    const advertencias = carga.advertencias.length
      ? `<div class="note warn"><strong>Calidad de datos:</strong><ul>${carga.advertencias.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul></div>`
      : '';

    return `
      <div class="sanitary-management">
        <div><span>Nivel</span><strong>${this.escapeHtml(this.capitalize(carga.nivel.replace('_', ' ')))}</strong></div>
        <div><span>Presion sanitaria</span><strong>${this.escapeHtml(`${carga.presionEnfermedades}/100`)}</strong></div>
        <div><span>Aplicaciones</span><strong>${this.escapeHtml(`${carga.aplicacionesTotales} totales / ${carga.aplicacionesUltimos30Dias} recientes`)}</strong></div>
      </div>
      <div class="note sanitary-recommendation">
        <strong>Recomendacion:</strong> ${this.escapeHtml(carga.recomendacion)}
      </div>
      ${
        factores
          ? `<h3 style="margin-top:12px;">Factores considerados</h3><table><thead><tr><th>Factor</th><th>Valor</th><th>Peso</th><th>Detalle</th></tr></thead><tbody>${factores}</tbody></table>`
          : ''
      }
      ${advertencias}
    `;
  }

  private renderTablaFertilizaciones(
    fertilizaciones: IFertilizacion[],
  ): string {
    if (!fertilizaciones.length) {
      return '<p>Sin fertilizaciones registradas.</p>';
    }
    const rows = fertilizaciones
      .map(
        (item) => `
      <tr>
        <td>${this.escapeHtml(this.formatDate(item.fechaFertilizacion || item.fechaCreacion) || '-')}</td>
        <td>${this.escapeHtml(item.fertilizante?.nombre || item.idFertilizante || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(item.dosisKgHa, 2))} kg/ha</td>
      </tr>`,
      )
      .join('');
    return `<table><thead><tr><th>Fecha</th><th>Producto</th><th>Dosis</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaFumigaciones(fumigaciones: IFumigacion[]): string {
    if (!fumigaciones.length) {
      return '<p>Sin fumigaciones registradas.</p>';
    }
    const rows = fumigaciones
      .map(
        (item) => `
      <tr>
        <td>${this.escapeHtml(this.formatDate(item.fechaFumigacion || item.fechaCreacion) || '-')}</td>
        <td>${this.escapeHtml(item.agroquimico?.nombre || item.principioActivo?.nombre || item.idAgroquimico || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(item.dosisLtHa, 2))} l/ha</td>
        <td>${this.escapeHtml(this.formatMaybe(item.concentracion, 2))}</td>
      </tr>`,
      )
      .join('');
    return `<table><thead><tr><th>Fecha</th><th>Producto / activo</th><th>Dosis</th><th>Conc.</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaSuelo(
    lote: ILote,
    assessment?: IInteligenciaSueloLote | null,
  ): string {
    if (
      assessment?.summary &&
      ['ready', 'partial'].includes(assessment.status)
    ) {
      const summary = assessment.summary;
      const fuente = assessment.source?.provider || 'Motor edafico Chaman';
      const confianza = assessment.source?.confidence || 'unavailable';
      const confianzaTexto: Record<string, string> = {
        high: 'alta',
        medium: 'media',
        low: 'baja',
        unavailable: 'no disponible',
      };
      const profundidad = Number.isFinite(summary.effectiveDepthCm)
        ? `${this.formatNumber(summary.effectiveDepthCm!, 0)} cm${summary.effectiveDepthIsFallback ? ' (referencia; no medida)' : ''}`
        : 'Sin profundidad efectiva consolidada';
      const aguaPotencial = Number.isFinite(
        summary.profileAvailableWaterMm ?? summary.rootZoneAvailableWaterMm,
      )
        ? `${this.formatNumber(Number(summary.profileAvailableWaterMm ?? summary.rootZoneAvailableWaterMm), 1)} mm`
        : 'Sin dato';
      const capas = (assessment.depthProfile || [])
        .map(
          (capa) => `<tr>
        <td>${this.escapeHtml(`${capa.depthFromCm}-${capa.depthToCm} cm`)}</td>
        <td>${this.escapeHtml(capa.chamanTexture || capa.usdaTexture || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(capa.fieldCapacityPercentage, 1))}%</td>
        <td>${this.escapeHtml(this.formatMaybe(capa.wiltingPointPercentage, 1))}%</td>
        <td>${this.escapeHtml(this.formatMaybe(capa.availableWaterMmPerMeter, 1))} mm/m</td>
      </tr>`,
        )
        .join('');
      const tablaCapas = capas
        ? `<table style="margin-top:14px;"><thead><tr><th>Prof.</th><th>Textura</th><th>Capacidad campo</th><th>Marchitez</th><th>Capacidad potencial</th></tr></thead><tbody>${capas}</tbody></table>`
        : '<p>El motor edafico tiene resumen regional, pero no una serie por profundidad disponible en este corte.</p>';
      return `<div class="note"><strong>Motor de suelo Chaman:</strong> ${this.escapeHtml(this.getSueloTexto(lote, assessment))} · ${this.escapeHtml(fuente)} · confianza ${this.escapeHtml(confianzaTexto[confianza] || confianza)}. Profundidad efectiva: ${this.escapeHtml(profundidad)}. Capacidad potencial del perfil (agua util): ${this.escapeHtml(aguaPotencial)}. No representa humedad actual.</div>${tablaCapas}`;
    }

    const suelos = lote.suelos || [];
    if (!suelos.length) {
      return '<p>Sin caracterizacion edafica consolidada en este corte. No se infiere humedad actual ni reserva efectiva.</p>';
    }
    const rows = suelos
      .map(
        (suelo) => `
      <tr>
        <td>${this.escapeHtml(this.formatMaybe(suelo.profundidad, 0))} cm</td>
        <td>${this.escapeHtml(suelo.textura || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(suelo.capacidadDeCampo, 1))}%</td>
        <td>${this.escapeHtml(this.formatMaybe(suelo.puntoMarchitez, 1))}%</td>
        <td>${suelo.hayRaices ? 'Si' : 'No'}</td>
      </tr>`,
      )
      .join('');
    return `<table style="margin-top:14px;"><thead><tr><th>Prof.</th><th>Textura</th><th>Capacidad campo</th><th>Marchitez</th><th>Raices</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderPendientes(pendientes: string[]): string {
    if (!pendientes.length) {
      return '<div class="note"><strong>Control de calidad:</strong> El informe cuenta con los datos principales para seguimiento operativo.</div>';
    }
    return `<div class="note warn"><strong>Datos pendientes para robustecer el informe:</strong><ul>${pendientes.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul></div>`;
  }

  private getResumenRiesgo(
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
  ): { titulo: string; detalle: string; clase: string } {
    const prediccion = this.getPrediccionSanitariaReciente(
      siembra,
      predicciones,
    );
    const todas = prediccion?.enfermedades || [];
    const enfermedades = this.getLecturasSanitariasOperativas(prediccion);
    if (!enfermedades.length) {
      const fueraVentana = todas.filter(
        (item) => item.estado === 'fuera_ventana',
      ).length;
      return {
        titulo:
          fueraVentana === todas.length && fueraVentana > 0
            ? 'Fuera de ventana sensible'
            : todas.length
              ? 'Evaluacion pendiente'
              : 'Sin prediccion reciente',
        detalle:
          fueraVentana === todas.length && fueraVentana > 0
            ? `${fueraVentana} modelo(s) en seguimiento; no integran el riesgo actual`
            : todas.length
              ? `${todas.length} modelo(s) requieren validacion antes de emitir una alerta`
              : 'Actualizar riesgo para cruzar fenologia, humedad del aire, lluvia y temperatura',
        clase: fueraVentana === todas.length && fueraVentana > 0 ? '' : 'warn',
      };
    }
    const max = Math.max(
      ...enfermedades.map((item) => this.normalizarRiesgo(item.resultado)),
    );
    const nivel = clasificarNivelRiesgoSanitario(
      max,
      siembra?.semilla?.cultivo,
    );
    if (nivel === 'alto') {
      return {
        titulo: 'Alto',
        detalle: `${enfermedades.length} enfermedades monitoreadas`,
        clase: 'danger',
      };
    }
    if (nivel === 'medio') {
      return {
        titulo: 'Medio',
        detalle: `${enfermedades.length} enfermedades monitoreadas`,
        clase: 'warn',
      };
    }
    return {
      titulo: 'Bajo',
      detalle: `${enfermedades.length} enfermedades monitoreadas`,
      clase: '',
    };
  }

  private getResumenHuella(
    lote: ILote,
    siembra?: ISiembra,
  ): {
    total: string;
    verde: string;
    azul: string;
    gris: string;
    detalle: string;
  } {
    const huella = siembra?.huellaHidrica || lote.huellaHidrica;
    const verde = huella?.verde?.litrosKg ?? huella?.verde?.litrosKcal;
    const azul = huella?.azul?.litrosKg ?? huella?.azul?.litrosKcal;
    const gris = huella?.gris?.litrosKg ?? huella?.gris?.litrosKcal;
    const total = huella?.total?.litrosKg ?? huella?.total?.litrosKcal;
    return {
      total: total ? `${this.formatNumber(total, 0)} l/kg` : 'En seguimiento',
      verde: verde ? `${this.formatNumber(verde, 0)} l/kg` : 'Sin consolidar',
      azul: azul ? `${this.formatNumber(azul, 0)} l/kg` : '0 l/kg',
      gris: gris ? `${this.formatNumber(gris, 0)} l/kg` : '0 l/kg',
      detalle: siembra?.fechaCosecha
        ? 'Consolidada al cierre si existe rendimiento'
        : 'Parcial hasta cierre o carga de rendimiento',
    };
  }

  private getFrioCertificado(
    lote: ILote,
    siembra?: ISiembra,
    clima?: CertificadoClima,
  ): CertificadoFrio {
    const cultivo = siembra?.semilla?.cultivo || '';
    const aplica =
      clima?.procesoTermico === 'dormancia_perenne' ||
      esCultivoPerenne(cultivo);
    const req = siembra?.semilla?.requerimientoFrio;
    const dispositivo = this.getDispositivoFrio(lote);
    const acumulado = dispositivo?.frioAcumulado;
    const requirement = clima?.requerimientoFrio;
    const requirementValid =
      requirement?.status === 'validado' &&
      requirement.model !== 'sin_calibrar';
    const datosInsuficientes =
      requirement?.interpretation === 'datos_insuficientes';
    const objetivos = {
      horasFrio:
        requirementValid && requirement?.model === 'HF'
          ? requirement.target
          : req?.estado === 'validado' && req.modeloRector === 'HF'
            ? req.horasFrio
            : undefined,
      horasFrioEfectivas: undefined,
      porcionesFrio:
        requirementValid && requirement?.model === 'CP'
          ? requirement.target
          : req?.estado === 'validado' && req.modeloRector === 'CP'
            ? req.porcionesFrio
            : undefined,
    };

    if (!aplica) {
      return {
        aplica: false,
        fuente: 'No aplica',
        titulo: 'No aplica',
        detalle:
          clima?.procesoTermico === 'vernalizacion_anual'
            ? 'Cultivo anual: la vernalizacion se informa por separado'
            : 'Cultivo sin dormancia perenne',
        lectura:
          clima?.procesoTermico === 'vernalizacion_anual'
            ? 'Trigo y cebada no usan los modelos de dormancia de frutales.'
            : 'El cultivo no requiere seguimiento de dormancia perenne.',
        objetivos,
      };
    }

    if (clima?.origen === 'canonico') {
      const piezas = this.compactar([
        datosInsuficientes
          ? this.formatAvanceFrio(
              'HF parcial',
              clima.acumulados.horasFrio,
              undefined,
              'HF',
              1,
            )
          : this.formatAvanceFrio(
              'HF',
              clima.acumulados.horasFrio,
              objetivos.horasFrio,
              'HF',
              1,
            ),
        Number.isFinite(clima.acumulados.unidadesFrioUtah)
          ? `Utah ${this.formatNumber(Number(clima.acumulados.unidadesFrioUtah), 1)} UF`
          : '',
        datosInsuficientes
          ? this.formatAvanceFrio(
              'CP parcial',
              clima.acumulados.porcionesFrio,
              undefined,
              'CP',
              2,
            )
          : this.formatAvanceFrio(
              'CP',
              clima.acumulados.porcionesFrio,
              objetivos.porcionesFrio,
              'CP',
              2,
            ),
      ]);
      return {
        aplica: true,
        fuente: clima.fuente,
        titulo: datosInsuficientes
          ? 'Dormancia: datos insuficientes'
          : requirementValid
            ? `Requisito varietal ${requirement?.model}`
            : 'Dormancia: requisito sin calibrar',
        detalle: piezas.join(' | ') || 'Sin serie horaria suficiente',
        lectura: datosInsuficientes
          ? clima.lectura || this.getLecturaRequisitoFrio(requirement)
          : this.compactar([
              clima.lectura,
              requirementValid
                ? requirement?.compatible
                  ? 'Compatibilidad climatica alcanzada; confirmar el inicio real de etapa a campo.'
                  : 'Requisito varietal en acumulacion.'
                : 'La acumulacion no se compara contra un objetivo hasta validar modelo rector, valor y fuente varietal.',
            ]).join(' '),
        acumulado,
        dispositivo,
        objetivos,
      };
    }

    const piezas = this.compactar([
      this.formatAvanceFrio(
        'HF',
        acumulado?.horasFrio,
        objetivos.horasFrio,
        'h',
        0,
      ),
    ]);

    const fecha = this.formatDate(acumulado?.fechaUltimoCalculo);
    const ultimaTemp = Number.isFinite(acumulado?.ultimaTemperatura)
      ? `Ultima temp. ${this.formatNumber(Number(acumulado?.ultimaTemperatura), 1)} C`
      : '';
    const fuente = acumulado
      ? `Sensor LoRa ${dispositivo?.nombre || dispositivo?.deveui || ''}`.trim()
      : clima?.fuente || 'Perfil varietal / clima de respaldo';

    return {
      aplica: true,
      fuente,
      titulo: acumulado
        ? 'Vista previa HF del sensor'
        : req?.modelo || 'Frio varietal',
      detalle: piezas.join(' | ') || 'Perfil varietal editable',
      lectura: this.compactar([
        acumulado
          ? `HF preliminar con sensor asociado hasta ${fecha || 'ultimo reporte'}; Utah y CP se certifican en el motor horario canonico.`
          : 'Sin serie canonica disponible; no se declara cumplimiento del requisito varietal.',
        clima?.lectura,
        ultimaTemp,
      ]).join(' '),
      acumulado,
      dispositivo,
      objetivos,
    };
  }

  private getDispositivoFrio(lote: ILote): IDispositivo | undefined {
    return (lote.dispositivos || []).find((dispositivo) => {
      const frio = dispositivo.frioAcumulado;
      return (
        !!frio &&
        frio.versionModelo === 'hf-field-preview-1.0.0' &&
        Number.isFinite(frio.horasFrio)
      );
    });
  }

  private formatAvanceFrio(
    label: string,
    valor?: number,
    objetivo?: number,
    unidad = '',
    digits = 1,
  ): string {
    const valorOk = Number.isFinite(valor);
    const objetivoOk = Number.isFinite(objetivo);
    const suffix = unidad ? ` ${unidad}` : '';

    if (!valorOk && !objetivoOk) {
      return '';
    }

    if (!valorOk && objetivoOk) {
      return `${label} objetivo ${this.formatNumber(Number(objetivo), digits)}${suffix}`;
    }

    if (valorOk && !objetivoOk) {
      return `${label} acumulado ${this.formatNumber(Number(valor), digits)}${suffix}`;
    }

    const faltante = Math.max(0, Number(objetivo) - Number(valor));
    return `${label} ${this.formatNumber(Number(valor), digits)}${suffix} / objetivo ${this.formatNumber(Number(objetivo), digits)}${suffix} (faltan ${this.formatNumber(faltante, digits)}${suffix})`;
  }

  private getResumenFrioTermico(
    clima: CertificadoClima | undefined,
    frio: CertificadoFrio,
  ): string {
    if (clima) {
      const acumulados =
        this.compactar([
          Number.isFinite(clima.acumulados.horasFrio)
            ? `${this.formatNumber(Number(clima.acumulados.horasFrio), 0)} HF`
            : '',
          Number.isFinite(clima.acumulados.unidadesFrioUtah)
            ? `${this.formatNumber(Number(clima.acumulados.unidadesFrioUtah), 1)} UF`
            : '',
          Number.isFinite(clima.acumulados.porcionesFrio)
            ? `${this.formatNumber(Number(clima.acumulados.porcionesFrio), 2)} CP`
            : '',
        ]).join(' / ') || 'Sin frio horario consolidado';
      return clima.requerimientoFrio?.interpretation === 'datos_insuficientes'
        ? `Datos insuficientes - ${acumulados} parciales`
        : acumulados;
    }
    return frio.titulo;
  }

  private getDetalleFrioTermico(
    clima: CertificadoClima | undefined,
    frio: CertificadoFrio,
  ): string {
    if (!clima) {
      return frio.detalle;
    }
    const requirement = clima.requerimientoFrio;
    return this.compactar([
      requirement?.interpretation === 'datos_insuficientes'
        ? this.getLecturaRequisitoFrio(requirement)
        : '',
      Number.isFinite(clima.acumulados.gradosDia)
        ? `GD ${this.formatNumber(Number(clima.acumulados.gradosDia), 1)}`
        : '',
      clima.riesgoHelada
        ? `helada ${this.capitalize(clima.riesgoHelada.nivel)}`
        : 'helada sin alerta consolidada',
      clima.fuente,
    ]).join(' | ');
  }

  private getDetalleHelada(clima?: CertificadoClima): string {
    if (!clima?.riesgoHelada) {
      return 'Sin alerta consolidada';
    }
    const detalle = this.compactar([
      clima.riesgoHelada.fechaCritica
        ? this.formatDate(clima.riesgoHelada.fechaCritica)
        : '',
      Number.isFinite(clima.riesgoHelada.temperaturaMinima)
        ? `${this.formatNumber(Number(clima.riesgoHelada.temperaturaMinima), 1)} C`
        : '',
      clima.riesgoHelada.dias
        ? `${clima.riesgoHelada.dias} dia(s) en ventana`
        : '',
    ]).join(' | ');
    return detalle || clima.riesgoHelada.lectura || 'Sin alerta inmediata';
  }

  private formatClimaMetric(
    value: unknown,
    unidad: string,
    digits = 1,
  ): string {
    const numero = this.toNumber(value);
    return Number.isFinite(numero)
      ? `${this.formatNumber(numero, digits)} ${unidad}`
      : 'Sin dato';
  }

  private formatObjetivo(value: unknown, unidad: string): string {
    const numero = this.toNumber(value);
    return Number.isFinite(numero)
      ? `Objetivo ${this.formatNumber(numero, unidad === 'CP' ? 1 : 0)} ${unidad}`
      : 'Objetivo editable';
  }

  private getLecturaRequisitoFrio(
    requirement?: IRespuestaAgrometeorologiaSiembra['summary']['coldRequirement'],
  ): string {
    if (requirement?.interpretation === 'datos_insuficientes') {
      const coverage = this.toNumber(requirement.coveragePercentage);
      const minimum = this.toNumber(requirement.minimumCoveragePercentage);
      const accumulated = this.toNumber(requirement.accumulated);
      const unit =
        requirement.model === 'HF' || requirement.model === 'CP'
          ? requirement.model
          : '';
      const partes = this.compactar([
        'Datos insuficientes para evaluar el requisito de frio.',
        Number.isFinite(coverage)
          ? `Cobertura horaria ${this.formatNumber(coverage, 0)}%`
          : 'Cobertura horaria no consolidada',
        Number.isFinite(minimum)
          ? `minimo requerido ${this.formatNumber(minimum, 0)}%`
          : '',
        requirement.continuitySufficient === false &&
        Number.isFinite(this.toNumber(requirement.maximumGapHours)) &&
        Number.isFinite(this.toNumber(requirement.maximumAllowedGapHours))
          ? `Brecha continua maxima ${this.formatNumber(
              this.toNumber(requirement.maximumGapHours),
              0,
            )} h; maximo admitido ${this.formatNumber(
              this.toNumber(requirement.maximumAllowedGapHours),
              0,
            )} h`
          : '',
        Number.isFinite(accumulated) && unit
          ? `Acumulado parcial auditable ${this.formatNumber(
              accumulated,
              unit === 'CP' ? 2 : 1,
            )} ${unit}`
          : '',
        'No se calcula avance ni respuesta biologica con esta cobertura.',
      ]);
      return partes.join(' ');
    }

    if (
      requirement?.status === 'validado' &&
      requirement.model !== 'sin_calibrar'
    ) {
      return `${this.formatClimaMetric(
        requirement.accumulated,
        requirement.model,
        requirement.model === 'CP' ? 2 : 1,
      )} / ${this.formatObjetivo(requirement.target, requirement.model)}; ${
        requirement.compatible
          ? 'clima compatible, confirmar etapa a campo'
          : 'en acumulacion'
      }`;
    }

    return 'Sin modelo rector y fuente varietal validados; no se declara cumplimiento biologico';
  }

  private getLecturaEjecutiva(
    datos: CertificadoDatos,
    riesgo: { titulo: string; detalle: string },
    huella: { total: string },
    frio: { detalle: string },
    clima?: CertificadoClima,
  ): string {
    const cultivo = datos.siembra?.semilla?.cultivo || 'cultivo';
    const esPerenne = esCultivoPerenne(cultivo);
    const partes = [
      `${cultivo}: seguimiento generado con ${datos.predicciones.length} prediccion(es), ${datos.fertilizaciones.length} fertilizacion(es), ${datos.fumigaciones.length} fumigacion(es) y ${datos.reportesNdvi.length} escena(s) satelital(es) complementaria(s).`,
      clima
        ? `Clima operativo: lluvia ${this.formatMaybe(clima.acumulados.lluvia, 1)} mm, helada ${clima.riesgoHelada ? this.capitalize(clima.riesgoHelada.nivel) : 'sin alerta consolidada'}, fuente ${clima.fuente}.`
        : 'Sin clima consolidado en el informe.',
      `Riesgo sanitario ${riesgo.titulo.toLowerCase()} (${riesgo.detalle}).`,
      `Carga fitosanitaria ${datos.cargaFitosanitaria.score}/100 (${this.capitalize(datos.cargaFitosanitaria.nivel.replace('_', ' '))}).`,
      `Huella hidrica ${huella.total}.`,
    ];
    if (esPerenne) {
      const requirement = clima?.requerimientoFrio;
      partes.push(
        clima
          ? `Frio y termica: ${this.getResumenFrioTermico(clima, datos.frio)}; GD ${this.formatMaybe(clima.acumulados.gradosDia, 1)}. ${
              requirement?.interpretation === 'datos_insuficientes'
                ? this.getLecturaRequisitoFrio(requirement)
                : requirement?.interpretation ===
                    'compatible_requiere_confirmacion'
                  ? 'Compatibilidad climatica; confirmar etapa a campo.'
                  : 'No se declara cumplimiento biologico sin calibracion varietal.'
            }`
          : `Frio y termica: ${frio.detalle}.`,
      );
    }
    return partes.join(' ');
  }

  private getPendientesCertificado(
    lote: ILote,
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
    clima?: CertificadoClima,
    soilAssessment?: IInteligenciaSueloLote | null,
  ): string[] {
    const pendientes: string[] = [];
    if (!this.tieneSueloConsolidado(lote, soilAssessment)) {
      pendientes.push(
        'Completar perfil de suelo para riego, huella y capacidad productiva.',
      );
    }
    const capacidadAutomatica = (soilAssessment?.depthProfile || []).some(
      (capa) => Number.isFinite(capa.fieldCapacityPercentage),
    );
    if (
      !lote.capacidadDeCampo &&
      !lote.suelos?.some((suelo) => suelo.capacidadDeCampo) &&
      !capacidadAutomatica
    ) {
      pendientes.push(
        'Cargar capacidad de campo o calibrarla con sensor de humedad.',
      );
    }
    if (!siembra?.semilla?.variedad) {
      pendientes.push('Completar variedad/portainjerto del cultivo.');
    }
    if (!clima) {
      pendientes.push(
        'Consolidar clima de establecimiento o estacion/sensor para trazabilidad climatica.',
      );
    }
    const prediccionSanitaria = this.getPrediccionSanitariaReciente(
      siembra,
      predicciones,
    );
    if (!this.getLecturasSanitariasOperativas(prediccionSanitaria).length) {
      const evaluaciones = prediccionSanitaria?.enfermedades || [];
      const todasFueraVentana =
        evaluaciones.length > 0 &&
        evaluaciones.every((item) => item.estado === 'fuera_ventana');
      if (!todasFueraVentana) {
        pendientes.push(
          evaluaciones.length
            ? 'Validar las evaluaciones sanitarias pendientes antes de tratarlas como riesgo operativo.'
            : 'Ejecutar monitoreo sanitario para dejar trazabilidad operativa reciente de enfermedades.',
        );
      }
    }
    if (
      !siembra?.rendimientoObtenidoKgHa &&
      !siembra?.rendimientoObtenidoKgHaSeco
    ) {
      pendientes.push(
        'Cargar rendimiento esperado o cosecha para consolidar litros/kg y capacidad de rinde.',
      );
    }
    return pendientes;
  }

  private getVariedadTexto(siembra?: ISiembra): string {
    const semilla = siembra?.semilla;
    return (
      this.compactar([
        semilla?.variedad,
        semilla?.ciclo,
        semilla?.portainjerto ? `pie ${semilla.portainjerto}` : '',
      ]).join(' / ') || 'Sin variedad cargada'
    );
  }

  private tieneSueloConsolidado(
    lote: ILote,
    assessment?: IInteligenciaSueloLote | null,
  ): boolean {
    return !!(
      (assessment?.summary &&
        ['ready', 'partial'].includes(assessment.status)) ||
      lote.sueloReferencia ||
      lote.suelos?.length ||
      lote.texturaEscorrentia ||
      lote.texturaLixiviacion
    );
  }

  private getSueloTexto(
    lote: ILote,
    assessment?: IInteligenciaSueloLote | null,
  ): string {
    return (
      assessment?.summary?.operationalTexture ||
      assessment?.summary?.canonicalTexture ||
      assessment?.summary?.estimatedTexture ||
      lote.texturaEscorrentia ||
      lote.texturaLixiviacion ||
      lote.suelos?.find((suelo) => !!suelo.textura)?.textura ||
      'Sin dato'
    );
  }

  private getFuenteSuelo(
    lote: ILote,
    assessment?: IInteligenciaSueloLote | null,
  ): string {
    if (
      assessment?.summary &&
      ['ready', 'partial'].includes(assessment.status)
    ) {
      const fuente = assessment.source?.provider || 'Motor edafico Chaman';
      const confianza = assessment.source?.confidence
        ? ` · confianza ${assessment.source.confidence}`
        : '';
      return `${fuente}${confianza}`;
    }
    if (lote.sueloReferencia?.fuente) {
      return `Fuente: ${lote.sueloReferencia.fuente}`;
    }
    if (lote.suelos?.length) {
      return `${lote.suelos.length} nivel(es) editables`;
    }
    return 'Editable en lote';
  }

  private tieneSensorOMeteorologiaAsociada(lote: ILote): boolean {
    if (
      lote.sondaSuelo ||
      lote.idSondaSuelo ||
      lote.establecimiento?.idEstacionMeteorologica ||
      lote.establecimiento?.estacionMeteorologica
    ) {
      return true;
    }
    return (lote.dispositivos || []).some((item) => {
      const tipo = this.normalizar(`${item?.tipo || ''}`);
      return (
        (tipo.includes('sensor') &&
          tipo.includes('humedad') &&
          tipo.includes('suelo')) ||
        tipo.includes('estacion meteorologica') ||
        tipo.includes('pluviometro')
      );
    });
  }

  private getResumenSensoresMeteorologicos(lote: ILote): string {
    const partes: string[] = [];
    if (
      lote.establecimiento?.idEstacionMeteorologica ||
      lote.establecimiento?.estacionMeteorologica
    ) {
      partes.push('central meteorologica del establecimiento');
    }
    if (lote.sondaSuelo || lote.idSondaSuelo) {
      partes.push('sonda de humedad de suelo');
    }
    const dispositivos = (lote.dispositivos || []).filter((item) => {
      const tipo = this.normalizar(`${item?.tipo || ''}`);
      return (
        (tipo.includes('sensor') &&
          tipo.includes('humedad') &&
          tipo.includes('suelo')) ||
        tipo.includes('estacion meteorologica') ||
        tipo.includes('pluviometro')
      );
    }).length;
    if (dispositivos)
      partes.push(`${dispositivos} dispositivo(s) meteorologico(s)`);
    return partes.join(' · ') || 'Fuente meteorologica asociada';
  }

  private getRiegoTexto(siembra?: ISiembra): string {
    const recomendacion = siembra?.ultimaPrediccionRiego?.[0] as any;
    const estado = this.getEstadoRecomendacionRiego(siembra);
    if (
      (estado === 'calculada' || estado === 'estimada') &&
      typeof recomendacion?.cantidad === 'number' &&
      Number.isFinite(recomendacion.cantidad) &&
      recomendacion.cantidad >= 0
    ) {
      return `${this.formatNumber(recomendacion.cantidad, 1)} mm${
        estado === 'estimada' ? ' estimados' : ''
      }`;
    }
    if (this.tieneAguaUtilValida(siembra)) {
      return `${this.formatNumber(siembra.aguaUtilReal, 1)} mm agua util`;
    }
    return 'Sin recomendacion';
  }

  private getEstadoRecomendacionRiego(
    siembra?: ISiembra,
  ): 'calculada' | 'estimada' | 'no_disponible' | 'fallida' {
    const estado = siembra?.estadoRecomendacionRiego;
    if (estado) return estado;

    const tieneSerie = (siembra?.ultimaPrediccionRiego || []).some(
      (item) =>
        typeof item.cantidad === 'number' &&
        Number.isFinite(item.cantidad) &&
        item.cantidad >= 0,
    );
    if (!tieneSerie) {
      return siembra?.estadoCalculoAguaUtil === 'fallida'
        ? 'fallida'
        : 'no_disponible';
    }
    if (siembra?.estadoCalculoAguaUtil === 'calculado') return 'calculada';
    if (siembra?.estadoCalculoAguaUtil === 'estimado') return 'estimada';
    if (
      siembra?.estadoCalculoAguaUtil === 'no_disponible' &&
      /recomendacion estimada por balance/i.test(
        siembra.motivoCalculoAguaUtil || '',
      )
    ) {
      return 'estimada';
    }
    return 'no_disponible';
  }

  private tieneAguaUtilValida(siembra?: ISiembra): boolean {
    return !!(
      siembra &&
      (siembra.estadoCalculoAguaUtil === 'calculado' ||
        siembra.estadoCalculoAguaUtil === 'estimado') &&
      typeof siembra.aguaUtilReal === 'number' &&
      Number.isFinite(siembra.aguaUtilReal) &&
      siembra.aguaUtilReal >= 0
    );
  }

  private getAguaUtilTexto(siembra?: ISiembra): string {
    if (siembra?.estadoCalculoAguaUtil) {
      return siembra.estadoCalculoAguaUtil;
    }
    return siembra?.motivoCalculoAguaUtil || 'Depende de sensor, suelo y clima';
  }

  private getEstadoFenologico(
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
  ): string {
    if (!siembra) {
      return 'Sin siembra activa';
    }
    if (siembra.fechaCosecha) {
      return 'Cosecha registrada';
    }
    const ultima = predicciones[0] || siembra.ultimaPrediccion;
    if (ultima?.nombreEtapa) {
      return ultima.nombreEtapa;
    }
    const fenologia = this.getFenologiaItems(siembra);
    const dias = this.getDiasDesde(siembra.fechaSiembra);
    if (dias === undefined || !fenologia.length) {
      return 'En seguimiento';
    }
    let acumulado = 0;
    let etapa = fenologia[0]?.nombre || 'En seguimiento';
    for (const item of fenologia) {
      const valor = Number(String(item.valor).match(/\d+(\.\d+)?/)?.[0]);
      if (!Number.isFinite(valor)) {
        continue;
      }
      acumulado += valor;
      if (dias >= acumulado) {
        etapa = item.nombre;
      }
    }
    return etapa;
  }

  private getFenologiaItems(
    siembra?: ISiembra,
  ): { nombre: string; valor: string }[] {
    const items: { nombre: string; valor: string }[] = [];
    const referencia = siembra?.semilla?.fenologiaReferencia;
    if (referencia?.brotacion) {
      items.push({ nombre: 'Brotacion esperada', valor: referencia.brotacion });
    }
    if (referencia?.floracion) {
      items.push({ nombre: 'Floracion esperada', valor: referencia.floracion });
    }
    if (referencia?.cosecha) {
      items.push({ nombre: 'Cosecha esperada', valor: referencia.cosecha });
    }
    if (referencia?.etapas) {
      for (const [nombre, valor] of Object.entries(referencia.etapas)) {
        items.push({ nombre: this.prettyKey(nombre), valor: `${valor}` });
      }
    }
    const etapas = siembra?.crono?.etapas;
    if (etapas) {
      for (const [nombre, valor] of Object.entries(etapas)) {
        items.push({ nombre: this.prettyKey(nombre), valor: `${valor} dias` });
      }
    }
    return items;
  }

  private getDiasCultivoTexto(siembra?: ISiembra): string {
    if (!siembra?.fechaSiembra) {
      return 'Sin fecha de inicio';
    }
    const dias = this.getDiasDesde(siembra.fechaSiembra);
    const etiqueta = siembra.fechaCosecha
      ? 'Ciclo cerrado'
      : 'Dias desde inicio';
    return dias === undefined ? 'Sin fecha valida' : `${etiqueta}: ${dias}`;
  }

  private getDiasDesde(fecha?: string): number | undefined {
    if (!fecha) {
      return undefined;
    }
    const inicio = new Date(fecha).getTime();
    if (!Number.isFinite(inicio)) {
      return undefined;
    }
    return Math.max(0, Math.floor((Date.now() - inicio) / 86400000));
  }

  private formatVariables(variables?: unknown): string {
    if (!variables || typeof variables !== 'object') {
      return '-';
    }
    return Object.entries(variables as Record<string, unknown>)
      .map(
        ([key, value]) =>
          `${this.prettyKey(key)}: ${this.formatMaybe(value, 2)}`,
      )
      .join(' | ');
  }

  private normalizarRiesgo(value?: number): number {
    const numero = Number(value);
    if (!Number.isFinite(numero)) {
      return 0;
    }
    return this.limitarPorcentaje(numero);
  }

  private getNivelRiesgoTexto(value?: number, cultivo?: string): string {
    if (
      value === undefined ||
      value === null ||
      !Number.isFinite(Number(value))
    ) {
      return 'Sin riesgo calculado';
    }
    const riesgo = this.normalizarRiesgo(value);
    return this.capitalize(clasificarNivelRiesgoSanitario(riesgo, cultivo));
  }

  private formatHectareas(value?: number): string {
    return Number.isFinite(value)
      ? `${this.formatNumber(value, 2)} ha`
      : 'Sin dato';
  }

  private formatMaybe(value: unknown, digits = 1): string {
    const numero = this.toNumber(value);
    return Number.isFinite(numero) ? this.formatNumber(numero, digits) : '-';
  }

  private formatNumber(value: number, digits = 1): string {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(value);
  }

  private formatCssNumber(value: number, digits = 1): string {
    return Number(value || 0)
      .toFixed(digits)
      .replace(/\.0$/, '');
  }

  private formatDate(value?: string): string {
    if (!value) {
      return '';
    }
    const fecha = new Date(value);
    if (!Number.isFinite(fecha.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(fecha);
  }

  private formatDateShort(value?: string): string {
    if (!value) {
      return '';
    }
    const fecha = new Date(value);
    if (!Number.isFinite(fecha.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
    }).format(fecha);
  }

  private formatDateTime(value?: string): string {
    if (!value) {
      return '';
    }
    const fecha = new Date(value);
    if (!Number.isFinite(fecha.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(fecha);
  }

  private prettyKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (value) => value.toUpperCase());
  }

  private escapeHtml(value: unknown): string {
    return `${value ?? ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async consultarSueloIntaLocal(
    lat: number,
    lng: number,
  ): Promise<ISueloInta | null> {
    try {
      return await this.repository.getSueloIntaLocal(lat, lng);
    } catch (error) {
      this.logger.warn(
        `Suelo INTA local no disponible: ${error?.message || error}`,
      );
      return null;
    }
  }

  private crearRespuestaSueloInta(lat: number, lng: number): SueloIntaResponse {
    return {
      fuente: 'INTA Atlas de Suelos 1:500.000/1:1.000.000',
      servicio: 'geo-backend.inta.gob.ar/geoserver/ows (WFS)',
      fechaConsulta: new Date().toISOString(),
      ubicacion: { lat, lng },
      encontrado: false,
      editable: true,
    };
  }

  private crearRespuestaSueloIntaEncontrada(
    properties: Record<string, any>,
    base: SueloIntaResponse,
  ): SueloIntaResponse {
    const textura = this.inferirTexturaSuelo(properties);
    const drenaje = this.inferirDrenaje(properties);
    const erosion = this.inferirErosionPendiente(properties);
    const capacidad = this.capacidadPorTextura(textura);
    const profundidad = this.toNumber(properties.profund_s1);
    const indiceProductividad = this.toNumber(properties.ind_prod);
    const pendiente = this.toNumber(properties.porc_pens1);
    const sueloReferencia: ISueloReferencia = {
      fuente: base.fuente,
      servicio: base.servicio,
      fechaConsulta: base.fechaConsulta,
      confianza: this.calcularConfianza(properties),
      provincia: properties.provincia,
      unidadCartografica: properties.simbc,
      tipoUnidad: properties.tipo_uc,
      limitaciones: this.compactar([
        properties.limit_ppal,
        properties.limit_secu,
        properties.limit_terc,
      ]),
      indiceProductividad,
      orden: properties.orden_sue1,
      granGrupo: properties.ggrup_sue1,
      subGrupo: properties.sgrup_sue1,
      texturaSuperficial: properties.text_sups1,
      texturaSubsuelo: properties.text_bs1,
      drenaje: properties.drenaje_s1,
      profundidadCm: profundidad,
      pendientePorcentaje: pendiente,
      raw: properties,
    };

    const sugerencias: Partial<IUpdateLote> = {
      sueloReferencia,
      capacidadDeCampo: capacidad.capacidadDeCampo,
      puntoMarchitez: capacidad.puntoMarchitez,
      texturaLixiviacion: textura,
      texturaEscorrentia: textura,
      drenajeNaturalLixiviacion: drenaje,
      drenajeNaturalEscorrentia: drenaje,
      erosionEscorrentiaPendiente: erosion,
      suelos: [
        {
          numeroDeSensor: 1,
          profundidad: profundidad
            ? Math.min(Math.max(profundidad, 20), 100)
            : 30,
          textura,
          hayRaices: true,
          capacidadDeCampo: capacidad.capacidadDeCampo,
          puntoMarchitez: capacidad.puntoMarchitez,
        },
      ],
    };

    return {
      ...base,
      encontrado: true,
      confianza: sueloReferencia.confianza,
      mensaje:
        'Datos sugeridos desde INTA. Se pueden editar antes de guardar el lote.',
      resumen: sueloReferencia,
      sugerencias,
      raw: properties,
    };
  }

  private inferirTexturaSuelo(properties: Record<string, any>): TTexturaSuelo {
    const texto = this.normalizar(
      `${properties.text_sups1 || ''} ${properties.text_bs1 || ''}`,
    );

    if (texto.includes('lim') && texto.includes('franco')) {
      return 'Franco limoso';
    }
    if (texto.includes('lim')) {
      return 'Limoso';
    }
    if (texto.includes('aren') && texto.includes('franco')) {
      return 'Franco arenoso';
    }
    if (texto.includes('aren')) {
      return 'Arenoso';
    }
    if (texto.includes('arcill') && texto.includes('franco')) {
      return 'Franco arcilloso';
    }
    if (texto.includes('arcill')) {
      return 'Arcilloso';
    }
    return 'Franco';
  }

  private inferirDrenaje(properties: Record<string, any>): TTipoDrenaje {
    const drenaje = this.normalizar(properties.drenaje_s1);
    if (drenaje.includes('exces')) {
      return 'Excesivamente Drenado';
    }
    if (drenaje.includes('bien')) {
      return 'Bien Drenado';
    }
    if (drenaje.includes('moder') || drenaje.includes('imperfect')) {
      return 'Moderadamente Drenado';
    }
    if (drenaje.includes('mal') || drenaje.includes('pobre')) {
      return 'Mal Drenado';
    }
    return 'Bien Drenado';
  }

  private inferirErosionPendiente(
    properties: Record<string, any>,
  ): TTipoErosionEscorrentiaPendiente {
    const pendiente = this.toNumber(properties.porc_pens1);
    if (pendiente > 15) {
      return 'Muy Alta (> 15%)';
    }
    if (pendiente > 8) {
      return 'Alta (8 - 15%)';
    }
    if (pendiente > 3) {
      return 'Moderada (3 - 8%)';
    }
    return 'Baja (0 - 3%)';
  }

  private capacidadPorTextura(
    textura: TTexturaSuelo,
  ): Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'> {
    const valores: Record<
      TTexturaSuelo,
      Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'>
    > = {
      Arcilloso: { capacidadDeCampo: 40, puntoMarchitez: 22 },
      'Franco arcilloso': { capacidadDeCampo: 35, puntoMarchitez: 18 },
      Franco: { capacidadDeCampo: 30, puntoMarchitez: 14 },
      'Franco limoso': { capacidadDeCampo: 32, puntoMarchitez: 15 },
      Limoso: { capacidadDeCampo: 31, puntoMarchitez: 13 },
      'Franco arenoso': { capacidadDeCampo: 22, puntoMarchitez: 10 },
      Arenoso: { capacidadDeCampo: 14, puntoMarchitez: 6 },
    };
    return valores[textura];
  }

  private calcularConfianza(
    properties: Record<string, any>,
  ): 'alta' | 'media' | 'baja' {
    if (properties.text_sups1 && properties.drenaje_s1 && properties.ind_prod) {
      return 'alta';
    }
    if (properties.text_sups1 || properties.drenaje_s1) {
      return 'media';
    }
    return 'baja';
  }

  private normalizar(value: any): string {
    return `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private capitalize(value?: string): string {
    if (!value) {
      return '-';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private toNumber(value: any): number | undefined {
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : undefined;
  }

  private compactar(values: any[]): string[] {
    return values
      .map((value) => `${value || ''}`.trim())
      .filter((value) => value && value !== '-');
  }

  private async getUltimaFechaNdvi(
    idLote: string,
    permiso: IPermiso,
  ): Promise<string | null> {
    const ultimo = await this.getUltimoReporteNdviReferencia(idLote, permiso);
    return ultimo?.fecha || null;
  }

  private async getUltimoReporteNdviReferencia(
    idLote: string,
    permiso: IPermiso,
  ): Promise<{
    fecha: string | null;
    coleccion: string | null;
    renderVersion: string | null;
    knownScenes: NdviKnownScene[];
  } | null> {
    const query: IQueryParam = {
      filter: JSON.stringify({ idLote }),
      limit: 32,
      sort: '-fechaDeLaImagen',
    };
    const reportes = await this.reportesNDVIsService.get(query, permiso);
    const reportesOrdenados = [...(reportes?.datos || [])].sort((a, b) => {
      const fechaA = new Date(
        a.fechaDeLaImagen || a.fechaCreacion || 0,
      ).getTime();
      const fechaB = new Date(
        b.fechaDeLaImagen || b.fechaCreacion || 0,
      ).getTime();
      if (fechaA !== fechaB) {
        return fechaB - fechaA;
      }
      const fixedA =
        a.metadataImagen?.renderVersion === 'fixed-index-v3' ? 1 : 0;
      const fixedB =
        b.metadataImagen?.renderVersion === 'fixed-index-v3' ? 1 : 0;
      return fixedB - fixedA;
    });
    const ultimo = reportesOrdenados[0];
    if (!ultimo) {
      return null;
    }
    return {
      fecha: this.toIsoString(ultimo.fechaDeLaImagen || ultimo.fechaCreacion),
      coleccion: ultimo.coleccion || null,
      renderVersion: ultimo.metadataImagen?.renderVersion || null,
      knownScenes: reportesOrdenados
        .map((reporte) => ({
          date: this.toIsoString(
            reporte.fechaDeLaImagen || reporte.fechaCreacion,
          ),
          collection: reporte.coleccion || null,
        }))
        .filter(
          (scene): scene is NdviKnownScene =>
            typeof scene.date === 'string' && !!scene.date,
        ),
    };
  }

  private async getUltimaFechaNdviFixed(
    idLote: string,
    permiso: IPermiso,
  ): Promise<string | null> {
    const query: IQueryParam = {
      filter: JSON.stringify({
        idLote,
        'metadataImagen.renderVersion': 'fixed-index-v3',
      }),
      limit: 1,
      sort: '-fechaDeLaImagen',
    };
    const reportes = await this.reportesNDVIsService.get(query, permiso);
    const ultimo = reportes?.datos?.[0];
    return ultimo
      ? this.toIsoString(ultimo.fechaDeLaImagen || ultimo.fechaCreacion)
      : null;
  }

  private debeReprocesarRenderSatelital(
    reporte?: { fecha: string | null; renderVersion?: string | null } | null,
  ): boolean {
    return !!reporte?.fecha && reporte.renderVersion !== 'fixed-index-v3';
  }

  private toIsoString(value: unknown): string | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    const fecha = new Date(value as string);
    return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
  }

  private puedeVer(data: ILote, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Tenant') {
      return this.relacionCoincide(data.idTenant, permiso.idTenant);
    }
    if (permiso.nivel === 'Quimica') {
      return this.relacionCoincide(data.idQuimica, permiso.idQuimica);
    }
    if (permiso.nivel === 'Distribuidor') {
      return this.relacionCoincide(
        data.idDistribuidor,
        permiso.idDistribuidor,
      );
    }
    if (permiso.nivel === 'Asesor') {
      return permisoPuedeVerLote(permiso, data);
    }
    if (permiso.nivel === 'Productor') {
      return this.relacionCoincide(data.idProductor, permiso.idProductor);
    }
    if (permiso.nivel === 'Establecimiento') {
      return this.relacionCoincide(
        data.idEstablecimiento,
        permiso.idEstablecimiento,
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<ILote> = HelperService.filtroToObject(query.filter);
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Tenant') {
      this.agregarFiltroRelacion($and, 'idTenant', permiso.idTenant);
    }

    if (permiso.nivel === 'Quimica') {
      this.agregarFiltroRelacion($and, 'idQuimica', permiso.idQuimica);
    }
    if (permiso.nivel === 'Distribuidor') {
      this.agregarFiltroRelacion(
        $and,
        'idDistribuidor',
        permiso.idDistribuidor,
      );
    }
    if (permiso.nivel === 'Productor') {
      this.agregarFiltroRelacion($and, 'idProductor', permiso.idProductor);
    }
    if (permiso.nivel === 'Establecimiento') {
      this.agregarFiltroRelacion(
        $and,
        'idEstablecimiento',
        permiso.idEstablecimiento,
      );
    }
    if (permiso.nivel === 'Asesor') {
      $and.push({
        idEstablecimiento: { $in: establecimientosDelPermiso(permiso) },
      });
    }
    if (permiso.idLotes?.length) {
      $and.push({ _id: { $in: permiso.idLotes } });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }

  private relacionCoincide(
    idEntidad?: string,
    idPermiso?: string,
  ): boolean {
    return (
      !!idEntidad &&
      !!idPermiso &&
      String(idEntidad) === String(idPermiso)
    );
  }

  private agregarFiltroRelacion(
    filtros: Array<Record<string, unknown>>,
    campo: string,
    id?: string,
  ): void {
    if (id) {
      filtros.push({ [campo]: id });
      return;
    }
    // Un permiso malformado nunca debe convertirse en `{}` al serializarse,
    // porque eso ampliaria el listado a todos los lotes.
    filtros.push({ _id: { $in: [] } });
  }
}
