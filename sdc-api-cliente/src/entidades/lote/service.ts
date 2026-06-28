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
  ISerieFrioTermicoDia,
  TTexturaSuelo,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
  ISueloInta,
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
    const data = await this.repository.getById(id);
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException('No tiene permiso para ver este lote');
    }
    return data;
  }

  async get(filtro: IQueryParam, permiso: IPermiso): Promise<IListado<ILote>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async create(data: ICreateLote, permiso): Promise<ILote> {
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
      .catch((err) => this.logger.error(`Error encolando tarea NDVI: ${err.message}`));
    return lote;
  }

  async update(
    id: string,
    data: IUpdateLote,
    permiso: IPermiso,
  ): Promise<ILote> {
    await this.getById(id, permiso);
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

    return await this.repository.update(id, data);
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
    const ultimoReporte = await this.getUltimoReporteNdviReferencia(id, permiso);
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
    const lote = await this.getById(id, permiso);
    const siembra = lote.siembra;

    const [reportesNdvi, predicciones, fertilizaciones, fumigaciones, clima] =
      await Promise.all([
        this.getReportesNdviCertificado(id, permiso),
        this.getPrediccionesCertificado(siembra?._id),
        this.getFertilizacionesCertificado(id),
        this.getFumigacionesCertificado(siembra?._id),
        this.getClimaCertificado(lote, siembra),
      ]);

    return this.renderCertificadoHtml({
      lote,
      siembra,
      reportesNdvi,
      predicciones,
      fertilizaciones,
      fumigaciones,
      frio: this.getFrioCertificado(lote, siembra),
      clima,
    });
  }

  async sincronizarNdviAutomatico(): Promise<{
    total: number;
    encolados: number;
    omitidos: number;
  }> {
    const permisoSistema: IPermiso = { nivel: 'Admin', rol: 'Admin' };
    const query: IQueryParam = {
      filter: JSON.stringify({
        idSiembra: { $exists: true, $ne: null },
        'ubicacion.geojson.coordinates.0': { $exists: true },
      }),
      limit: NDVI_SYNC_LIMIT,
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
      total: lotes.totalCount || lotes.datos?.length || 0,
      encolados,
      omitidos,
    };
  }

  async getSueloInta(latParam: string | number, lngParam: string | number): Promise<SueloIntaResponse> {
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
      const delta = 0.05;
      const response = await this.axios.GET<IntaFeatureCollection>(
        'https://geo-backend.inta.gob.ar/geoserver/wms',
        {
          timeout: 12000,
          params: {
            SERVICE: 'WMS',
            VERSION: '1.3.0',
            REQUEST: 'GetFeatureInfo',
            LAYERS: 'geonode:suelos_argentina_1_500',
            QUERY_LAYERS: 'geonode:suelos_argentina_1_500',
            INFO_FORMAT: 'application/json',
            FEATURE_COUNT: 3,
            CRS: 'CRS:84',
            BBOX: `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`,
            WIDTH: 101,
            HEIGHT: 101,
            I: 50,
            J: 50,
            FORMAT: 'image/png',
            STYLES: '',
          },
        },
      );

      const properties = response?.features?.[0]?.properties;
      if (!properties) {
        return {
          ...base,
          mensaje: 'INTA no devolvio una unidad de suelo para esta ubicacion. Los campos quedan editables.',
        };
      }

      return this.crearRespuestaSueloIntaEncontrada(properties, base);
    } catch (error) {
      this.logger.error(`Error consultando suelo INTA: ${error?.message || error}`);
      return {
        ...base,
        mensaje: 'No se pudo consultar INTA en este momento. Los campos quedan editables.',
      };
    }
  }

  // Private

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
      this.logger.warn(`No se pudieron obtener reportes satelitales para certificado: ${error?.message || error}`);
      return [];
    }
  }

  private async getPrediccionesCertificado(idSiembra?: string): Promise<IPrediccion[]> {
    if (!idSiembra) {
      return [];
    }
    return this.getListadoInterno<IPrediccion>('prediccions', { idSiembra }, {
      limit: 5,
      sort: '-fechaPrediccion',
    });
  }

  private async getFertilizacionesCertificado(idLote: string): Promise<IFertilizacion[]> {
    return this.getListadoInterno<IFertilizacion>('fertilizacions', { idLote }, {
      limit: 20,
      sort: '-fechaFertilizacion',
      populate: JSON.stringify({ path: 'fertilizante' }),
    });
  }

  private async getFumigacionesCertificado(idSiembra?: string): Promise<IFumigacion[]> {
    if (!idSiembra) {
      return [];
    }
    return this.getListadoInterno<IFumigacion>('fumigacions', { idSiembra }, {
      limit: 20,
      sort: '-fechaFumigacion',
      populate: JSON.stringify([{ path: 'agroquimico' }, { path: 'principioActivo' }]),
    });
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
      const response = await this.axios.GET<IListado<T>>(`${API_DATOS}/${recurso}`, {
        params: {
          ...extraParams,
          filter: JSON.stringify(filter),
        },
      });
      return response?.datos || [];
    } catch (error) {
      this.logger.warn(`No se pudieron obtener datos de ${recurso} para certificado: ${error?.message || error}`);
      return [];
    }
  }

  private getCentroOperativo(lote: ILote): { lat: number; lng: number } | undefined {
    const centro =
      lote.ubicacion?.centro ||
      lote.establecimiento?.ubicacion?.find((ubicacion) => ubicacion.centro)
        ?.centro;
    const lat = Number((centro as any)?.lat ?? (centro as any)?.latitude);
    const lng = Number(
      (centro as any)?.lng ?? (centro as any)?.lon ?? (centro as any)?.longitude,
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }
    return { lat, lng };
  }

  private renderCertificadoHtml(datos: CertificadoDatos): string {
    const { lote, siembra, reportesNdvi, predicciones, fertilizaciones, fumigaciones, clima } = datos;
    const semilla = siembra?.semilla;
    const cultivo = semilla?.cultivo || 'Cultivo sin definir';
    const esPerenne = ['Vid', 'Peral', 'Pecan', 'Manzano'].includes(cultivo);
    const fechaInforme = this.formatDateTime(new Date().toISOString());
    const estado = siembra?.fechaCosecha ? 'Cierre de cosecha' : 'Seguimiento en curso';
    const etapa = this.getEstadoFenologico(siembra, predicciones);
    const riesgo = this.getResumenRiesgo(siembra, predicciones);
    const huella = this.getResumenHuella(lote, siembra);
    const frio = datos.frio;
    const pendientes = this.getPendientesCertificado(lote, siembra, predicciones, clima);
    const fenologia = this.getFenologiaItems(siembra);
    const lluviaAcumulada = this.formatClimaMetric(clima?.acumulados?.lluvia, 'mm', 1);
    const helada = clima?.riesgoHelada?.nivel
      ? this.capitalize(clima.riesgoHelada.nivel)
      : 'Sin dato';

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Certificado Chaman - ${this.escapeHtml(lote.nombre || 'lote')}</title>
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
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
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
    footer {
      padding: 18px 32px 28px;
      color: var(--muted);
      font-size: 12px;
    }
    @media print {
      body { background: white; }
      .page { width: auto; margin: 0; border: none; border-radius: 0; box-shadow: none; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">
        <small>Chaman Agro</small>
        <h1>Certificado de seguimiento agronomico y ecologico</h1>
        <p>${this.escapeHtml(estado)} para ${this.escapeHtml(cultivo)} en el lote <strong>${this.escapeHtml(lote.nombre || 'Sin nombre')}</strong>.</p>
        <span class="pill">${this.escapeHtml(lote.establecimiento?.nombre || 'Sin establecimiento')}</span>
      </div>
      <div class="hero-meta">
        <div class="card"><span>Fecha de emision</span><strong>${fechaInforme}</strong><small>Generado por Chaman</small></div>
        <div class="card"><span>Etapa actual</span><strong>${this.escapeHtml(etapa)}</strong><small>${this.getDiasCultivoTexto(siembra)}</small></div>
      </div>
    </section>

    <section class="section">
      <h2>Resumen ejecutivo</h2>
      <div class="grid">
        ${this.metricCard('Cultivo', cultivo, this.getVariedadTexto(siembra))}
        ${this.metricCard('Superficie', this.formatHectareas(lote.ubicacion?.superficie), 'Poligono Chaman')}
        ${this.metricCard('Suelo', this.getSueloTexto(lote), this.getFuenteSuelo(lote))}
        ${this.metricCard('Clima / lluvia', lluviaAcumulada, clima?.periodoFrio ? `Periodo ${this.formatDate(clima.periodoFrio.desde)} a ${this.formatDate(clima.periodoFrio.hasta)}` : 'Open-Meteo / estacion')}
        ${this.metricCard('Riesgo sanitario', riesgo.titulo, riesgo.detalle)}
        ${this.metricCard('Riego', this.getRiegoTexto(siembra), this.getAguaUtilTexto(siembra))}
        ${this.metricCard('Huella hidrica', huella.total, huella.detalle)}
        ${this.metricCard(esPerenne ? 'Frio / CP' : 'Heladas', esPerenne ? this.getResumenFrioTermico(clima, frio) : helada, esPerenne ? this.getDetalleFrioTermico(clima, frio) : this.getDetalleHelada(clima))}
      </div>
      <div class="note ${riesgo.clase}">
        <strong>Lectura Chaman:</strong> ${this.escapeHtml(this.getLecturaEjecutiva(datos, riesgo, huella, frio, clima))}
      </div>
    </section>

    <section class="section two-col">
      <div class="dark-panel">
        <h3>Temperatura, humedad y lluvia</h3>
        <small>Serie climatica usada para seguimiento agronomico, frio, grados dia y riesgo sanitario.</small>
        ${this.renderClimaSparkline(clima)}
      </div>
      <div>
        <h2>${esPerenne ? 'Frio y acumulacion termica' : 'Clima agronomico'}</h2>
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
      <h2>Complemento satelital</h2>
      <p>Los indices satelitales se informan como evidencia complementaria de vigor, agua y cobertura. La lectura principal del certificado prioriza clima, fenologia, sensores, aplicaciones y observacion a campo.</p>
      ${this.renderTablaSatelital(reportesNdvi)}
    </section>

    <section class="section">
      <h2>Fuentes de datos</h2>
      <div class="source-list">
        <div><strong>Lote y superficie</strong><br/>Poligono y ubicacion cargados en Chaman.</div>
        <div><strong>Fenologia</strong><br/>Base Chaman por cultivo/departamento o fenologia editable del cultivo.</div>
        <div><strong>Clima y frio</strong><br/>Open-Meteo / estacion o sensor asociado cuando existe historico operativo.</div>
        <div><strong>Satelite</strong><br/>Worker Chaman con escenas Sentinel/Landsat disponibles y validadas.</div>
        <div><strong>Aplicaciones</strong><br/>Fertilizaciones y fumigaciones registradas por usuario autorizado.</div>
        <div><strong>Suelo</strong><br/>Datos editables del lote; INTA cuando existe consulta o carga de referencia.</div>
      </div>
      ${this.renderPendientes(pendientes)}
    </section>

    <footer>
      Este certificado es un documento tecnico generado automaticamente por Chaman Agro. Debe interpretarse junto con observacion a campo, criterio profesional y marbetes vigentes de productos aplicados. La validez agronomica depende de la calidad de los datos cargados y de los sensores/servicios conectados.
    </footer>
  </main>
</body>
</html>`;
  }

  private metricCard(label: string, value: string, detail?: string): string {
    return `<article class="card"><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(value || '-')}</strong><small>${this.escapeHtml(detail || '')}</small></article>`;
  }

  private renderNdviSparkline(reportes: IReporteNDVI[]): string {
    const puntos = reportes
      .slice()
      .reverse()
      .map((reporte) => ({
        fecha: this.formatDate(reporte.fechaDeLaImagen || reporte.fechaDelReporte || reporte.fechaCreacion),
        valor: this.toNumber(reporte.indices?.ndvi ?? reporte.ndviPromedio),
      }))
      .filter((item) => Number.isFinite(item.valor));

    if (!puntos.length) {
      return '<div class="chart" style="display:grid;place-items:center;color:#9fb1c7;">Sin escenas satelitales procesadas</div>';
    }

    const min = Math.min(...puntos.map((item) => item.valor));
    const max = Math.max(...puntos.map((item) => item.valor));
    const rango = max - min || 1;
    const coords = puntos.map((item, index) => {
      const x = 24 + (index * 552) / Math.max(puntos.length - 1, 1);
      const y = 124 - ((item.valor - min) * 88) / rango;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const labels = puntos.map((item, index) => {
      const x = 24 + (index * 552) / Math.max(puntos.length - 1, 1);
      const y = 144;
      return `<text x="${x.toFixed(1)}" y="${y}" text-anchor="middle" fill="#9fb1c7" font-size="10">${this.escapeHtml(item.fecha || '')}</text>`;
    }).join('');

    return `<svg class="chart" viewBox="0 0 600 160" role="img" aria-label="Evolucion NDVI">
      <defs>
        <linearGradient id="lineaNdvi" x1="0" x2="1">
          <stop offset="0%" stop-color="#2ed4ca" />
          <stop offset="100%" stop-color="#68be4a" />
        </linearGradient>
      </defs>
      <g opacity="0.18">
        <line x1="24" x2="576" y1="36" y2="36" stroke="#ffffff" />
        <line x1="24" x2="576" y1="80" y2="80" stroke="#ffffff" />
        <line x1="24" x2="576" y1="124" y2="124" stroke="#ffffff" />
      </g>
      <polyline fill="none" stroke="url(#lineaNdvi)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}" />
      ${coords.map((coord) => {
        const [x, y] = coord.split(',');
        return `<circle cx="${x}" cy="${y}" r="4" fill="#2ed4ca" />`;
      }).join('')}
      ${labels}
    </svg>`;
  }

  private renderClimaSparkline(clima?: IFrioTermicoCultivo): string {
    const serie = (clima?.serie || [])
      .slice(-50)
      .filter((dia) =>
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
    const maxLluvia = Math.max(...serie.map((dia) => Number(dia.lluvia) || 0), 1);
    const x = (index: number) => 34 + (index * 520) / Math.max(serie.length - 1, 1);
    const yTemp = (valor?: number) =>
      120 - (((Number(valor) || 0) - minTemp) * 84) / tempRange;
    const puntosMax = serie
      .map((dia, index) => `${x(index).toFixed(1)},${yTemp(dia.temperaturaMax).toFixed(1)}`)
      .join(' ');
    const puntosMin = serie
      .map((dia, index) => `${x(index).toFixed(1)},${yTemp(dia.temperaturaMin).toFixed(1)}`)
      .join(' ');
    const barras = serie
      .map((dia, index) => {
        const alto = Math.max(1, ((Number(dia.lluvia) || 0) * 72) / maxLluvia);
        return `<rect x="${(x(index) - 2).toFixed(1)}" y="${(126 - alto).toFixed(1)}" width="4" height="${alto.toFixed(1)}" rx="2" fill="#7ce0c0" opacity="0.55" />`;
      })
      .join('');
    const labels = serie
      .filter((_dia, index) => index === 0 || index === serie.length - 1)
      .map((dia, index, array) => {
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
      return '<p>Sin clima consolidado para este certificado. Chaman mantiene la trazabilidad con sensores y datos del lote disponibles.</p>';
    }

    const items = esPerenne
      ? [
          ['Horas frio (HF)', this.formatClimaMetric(clima.acumulados.horasFrio, 'h', 1), this.formatObjetivo(clima.requerimientos.horasFrioObjetivo, 'h')],
          ['Frio efectivo (HFE)', this.formatClimaMetric(clima.acumulados.horasFrioEfectivas, 'HFE', 1), this.formatObjetivo(clima.requerimientos.horasFrioEfectivasObjetivo, 'HFE')],
          ['Chill portions (CP)', this.formatClimaMetric(clima.acumulados.porcionesFrio, 'CP', 2), this.formatObjetivo(clima.requerimientos.porcionesFrioObjetivo, 'CP')],
          ['Grados dia', this.formatClimaMetric(clima.acumulados.gradosDia, 'GD', 1), `Base ${this.formatNumber(clima.requerimientos.temperaturaBaseGradosDia || 10, 0)} C`],
          ['Riesgo helada', this.capitalize(clima.riesgoHelada.nivel), this.getDetalleHelada(clima)],
          ['Fuente', clima.fuente, frio.fuente],
        ]
      : [
          ['Lluvia acumulada', this.formatClimaMetric(clima.acumulados.lluvia, 'mm', 1), 'Periodo operativo del cultivo'],
          ['Grados dia', this.formatClimaMetric(clima.acumulados.gradosDia, 'GD', 1), `Base ${this.formatNumber(clima.requerimientos.temperaturaBaseGradosDia || 10, 0)} C`],
          ['Riesgo helada', this.capitalize(clima.riesgoHelada.nivel), this.getDetalleHelada(clima)],
          ['Ventana sanitaria', this.capitalize(clima.eventos.ventanaSanitaria.estado), clima.eventos.ventanaSanitaria.lectura],
          ['Brotacion', this.capitalize(clima.eventos.brotacion.estado.replace(/_/g, ' ')), clima.eventos.brotacion.lectura],
          ['Fuente', clima.fuente, 'Open-Meteo / estacion asociada cuando exista'],
        ];

    const rows = items
      .map(([label, value, detail]) => `
        <tr>
          <td>${this.escapeHtml(label)}</td>
          <td>${this.escapeHtml(value)}</td>
          <td>${this.escapeHtml(detail)}</td>
        </tr>`)
      .join('');

    return `<table><thead><tr><th>Variable</th><th>Valor</th><th>Lectura</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note"><strong>Lectura climatica:</strong> ${this.escapeHtml(clima.lectura)}</div>`;
  }

  private renderTablaSatelital(reportes: IReporteNDVI[]): string {
    if (!reportes.length) {
      return '<p>Sin reportes satelitales procesados para este lote.</p>';
    }
    const rows = reportes.slice(0, 6).map((reporte) => `
      <tr>
        <td>${this.escapeHtml(this.formatDate(reporte.fechaDeLaImagen || reporte.fechaDelReporte || reporte.fechaCreacion) || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(reporte.indices?.ndvi ?? reporte.ndviPromedio, 3))}</td>
        <td>${this.escapeHtml(this.formatMaybe(reporte.indices?.ndmi, 3))}</td>
        <td>${this.escapeHtml(this.formatMaybe(reporte.indices?.ndwi, 3))}</td>
        <td>${this.escapeHtml(reporte.coleccion || '-')}</td>
      </tr>`).join('');
    return `<table><thead><tr><th>Escena</th><th>NDVI</th><th>NDMI</th><th>NDWI</th><th>Fuente</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaFenologia(items: { nombre: string; valor: string }[], siembra?: ISiembra): string {
    if (!items.length) {
      return `<p>Sin cronograma fenologico cargado. ${this.escapeHtml(this.getDiasCultivoTexto(siembra))}</p>`;
    }
    const rows = items.map((item) => `<tr><td>${this.escapeHtml(item.nombre)}</td><td>${this.escapeHtml(item.valor)}</td></tr>`).join('');
    return `<table><thead><tr><th>Etapa</th><th>Referencia</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaEnfermedades(siembra?: ISiembra, predicciones: IPrediccion[] = []): string {
    const prediccion = predicciones[0] || siembra?.ultimaPrediccion;
    const enfermedades = prediccion?.enfermedades || [];
    if (!enfermedades.length) {
      return '<p>Sin prediccion sanitaria reciente. El informe conserva el estado como pendiente de calculo.</p>';
    }
    const rows = enfermedades.map((item) => `
      <tr>
        <td>${this.escapeHtml(item.enfermedad)}</td>
        <td>${this.escapeHtml(this.formatMaybe(item.resultado, 2))}</td>
        <td>${this.escapeHtml(this.getNivelRiesgoTexto(item.resultado))}</td>
        <td>${this.escapeHtml(this.formatVariables(item.variables))}</td>
      </tr>`).join('');
    return `<table><thead><tr><th>Enfermedad</th><th>Valor</th><th>Lectura</th><th>Variables usadas</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaFertilizaciones(fertilizaciones: IFertilizacion[]): string {
    if (!fertilizaciones.length) {
      return '<p>Sin fertilizaciones registradas.</p>';
    }
    const rows = fertilizaciones.map((item) => `
      <tr>
        <td>${this.escapeHtml(this.formatDate(item.fechaFertilizacion || item.fechaCreacion) || '-')}</td>
        <td>${this.escapeHtml(item.fertilizante?.nombre || item.idFertilizante || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(item.dosisKgHa, 2))} kg/ha</td>
      </tr>`).join('');
    return `<table><thead><tr><th>Fecha</th><th>Producto</th><th>Dosis</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaFumigaciones(fumigaciones: IFumigacion[]): string {
    if (!fumigaciones.length) {
      return '<p>Sin fumigaciones registradas.</p>';
    }
    const rows = fumigaciones.map((item) => `
      <tr>
        <td>${this.escapeHtml(this.formatDate(item.fechaFumigacion || item.fechaCreacion) || '-')}</td>
        <td>${this.escapeHtml(item.agroquimico?.nombre || item.principioActivo?.nombre || item.idAgroquimico || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(item.dosisLtHa, 2))} l/ha</td>
        <td>${this.escapeHtml(this.formatMaybe(item.concentracion, 2))}</td>
      </tr>`).join('');
    return `<table><thead><tr><th>Fecha</th><th>Producto / activo</th><th>Dosis</th><th>Conc.</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderTablaSuelo(lote: ILote): string {
    const suelos = lote.suelos || [];
    if (!suelos.length) {
      return '<p>Sin perfil de suelo cargado. Completar textura, capacidad de campo y punto de marchitez mejora riego y huella hidrica.</p>';
    }
    const rows = suelos.map((suelo) => `
      <tr>
        <td>${this.escapeHtml(this.formatMaybe(suelo.profundidad, 0))} cm</td>
        <td>${this.escapeHtml(suelo.textura || '-')}</td>
        <td>${this.escapeHtml(this.formatMaybe(suelo.capacidadDeCampo, 1))}%</td>
        <td>${this.escapeHtml(this.formatMaybe(suelo.puntoMarchitez, 1))}%</td>
        <td>${suelo.hayRaices ? 'Si' : 'No'}</td>
      </tr>`).join('');
    return `<table style="margin-top:14px;"><thead><tr><th>Prof.</th><th>Textura</th><th>Capacidad campo</th><th>Marchitez</th><th>Raices</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderPendientes(pendientes: string[]): string {
    if (!pendientes.length) {
      return '<div class="note"><strong>Control de calidad:</strong> El informe cuenta con los datos principales para seguimiento operativo.</div>';
    }
    return `<div class="note warn"><strong>Datos pendientes para robustecer el certificado:</strong><ul>${pendientes.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul></div>`;
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
        detalle: 'Actualizar riesgo para cruzar fenologia, humedad, lluvia y temperatura',
        clase: 'warn',
      };
    }
    const max = Math.max(...enfermedades.map((item) => this.normalizarRiesgo(item.resultado)));
    if (max >= 70) {
      return { titulo: 'Alto', detalle: `${enfermedades.length} enfermedades monitoreadas`, clase: 'danger' };
    }
    if (max >= 40) {
      return { titulo: 'Medio', detalle: `${enfermedades.length} enfermedades monitoreadas`, clase: 'warn' };
    }
    return { titulo: 'Bajo', detalle: `${enfermedades.length} enfermedades monitoreadas`, clase: '' };
  }

  private getResumenHuella(lote: ILote, siembra?: ISiembra): {
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
      detalle: siembra?.fechaCosecha ? 'Consolidada al cierre si existe rendimiento' : 'Parcial hasta cierre o carga de rendimiento',
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
        lectura: 'El cultivo no requiere seguimiento de horas frio en este certificado.',
        objetivos,
      };
    }

    const piezas = this.compactar([
      this.formatAvanceFrio('HF', acumulado?.horasFrio, objetivos.horasFrio, 'h', 0),
      this.formatAvanceFrio('HFE', acumulado?.horasFrioEfectivas, objetivos.horasFrioEfectivas, 'HFE', 0),
      this.formatAvanceFrio('CP', acumulado?.porcionesFrio, objetivos.porcionesFrio, 'CP', 1),
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
      titulo: acumulado ? 'Frio acumulado real' : req?.modelo || 'Frio varietal',
      detalle: piezas.join(' | ') || 'Perfil varietal editable',
      lectura: this.compactar([
        acumulado ? `Acumulado con sensor asociado hasta ${fecha || 'ultimo reporte'}.` : 'Sin sensor de frio consolidado; se informa requerimiento varietal.',
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
      return !!frio && (
        Number.isFinite(frio.horasFrio) ||
        Number.isFinite(frio.horasFrioEfectivas) ||
        Number.isFinite(frio.porcionesFrio)
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

  private formatClimaMetric(value: unknown, unidad: string, digits = 1): string {
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
        : 'Sin clima consolidado en el certificado.',
      `Riesgo sanitario ${riesgo.titulo.toLowerCase()} (${riesgo.detalle}).`,
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
      pendientes.push('Completar perfil de suelo para riego, huella y capacidad productiva.');
    }
    if (!lote.capacidadDeCampo && !lote.suelos?.some((suelo) => suelo.capacidadDeCampo)) {
      pendientes.push('Cargar capacidad de campo o calibrarla con sensor de humedad.');
    }
    if (!siembra?.semilla?.variedad) {
      pendientes.push('Completar variedad/portainjerto del cultivo.');
    }
    if (!clima) {
      pendientes.push('Consolidar clima de establecimiento o estacion/sensor para trazabilidad climatica.');
    }
    if (!predicciones.length && !siembra?.ultimaPrediccion) {
      pendientes.push('Ejecutar monitoreo sanitario para dejar trazabilidad de enfermedades.');
    }
    if (!siembra?.rendimientoObtenidoKgHa && !siembra?.rendimientoObtenidoKgHaSeco) {
      pendientes.push('Cargar rendimiento esperado o cosecha para consolidar litros/kg y capacidad de rinde.');
    }
    return pendientes;
  }

  private getVariedadTexto(siembra?: ISiembra): string {
    const semilla = siembra?.semilla;
    return this.compactar([
      semilla?.variedad,
      semilla?.ciclo,
      semilla?.portainjerto ? `pie ${semilla.portainjerto}` : '',
    ]).join(' / ') || 'Sin variedad cargada';
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

  private getEstadoFenologico(siembra?: ISiembra, predicciones: IPrediccion[] = []): string {
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

  private getFenologiaItems(siembra?: ISiembra): { nombre: string; valor: string }[] {
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
    const etiqueta = siembra.fechaCosecha ? 'Ciclo cerrado' : 'Dias desde inicio';
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
      .map(([key, value]) => `${this.prettyKey(key)}: ${this.formatMaybe(value, 2)}`)
      .join(' | ');
  }

  private normalizarRiesgo(value?: number): number {
    const numero = Number(value);
    if (!Number.isFinite(numero)) {
      return 0;
    }
    if (numero <= 1) {
      return numero * 100;
    }
    if (numero <= 10) {
      return numero * 10;
    }
    return Math.min(100, Math.max(0, numero));
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
    return Number.isFinite(value) ? `${this.formatNumber(value, 2)} ha` : 'Sin dato';
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

  private async consultarSueloIntaLocal(lat: number, lng: number): Promise<ISueloInta | null> {
    try {
      return await this.repository.getSueloIntaLocal(lat, lng);
    } catch (error) {
      this.logger.warn(`Suelo INTA local no disponible: ${error?.message || error}`);
      return null;
    }
  }

  private crearRespuestaSueloInta(lat: number, lng: number): SueloIntaResponse {
    return {
      fuente: 'INTA Atlas de Suelos 1:500.000/1:1.000.000',
      servicio: 'geo-backend.inta.gob.ar/geoserver/wms',
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
          profundidad: profundidad ? Math.min(Math.max(profundidad, 20), 100) : 30,
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
      mensaje: 'Datos sugeridos desde INTA. Se pueden editar antes de guardar el lote.',
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

  private inferirErosionPendiente(properties: Record<string, any>): TTipoErosionEscorrentiaPendiente {
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

  private capacidadPorTextura(textura: TTexturaSuelo): Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'> {
    const valores: Record<TTexturaSuelo, Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'>> = {
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

  private calcularConfianza(properties: Record<string, any>): 'alta' | 'media' | 'baja' {
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
    return !!reporte?.fecha && reporte.renderVersion !== 'fixed-index-v2';
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
