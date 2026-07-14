import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  TTexturaSuelo,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
  ISueloInta,
  ICargaFitosanitaria,
  IFitosanitarioAplicacionResumen,
  IFitosanitarioRiesgoSanitario,
  TNivelCargaFitosanitaria,
  esCultivoPerenne,
  getEtapasPerennesReferencia,
  IInteligenciaSueloLote,
  aplicarEntradasAgronomicasSuelo,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { LotesRepository } from './repository';
import { EstablecimientosService } from '../establecimiento/service';
import { ReporteNDVIsService } from '../reporte-ndvis/service';
import { NdviQueueService } from './ndvi-queue.service';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS, NDVI_SYNC_LIMIT } from '../../env';
import { ClimaService } from '../clima/service';

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
  reportesNdvi: IReporteNDVI[];
  predicciones: IPrediccion[];
  fertilizaciones: IFertilizacion[];
  fumigaciones: IFumigacion[];
  cargaFitosanitaria: ICargaFitosanitaria;
  frio: CertificadoFrio;
  clima?: IFrioTermicoCultivo;
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

  async create(data: ICreateLote, permiso): Promise<ILote> {
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
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para crear este establecimiento',
      );
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
    }

    const updated = await this.repository.update(id, data);
    if (current.idSiembra && this.cambiaDependenciaAgrometeorologica(data)) {
      this.repository
        .reprocesarAgrometeorologia(current.idSiembra)
        .catch((error) =>
          this.logger.error(
            `Error al reprocesar agrometeorologia del lote ${id}: ${error}`,
          ),
        );
    }
    return updated;
  }

  private cambiaDependenciaAgrometeorologica(data: IUpdateLote): boolean {
    const keys = [
      'ubicacion',
      'suelos',
      'capacidadDeCampo',
      'puntoMarchitez',
      'sueloReferencia',
      'aguaUtil',
      'idEstablecimiento',
    ];
    return keys.some((key) => Object.prototype.hasOwnProperty.call(data, key));
  }

  private withoutAutomaticDepartment<T>(input: T): T {
    const data = { ...input } as T & Record<string, unknown>;
    delete data.idDepartamento;
    delete data.ubicacionDepartamentoLegado;
    return data;
  }

  async delete(idLote: string, permiso: IPermiso): Promise<ILote> {
    await this.getById(idLote, permiso);
    // Borro los reportes asociados al lote
    const filter: IFilter<IReporteNDVI> = {
      idLote,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    await this.reportesNDVIsService.deleteMany(query, permiso);
    // Borro el lote
    return await this.repository.delete(idLote);
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
      reprocesarRender,
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

  async generarCertificado(id: string, permiso: IPermiso): Promise<string> {
    const lote = await this.resolveLotWithSoilInputs(
      await this.getById(id, permiso),
    );
    const siembra = lote.siembra;

    const [reportesNdvi, predicciones, fertilizaciones, fumigaciones, clima] =
      await Promise.all([
        this.getReportesNdviCertificado(id, permiso),
        this.getPrediccionesCertificado(siembra?._id),
        this.getFertilizacionesCertificado(id),
        this.getFumigacionesCertificado(siembra?._id),
        this.getClimaCertificado(lote, siembra),
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
      reportesNdvi,
      predicciones,
      fertilizaciones,
      fumigaciones,
      cargaFitosanitaria,
      frio: this.getFrioCertificado(lote, siembra),
      clima,
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
          this.debeReprocesarRenderSatelital(ultimoReporte),
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

        const lote = await this.repository.getById(idLote);
        const encolado = await this.ndviQueue.enqueueLote(
          lote,
          fecha,
          reporte.coleccion || null,
          true,
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
    const prediccion = predicciones[0] || siembra?.ultimaPrediccion;
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
    );
  }

  private async getFertilizacionesCertificado(
    idLote: string,
  ): Promise<IFertilizacion[]> {
    return this.getListadoInterno<IFertilizacion>(
      'fertilizacions',
      { idLote },
      {
        limit: 20,
        sort: '-fechaFertilizacion',
        populate: JSON.stringify({ path: 'fertilizante' }),
      },
    );
  }

  private async getFumigacionesCertificado(
    idSiembra?: string,
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
    );
  }

  private async getClimaCertificado(
    lote: ILote,
    siembra?: ISiembra,
  ): Promise<IFrioTermicoCultivo | undefined> {
    const centro = this.getCentroOperativo(lote);
    if (!centro) {
      return undefined;
    }

    const req = siembra?.semilla?.requerimientoFrio;
    try {
      return await this.climaService.getFrioTermico(
        centro.lat,
        centro.lng,
        siembra?.semilla?.cultivo,
        {
          horasFrioObjetivo: req?.horasFrio,
          horasFrioEfectivasObjetivo: req?.horasFrioEfectivas,
          porcionesFrioObjetivo: req?.porcionesFrio,
        },
        {
          variedad: siembra?.semilla?.variedad,
          fechaSiembra: siembra?.fechaSiembra,
          edadProductivaDesdeAnios:
            siembra?.semilla?.fenologiaReferencia?.edadProductivaDesdeAnios,
          ajusteVarietalC: siembra?.semilla?.sensibilidadHelada?.ajusteUmbralC,
          fuenteAjusteVarietal: siembra?.semilla?.sensibilidadHelada?.fuente,
        },
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo calcular clima/frio para certificado: ${error?.message || error}`,
      );
      return undefined;
    }
  }

  private async getListadoInterno<T>(
    recurso: string,
    filter: Record<string, unknown>,
    extraParams: Partial<IQueryParam> = {},
  ): Promise<T[]> {
    try {
      const response = await this.axios.GET<IListado<T>>(
        `${API_DATOS}/${recurso}`,
        {
          params: {
            ...extraParams,
            filter: JSON.stringify(filter),
          },
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
    } = datos;
    const semilla = siembra?.semilla;
    const cultivo = semilla?.cultivo || 'Cultivo sin definir';
    const esPerenne = ['Vid', 'Peral', 'Pecan', 'Manzano'].includes(cultivo);
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
      font-size: 14px;
      line-height: 1.45;
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
      gap: 28px;
      padding: 34px 38px;
      background:
        radial-gradient(circle at 15% 20%, rgba(46, 212, 202, 0.18), transparent 28%),
        linear-gradient(135deg, #ffffff 0%, #f6fbfd 45%, #e9f8f5 100%);
      border-bottom: 1px solid var(--line);
    }
    .brand { letter-spacing: 0; }
    .brand small {
      display: inline-block;
      color: var(--cyan);
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.05;
      font-weight: 800;
    }
    h2 {
      color: var(--cyan);
      font-size: 18px;
      margin: 0 0 10px;
      text-transform: uppercase;
    }
    h3 {
      margin: 0 0 10px;
      font-size: 16px;
    }
    .hero-meta {
      display: grid;
      gap: 10px;
      align-content: center;
    }
    .pill {
      display: inline-flex;
      width: max-content;
      padding: 8px 14px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.75);
      font-weight: 700;
    }
    .section {
      padding: 24px 32px;
      border-bottom: 1px solid var(--line);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .grid.three { grid-template-columns: repeat(3, 1fr); }
    .card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      background: linear-gradient(135deg, #fff, #f8fbfe);
      min-height: 92px;
    }
    .card span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .card strong {
      display: block;
      font-size: 20px;
      line-height: 1.15;
    }
    .card small { color: var(--muted); }
    .executive-board {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-top: 14px;
    }
    .score-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      background: #fff;
      min-height: 112px;
    }
    .score-card span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .score-card strong {
      display: block;
      font-size: 24px;
      line-height: 1.1;
    }
    .score-card small {
      display: block;
      color: var(--muted);
      margin-top: 6px;
    }
    .score-meter {
      height: 9px;
      border-radius: 999px;
      background: #e9f1f8;
      overflow: hidden;
      margin-top: 10px;
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
      padding: 16px 18px;
      background: linear-gradient(135deg, #f2fffd, #ffffff);
      margin-top: 16px;
    }
    .action-panel ol {
      margin: 10px 0 0;
      padding-left: 20px;
    }
    .action-panel li { margin: 7px 0; }
    .summary-chart {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
      background: #fff;
    }
    .score-row {
      display: grid;
      grid-template-columns: 170px 1fr 70px;
      gap: 12px;
      align-items: center;
      padding: 9px 0;
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
      padding: 12px 14px;
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
      padding: 10px 14px 12px;
      color: var(--muted);
      font-size: 12px;
      border-top: 1px solid #e7eff6;
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
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 12px;
      background: #f3f8fb;
    }
    tr:last-child td { border-bottom: none; }
    .note {
      border-left: 4px solid var(--cyan);
      background: #eafdfb;
      border-radius: 10px;
      padding: 12px 14px;
      margin-top: 12px;
    }
    .warn { border-left-color: var(--amber); background: #fff8e8; }
    .danger { border-left-color: var(--danger); background: #fff0ef; }
    .two-col {
      display: grid;
      grid-template-columns: 0.95fr 1.05fr;
      gap: 16px;
      align-items: start;
    }
    .source-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .source-list div {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #f8fbfe;
    }
    .quality-board {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 14px 0 18px;
    }
    .quality-item {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: linear-gradient(135deg, #ffffff, #f8fbfe);
      min-height: 132px;
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
      font-size: 18px;
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
      margin: 9px 0 7px;
    }
    footer {
      padding: 18px 32px 28px;
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 900px) {
      .page { width: auto; margin: 0; border-radius: 0; }
      .hero, .two-col { grid-template-columns: 1fr; }
      .grid, .grid.three, .executive-board, .quality-board { grid-template-columns: 1fr; }
      .score-row { grid-template-columns: 1fr; gap: 6px; }
      .score-row strong { text-align: left; }
      .ndvi-summary { grid-template-columns: repeat(2, 1fr); }
      .ndvi-summary div:nth-child(2) { border-right: 0; }
      .ndvi-summary div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
      .tracking-table { font-size: 12px; }
    }
    @media print {
      body { background: white; }
      .page { width: auto; margin: 0; border: none; border-radius: 0; box-shadow: none; }
      .section { break-inside: auto; }
      .card, .score-card, .summary-chart, .ndvi-tracking, table { break-inside: avoid; }
      .ndvi-chart { min-height: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">
        <small>Chaman Agro</small>
        <h1>Informe ejecutivo de ambiente productivo</h1>
        <p>Trazabilidad agronomica, sanitaria y ambiental para ${this.escapeHtml(cultivo)} en el lote <strong>${this.escapeHtml(lote.nombre || 'Sin nombre')}</strong>.</p>
        <span class="pill">${this.escapeHtml(lote.establecimiento?.nombre || 'Sin establecimiento')}</span>
      </div>
      <div class="hero-meta">
        <div class="card"><span>Fecha de emision</span><strong>${fechaInforme}</strong><small>${this.escapeHtml(estado)}</small></div>
        <div class="card"><span>Etapa fenologica</span><strong>${this.escapeHtml(etapa)}</strong><small>${this.getDiasCultivoTexto(siembra)}</small></div>
      </div>
    </section>

    <section class="section">
      <h2>Lectura ejecutiva</h2>
      <p class="section-copy">Indicadores principales del ambiente/lote para seguimiento operativo, auditoria y conversacion tecnica con clientes.</p>
      ${this.renderTableroEjecutivo(datos, riesgo, clima)}
      ${this.renderPrioridadesEjecutivas(datos, riesgo, huella, frio, clima)}
      <h3 style="margin-top:18px;">Datos del ambiente</h3>
      <div class="grid">
        ${this.metricCard('Cultivo', cultivo, this.getVariedadTexto(siembra))}
        ${this.metricCard('Superficie', this.formatHectareas(lote.ubicacion?.superficie), 'Poligono Chaman')}
        ${this.metricCard('Suelo', this.getSueloTexto(lote), this.getFuenteSuelo(lote))}
        ${this.metricCard('Lluvia operativa', lluviaAcumulada, clima?.periodoFrio ? `Periodo ${this.formatDate(clima.periodoFrio.desde)} a ${this.formatDate(clima.periodoFrio.hasta)}` : 'Open-Meteo / estacion')}
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

    <section class="section">
      <h2>Fenologia y ciclo</h2>
      ${this.renderTablaFenologia(fenologia, siembra)}
    </section>

    <section class="section">
      <h2>Monitoreo sanitario</h2>
      ${this.renderTablaEnfermedades(siembra, predicciones)}
    </section>

    <section class="section">
      <h2>Carga fitosanitaria</h2>
      ${this.renderCargaFitosanitaria(cargaFitosanitaria)}
    </section>

    <section class="section two-col">
      <div>
        <h2>Fertilizaciones</h2>
        ${this.renderTablaFertilizaciones(fertilizaciones)}
      </div>
      <div>
        <h2>Fumigaciones</h2>
        ${this.renderTablaFumigaciones(fumigaciones)}
      </div>
    </section>

    <section class="section">
      <h2>Suelo, agua y huella</h2>
      <div class="grid three">
        ${this.metricCard('Huella verde', huella.verde, 'Lluvia efectiva consumida')}
        ${this.metricCard('Huella azul', huella.azul, 'Riego registrado')}
        ${this.metricCard('Huella gris', huella.gris, 'Fertilizantes y fitosanitarios registrados')}
      </div>
      ${this.renderTablaSuelo(lote)}
    </section>

    <section class="section">
      <h2>Seguimiento satelital del cultivo</h2>
      <p>La curva principal usa una escala NDVI fija de 0 a 1 para que los cambios sean comparables entre fechas y no se exageren variaciones pequenas. Cada escena se relaciona con el dia del ciclo y la mejor referencia fenologica disponible.</p>
      ${this.renderNdviSparkline(reportesNdvi, siembra)}
      <div class="note"><strong>Lectura satelital:</strong> ${this.escapeHtml(this.getResumenSatelital(reportesNdvi))}</div>
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
        <div><strong>Suelo</strong><br/>Datos editables del lote; INTA cuando existe consulta o carga de referencia.</div>
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
    } = datos;
    const climaActual = lote.establecimiento?.climaActual as any;
    const climaFuente =
      climaActual?.clima?.fuente ||
      climaActual?.fuente ||
      lote.establecimiento?.fuenteClimaPreferida ||
      'Open-Meteo';
    const climaScore = this.getScoreFuenteClimatica(
      climaFuente,
      climaActual?.clima?.calidadDatos?.score,
    );
    const ultimoNdvi = reportesNdvi[0];
    const ndviCoverage = this.toNumber(
      ultimoNdvi?.metadataImagen?.qualityMask?.validCoveragePct ??
        ultimoNdvi?.metadataImagen?.indicesStats?.ndvi?.validCoveragePct,
    );
    const ndviScore = ultimoNdvi
      ? Math.max(45, Math.min(92, ndviCoverage ?? 74))
      : 30;
    const ultimaPrediccion = predicciones[0];
    const enfermedades = ultimaPrediccion?.enfermedades || [];
    const sueloScore = lote.sueloReferencia?.confianza
      ? this.getScoreConfianzaTexto(lote.sueloReferencia.confianza)
      : lote.suelos?.length
        ? Math.min(82, 55 + lote.suelos.length * 7)
        : 30;
    const tieneSonda = !!lote.sondaSuelo || !!lote.idSondaSuelo;
    const riegoScore = tieneSonda
      ? 90
      : siembra?.ultimaPrediccionRiego?.length || siembra?.aguaUtilReal != null
        ? 62
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
          climaActual?.clima?.calidadDatos?.fechaActualizacion ||
            climaActual?.clima?.fecha ||
            climaActual?.fecha,
        ),
        lectura: clima
          ? 'Serie climatica aplicada en frio, heladas y balance operativo.'
          : 'Sin clima consolidado para el informe; se recomienda validar fuente.',
      },
      {
        modulo: 'Satelite',
        fuente: ultimoNdvi?.coleccion || 'STAC / Worker Chaman',
        confianza: this.getConfianzaTexto(ndviScore),
        score: ndviScore,
        ultimaActualizacion: this.getActualizacionTexto(
          ultimoNdvi?.fechaDeLaImagen || ultimoNdvi?.fechaCreacion,
        ),
        lectura: ultimoNdvi
          ? `Escena asociada al lote; NDVI ${this.formatMaybe(ultimoNdvi.ndviPromedio, 3)}.`
          : 'Sin escena satelital disponible en el informe.',
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
          ? `${enfermedades.length} enfermedad(es) con riesgo calculado.`
          : 'Sin prediccion sanitaria vigente para esta siembra.',
      },
      {
        modulo: 'Riego',
        fuente: tieneSonda ? 'Sensor de suelo' : 'ET0 + cultivo + suelo',
        confianza: this.getConfianzaTexto(riegoScore),
        score: riegoScore,
        ultimaActualizacion: this.getActualizacionTexto(
          this.getUltimaFechaDispositivos(lote.dispositivos),
        ),
        lectura: tieneSonda
          ? 'La sonda asignada debe guiar la decision operativa.'
          : 'Recomendacion modelada; mejora con sonda o perfil de suelo completo.',
      },
      {
        modulo: 'Suelo',
        fuente:
          lote.sueloReferencia?.fuente ||
          (lote.suelos?.length ? 'Carga del lote' : 'Sin perfil'),
        confianza: this.getConfianzaTexto(sueloScore),
        score: sueloScore,
        ultimaActualizacion: this.getActualizacionTexto(
          lote.sueloReferencia?.fechaConsulta,
        ),
        lectura:
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

  private getScoreFuenteClimatica(fuente?: string, score?: number): number {
    if (Number.isFinite(Number(score))) {
      return Math.round(Number(score));
    }
    const normalizada = this.normalizar(fuente);
    if (normalizada.includes('fieldclimate') || normalizada.includes('sensor'))
      return 92;
    if (normalizada.includes('meteoblue')) return 85;
    if (normalizada.includes('meteosource')) return 74;
    if (normalizada.includes('open') && normalizada.includes('meteo'))
      return 66;
    return 48;
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
    riesgo: { titulo: string; detalle: string },
    clima?: IFrioTermicoCultivo,
  ): string {
    const riesgoScore = this.getRiesgoSanitarioScore(
      datos.siembra,
      datos.predicciones,
    );
    const ndvi = this.getUltimoNdvi(datos.reportesNdvi);
    const riegoScore = this.getRiegoScore(datos.siembra);
    const huellaConsolidada = this.tieneHuellaConsolidada(
      datos.lote,
      datos.siembra,
    );
    const sateliteScore = ndvi
      ? this.limitarPorcentaje((ndvi.valor || 0) * 100)
      : 0;
    const climaDetalle = clima
      ? `Lluvia ${this.formatNumber(clima.acumulados.lluvia, 1)} mm | GD ${this.formatNumber(clima.acumulados.gradosDia, 1)}`
      : 'Sin clima consolidado';

    return `<div class="executive-board">
      ${this.scoreCard('Sanidad', riesgo.titulo, riesgoScore, riesgo.detalle, this.getRiesgoTone(riesgoScore))}
      ${this.scoreCard('Carga fitosanitaria', `${this.formatNumber(datos.cargaFitosanitaria.score, 0)}/100`, datos.cargaFitosanitaria.score, datos.cargaFitosanitaria.recomendacion, this.getRiesgoTone(datos.cargaFitosanitaria.score))}
      ${this.scoreCard('Agua y riego', this.getRiegoTexto(datos.siembra), riegoScore, this.getAguaUtilTexto(datos.siembra), riegoScore < 45 ? 'warn' : '')}
      ${this.scoreCard('Satelite', ndvi ? `NDVI ${this.formatNumber(ndvi.valor, 3)}` : 'Sin escena', sateliteScore, ndvi ? `Ultima escena ${ndvi.fecha || 'sin fecha'}` : 'Pendiente de escena limpia', ndvi ? '' : 'warn')}
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
    clima?: IFrioTermicoCultivo,
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
    clima?: IFrioTermicoCultivo,
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

    if (!datos.lote.suelos?.length) {
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
    riesgo: { titulo: string; detalle: string },
  ): string {
    const rows = [
      {
        label: 'Riesgo sanitario',
        value: this.getRiesgoSanitarioScore(datos.siembra, datos.predicciones),
        detail: riesgo.titulo,
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
      ${rows.map((item) => this.renderScoreRow(item.label, item.value, item.detail)).join('')}
    </div>`;
  }

  private renderScoreRow(label: string, value: number, detail: string): string {
    const safeValue = this.limitarPorcentaje(value);
    const tone = this.getRiesgoTone(safeValue);
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
    const prediccion = predicciones[0] || siembra?.ultimaPrediccion;
    const enfermedades = prediccion?.enfermedades || [];
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
    const recomendacion = siembra?.ultimaPrediccionRiego?.[0] as any;
    if (recomendacion?.recomendacion !== undefined) {
      return 85;
    }
    if (siembra?.aguaUtilReal !== undefined) {
      return 65;
    }
    return 25;
  }

  private tieneHuellaConsolidada(lote: ILote, siembra?: ISiembra): boolean {
    const huella = siembra?.huellaHidrica || lote.huellaHidrica;
    return !!(
      huella?.total?.litrosKg ||
      huella?.total?.litrosKcal ||
      huella?.verde?.litrosKg ||
      huella?.azul?.litrosKg ||
      huella?.gris?.litrosKg
    );
  }

  private getUltimoNdvi(
    reportes: IReporteNDVI[],
  ): { valor: number; fecha: string } | undefined {
    const ordenados = reportes
      .map((reporte) => ({
        fecha: this.formatDate(
          reporte.fechaDeLaImagen ||
            reporte.fechaDelReporte ||
            reporte.fechaCreacion,
        ),
        time: new Date(
          reporte.fechaDeLaImagen ||
            reporte.fechaDelReporte ||
            reporte.fechaCreacion ||
            '',
        ).getTime(),
        valor: this.toNumber(reporte.indices?.ndvi ?? reporte.ndviPromedio),
      }))
      .filter((item) => Number.isFinite(item.valor))
      .sort(
        (a, b) =>
          (Number.isFinite(b.time) ? b.time : 0) -
          (Number.isFinite(a.time) ? a.time : 0),
      );

    const ultimo = ordenados[0];
    return ultimo
      ? { valor: Number(ultimo.valor), fecha: ultimo.fecha }
      : undefined;
  }

  private getResumenSatelital(reportes: IReporteNDVI[]): string {
    const ordenados = reportes
      .map((reporte) => ({
        fecha: this.formatDate(
          reporte.fechaDeLaImagen ||
            reporte.fechaDelReporte ||
            reporte.fechaCreacion,
        ),
        time: new Date(
          reporte.fechaDeLaImagen ||
            reporte.fechaDelReporte ||
            reporte.fechaCreacion ||
            '',
        ).getTime(),
        valor: this.toNumber(reporte.indices?.ndvi ?? reporte.ndviPromedio),
        coleccion: reporte.coleccion || '',
      }))
      .filter((item) => Number.isFinite(item.valor))
      .sort(
        (a, b) =>
          (Number.isFinite(b.time) ? b.time : 0) -
          (Number.isFinite(a.time) ? a.time : 0),
      );

    if (!ordenados.length) {
      return 'Sin escenas limpias con NDVI procesado para este lote.';
    }

    const ultimo = ordenados[0];
    const anterior = ordenados[1];
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
        <text x="${left}" y="20" fill="#1f3047" font-size="12" font-weight="700">NDVI medio del lote Ã‚Â· escala fija 0-1</text>
        ${grilla}
        <line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="#9fb1c7" />
        <line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#9fb1c7" />
        <polygon points="${area}" fill="url(#areaNdvi)" />
        <polyline fill="none" stroke="url(#lineaNdvi)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${coords.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ')}" />
        ${puntosSvg}
        <text x="${(left + right) / 2}" y="274" text-anchor="middle" fill="#60708c" font-size="11">Fecha de escena y dia desde implantacion Ã‚Â· periodo ${this.escapeHtml(periodo)}</text>
      </svg>
      <p class="chart-caption">La escala permanece fija entre informes. Los cambios deben interpretarse contra fenologia, calidad de escena, clima, manejo y recorrida; NDVI por si solo no diagnostica causa.</p>
    </div>`;
  }

  private getPuntosNdviCertificado(
    reportes: IReporteNDVI[],
    siembra?: ISiembra,
  ): CertificadoNdviPunto[] {
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
        if (
          !Number.isFinite(time) ||
          !Number.isFinite(valor) ||
          valor < -1 ||
          valor > 1
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
          coberturaValida: this.getCoberturaNdvi(reporte),
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

  private getIndiceSatelitalValido(value: unknown): number | undefined {
    const numero = this.toNumber(value);
    return Number.isFinite(numero) && numero >= -1 && numero <= 1
      ? numero
      : undefined;
  }

  private getCoberturaNdvi(reporte: IReporteNDVI): number | undefined {
    const cobertura = this.toNumber(
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

    const registro = [...(siembra?.registrosFenologicos || [])]
      .filter((item) => {
        const time = new Date(item.fecha || '').getTime();
        return !!item.etapa && Number.isFinite(time) && time <= fecha.getTime();
      })
      .sort(
        (a, b) =>
          new Date(b.fecha || '').getTime() - new Date(a.fecha || '').getTime(),
      )[0];
    if (registro?.etapa) {
      return {
        nombre: registro.etapa,
        fuente: 'Registro de campo',
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
        nombre: `Dia ${dias} Ã‚Â· etapa termica a confirmar`,
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
      nombre: `Dia ${dias} Ã‚Â· etapa no registrada`,
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

  private renderClimaSparkline(clima?: IFrioTermicoCultivo): string {
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

  private renderTablaClimaAgronomica(
    clima: IFrioTermicoCultivo | undefined,
    frio: CertificadoFrio,
    esPerenne: boolean,
  ): string {
    if (!clima) {
      return '<p>Sin clima consolidado para este informe. Chaman mantiene la trazabilidad con sensores y datos del lote disponibles.</p>';
    }

    const items = esPerenne
      ? [
          [
            'Horas frio (HF)',
            this.formatClimaMetric(clima.acumulados.horasFrio, 'h', 1),
            this.formatObjetivo(clima.requerimientos.horasFrioObjetivo, 'h'),
          ],
          [
            'Frio efectivo (HFE)',
            this.formatClimaMetric(
              clima.acumulados.horasFrioEfectivas,
              'HFE',
              1,
            ),
            this.formatObjetivo(
              clima.requerimientos.horasFrioEfectivasObjetivo,
              'HFE',
            ),
          ],
          [
            'Chill portions (CP)',
            this.formatClimaMetric(clima.acumulados.porcionesFrio, 'CP', 2),
            this.formatObjetivo(
              clima.requerimientos.porcionesFrioObjetivo,
              'CP',
            ),
          ],
          [
            'Grados dia',
            this.formatClimaMetric(clima.acumulados.gradosDia, 'GD', 1),
            `Base ${this.formatNumber(clima.requerimientos.temperaturaBaseGradosDia || 10, 0)} C`,
          ],
          [
            'Riesgo helada',
            this.capitalize(clima.riesgoHelada.nivel),
            this.getDetalleHelada(clima),
          ],
          ['Fuente', clima.fuente, frio.fuente],
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
            `Base ${this.formatNumber(clima.requerimientos.temperaturaBaseGradosDia || 10, 0)} C`,
          ],
          [
            'Riesgo helada',
            this.capitalize(clima.riesgoHelada.nivel),
            this.getDetalleHelada(clima),
          ],
          [
            'Ventana sanitaria',
            this.capitalize(clima.eventos.ventanaSanitaria.estado),
            clima.eventos.ventanaSanitaria.lectura,
          ],
          [
            'Brotacion',
            this.capitalize(clima.eventos.brotacion.estado.replace(/_/g, ' ')),
            clima.eventos.brotacion.lectura,
          ],
          [
            'Fuente',
            clima.fuente,
            'Open-Meteo / estacion asociada cuando exista',
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
      <div class="note"><strong>Lectura climatica:</strong> ${this.escapeHtml(clima.lectura)}</div>`;
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
        <td><strong>${this.escapeHtml(punto.etapa)}</strong><br><small>${this.escapeHtml(`${etapaEstado} Ã‚Â· ${punto.etapaFuente}`)}</small></td>
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
    const prediccion = predicciones[0] || siembra?.ultimaPrediccion;
    const enfermedades = prediccion?.enfermedades || [];
    if (!enfermedades.length) {
      return '<p>Sin prediccion sanitaria reciente. El informe conserva el estado como pendiente de calculo.</p>';
    }
    const rows = enfermedades
      .map(
        (item) => `
      <tr>
        <td>${this.escapeHtml(item.enfermedad)}</td>
        <td>${this.escapeHtml(this.formatMaybe(item.resultado, 2))}</td>
        <td>${this.escapeHtml(this.getNivelRiesgoTexto(item.resultado))}</td>
        <td>${this.escapeHtml(this.formatVariables(item.variables))}</td>
      </tr>`,
      )
      .join('');
    return `<table><thead><tr><th>Enfermedad</th><th>Valor</th><th>Lectura</th><th>Variables usadas</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    const aplicaciones = carga.aplicaciones
      .slice(0, 8)
      .map(
        (item) => `
      <tr>
        <td>${this.escapeHtml(this.formatDate(item.fecha) || '-')}</td>
        <td>${this.escapeHtml(item.producto || '-')}</td>
        <td>${this.escapeHtml(item.principioActivo || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(item.dosisLtHa, 2))} l/ha</td>
        <td>${this.escapeHtml(`${item.aporte}/100`)}</td>
      </tr>`,
      )
      .join('');
    const advertencias = carga.advertencias.length
      ? `<div class="note warn"><strong>Calidad de datos:</strong><ul>${carga.advertencias.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul></div>`
      : '';

    return `
      <div class="grid three">
        ${this.metricCard('Nivel', this.capitalize(carga.nivel.replace('_', ' ')), carga.lectura)}
        ${this.metricCard('Presion sanitaria', `${carga.presionEnfermedades}/100`, `${carga.enfermedadesMonitoreadas} enfermedad(es) monitoreadas`)}
        ${this.metricCard('Carga quimica', `${carga.cargaQuimica}/100`, `${carga.aplicacionesTotales} fumigacion(es), ${carga.aplicacionesUltimos30Dias} reciente(s)`)}
      </div>
      <div class="note">
        <strong>Recomendacion:</strong> ${this.escapeHtml(carga.recomendacion)}
      </div>
      <h3 style="margin-top:16px;">Factores considerados</h3>
      <table><thead><tr><th>Factor</th><th>Valor</th><th>Peso</th><th>Detalle</th></tr></thead><tbody>${factores}</tbody></table>
      <h3 style="margin-top:16px;">Aplicaciones fitosanitarias recientes</h3>
      ${
        aplicaciones
          ? `<table><thead><tr><th>Fecha</th><th>Producto</th><th>Activo</th><th>Dosis</th><th>Aporte</th></tr></thead><tbody>${aplicaciones}</tbody></table>`
          : '<p>Sin fumigaciones registradas para esta campana.</p>'
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

  private renderTablaSuelo(lote: ILote): string {
    const suelos = lote.suelos || [];
    if (!suelos.length) {
      return '<p>Sin perfil de suelo cargado. Completar textura, capacidad de campo y punto de marchitez mejora riego y huella hidrica.</p>';
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
    const prediccion = predicciones[0] || siembra?.ultimaPrediccion;
    const enfermedades = prediccion?.enfermedades || [];
    if (!enfermedades.length) {
      return {
        titulo: 'Sin prediccion reciente',
        detalle:
          'Actualizar riesgo para cruzar fenologia, humedad, lluvia y temperatura',
        clase: 'warn',
      };
    }
    const max = Math.max(
      ...enfermedades.map((item) => this.normalizarRiesgo(item.resultado)),
    );
    if (max >= 70) {
      return {
        titulo: 'Alto',
        detalle: `${enfermedades.length} enfermedades monitoreadas`,
        clase: 'danger',
      };
    }
    if (max >= 40) {
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

  private getFrioCertificado(lote: ILote, siembra?: ISiembra): CertificadoFrio {
    const cultivo = siembra?.semilla?.cultivo || '';
    const aplica = ['Vid', 'Peral', 'Pecan', 'Manzano'].includes(cultivo);
    const req = siembra?.semilla?.requerimientoFrio;
    const dispositivo = this.getDispositivoFrio(lote);
    const acumulado = dispositivo?.frioAcumulado;
    const objetivos = {
      horasFrio: req?.horasFrio,
      horasFrioEfectivas: req?.horasFrioEfectivas,
      porcionesFrio: req?.porcionesFrio,
    };

    if (!aplica && !req && !acumulado) {
      return {
        aplica: false,
        fuente: 'No aplica',
        titulo: 'No aplica',
        detalle: 'Cultivo sin requerimiento de frio configurado',
        lectura:
          'El cultivo no requiere seguimiento de horas frio en este informe.',
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
      this.formatAvanceFrio(
        'HFE',
        acumulado?.horasFrioEfectivas,
        objetivos.horasFrioEfectivas,
        'HFE',
        0,
      ),
      this.formatAvanceFrio(
        'CP',
        acumulado?.porcionesFrio,
        objetivos.porcionesFrio,
        'CP',
        1,
      ),
    ]);

    const fecha = this.formatDate(acumulado?.fechaUltimoCalculo);
    const ultimaTemp = Number.isFinite(acumulado?.ultimaTemperatura)
      ? `Ultima temp. ${this.formatNumber(Number(acumulado?.ultimaTemperatura), 1)} C`
      : '';
    const fuente = acumulado
      ? `Sensor LoRa ${dispositivo?.nombre || dispositivo?.deveui || ''}`.trim()
      : 'Perfil varietal / clima de respaldo';

    return {
      aplica: true,
      fuente,
      titulo: acumulado
        ? 'Frio acumulado real'
        : req?.modelo || 'Frio varietal',
      detalle: piezas.join(' | ') || 'Perfil varietal editable',
      lectura: this.compactar([
        acumulado
          ? `Acumulado con sensor asociado hasta ${fecha || 'ultimo reporte'}.`
          : 'Sin sensor de frio consolidado; se informa requerimiento varietal.',
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
        (Number.isFinite(frio.horasFrio) ||
          Number.isFinite(frio.horasFrioEfectivas) ||
          Number.isFinite(frio.porcionesFrio))
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
    clima: IFrioTermicoCultivo | undefined,
    frio: CertificadoFrio,
  ): string {
    if (clima) {
      return `${this.formatNumber(clima.acumulados.horasFrio, 0)} h / ${this.formatNumber(clima.acumulados.porcionesFrio, 1)} CP`;
    }
    return frio.titulo;
  }

  private getDetalleFrioTermico(
    clima: IFrioTermicoCultivo | undefined,
    frio: CertificadoFrio,
  ): string {
    if (!clima) {
      return frio.detalle;
    }
    return `HFE ${this.formatNumber(clima.acumulados.horasFrioEfectivas, 0)} | GD ${this.formatNumber(clima.acumulados.gradosDia, 1)} | helada ${this.capitalize(clima.riesgoHelada.nivel)}`;
  }

  private getDetalleHelada(clima?: IFrioTermicoCultivo): string {
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
    return detalle || 'Sin alerta inmediata';
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

  private getLecturaEjecutiva(
    datos: CertificadoDatos,
    riesgo: { titulo: string; detalle: string },
    huella: { total: string },
    frio: { detalle: string },
    clima?: IFrioTermicoCultivo,
  ): string {
    const cultivo = datos.siembra?.semilla?.cultivo || 'cultivo';
    const esPerenne = ['Vid', 'Peral', 'Pecan', 'Manzano'].includes(cultivo);
    const partes = [
      `${cultivo}: seguimiento generado con ${datos.predicciones.length} prediccion(es), ${datos.fertilizaciones.length} fertilizacion(es), ${datos.fumigaciones.length} fumigacion(es) y ${datos.reportesNdvi.length} escena(s) satelital(es) complementaria(s).`,
      clima
        ? `Clima operativo: lluvia ${this.formatNumber(clima.acumulados.lluvia, 1)} mm, helada ${this.capitalize(clima.riesgoHelada.nivel)}.`
        : 'Sin clima consolidado en el informe.',
      `Riesgo sanitario ${riesgo.titulo.toLowerCase()} (${riesgo.detalle}).`,
      `Carga fitosanitaria ${datos.cargaFitosanitaria.score}/100 (${this.capitalize(datos.cargaFitosanitaria.nivel.replace('_', ' '))}).`,
      `Huella hidrica ${huella.total}.`,
    ];
    if (esPerenne) {
      partes.push(
        clima
          ? `Frio y termica: HF ${this.formatNumber(clima.acumulados.horasFrio, 0)} h, HFE ${this.formatNumber(clima.acumulados.horasFrioEfectivas, 0)}, CP ${this.formatNumber(clima.acumulados.porcionesFrio, 1)}, GD ${this.formatNumber(clima.acumulados.gradosDia, 1)}.`
          : `Frio y termica: ${frio.detalle}.`,
      );
    }
    return partes.join(' ');
  }

  private getPendientesCertificado(
    lote: ILote,
    siembra?: ISiembra,
    predicciones: IPrediccion[] = [],
    clima?: IFrioTermicoCultivo,
  ): string[] {
    const pendientes: string[] = [];
    if (!lote.suelos?.length) {
      pendientes.push(
        'Completar perfil de suelo para riego, huella y capacidad productiva.',
      );
    }
    if (
      !lote.capacidadDeCampo &&
      !lote.suelos?.some((suelo) => suelo.capacidadDeCampo)
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
    if (!predicciones.length && !siembra?.ultimaPrediccion) {
      pendientes.push(
        'Ejecutar monitoreo sanitario para dejar trazabilidad de enfermedades.',
      );
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

  private getSueloTexto(lote: ILote): string {
    return (
      lote.texturaEscorrentia ||
      lote.texturaLixiviacion ||
      lote.suelos?.find((suelo) => !!suelo.textura)?.textura ||
      'Sin dato'
    );
  }

  private getFuenteSuelo(lote: ILote): string {
    if (lote.sueloReferencia?.fuente) {
      return `Fuente: ${lote.sueloReferencia.fuente}`;
    }
    if (lote.suelos?.length) {
      return `${lote.suelos.length} nivel(es) editables`;
    }
    return 'Editable en lote';
  }

  private getRiegoTexto(siembra?: ISiembra): string {
    const recomendacion = siembra?.ultimaPrediccionRiego?.[0] as any;
    if (recomendacion?.recomendacion !== undefined) {
      return `${this.formatNumber(recomendacion.recomendacion, 1)} mm`;
    }
    if (siembra?.aguaUtilReal !== undefined) {
      return `${this.formatNumber(siembra.aguaUtilReal, 1)} mm agua util`;
    }
    return 'Sin recomendacion';
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

  private getNivelRiesgoTexto(value?: number): string {
    const riesgo = this.normalizarRiesgo(value);
    if (riesgo >= 70) {
      return 'Alto';
    }
    if (riesgo >= 40) {
      return 'Medio';
    }
    if (riesgo > 0) {
      return 'Bajo';
    }
    return 'Sin riesgo calculado';
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
  } | null> {
    const query: IQueryParam = {
      filter: JSON.stringify({ idLote }),
      limit: 1,
      sort: '-fechaDeLaImagen',
    };
    const reportes = await this.reportesNDVIsService.get(query, permiso);
    const ultimo = reportes?.datos?.[0];
    if (!ultimo) {
      return null;
    }
    return {
      fecha: this.toIsoString(ultimo.fechaDeLaImagen || ultimo.fechaCreacion),
      coleccion: ultimo.coleccion || null,
      renderVersion: ultimo.metadataImagen?.renderVersion || null,
    };
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
    if (permiso.nivel === 'Quimica') {
      return !data.idQuimica || data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return (
        !data.idDistribuidor || data.idDistribuidor === permiso.idDistribuidor
      );
    }
    if (permiso.nivel === 'Productor') {
      return !data.idProductor || data.idProductor === permiso.idProductor;
    }
    if (permiso.nivel === 'Establecimiento') {
      return (
        !data.idEstablecimiento ||
        data.idEstablecimiento === permiso.idEstablecimiento
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<ILote> = HelperService.filtroToObject(query.filter);
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

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
