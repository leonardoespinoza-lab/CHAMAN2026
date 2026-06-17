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
  ISuelo,
  ISueloReferencia,
  TTexturaSuelo,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { LotesRepository } from './repository';
import { EstablecimientosService } from '../establecimiento/service';
import { ReporteNDVIsService } from '../reporte-ndvis/service';
import { NdviQueueService } from './ndvi-queue.service';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { NDVI_SYNC_LIMIT } from '../../env';

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

@Injectable()
export class LotesService {
  private readonly logger = new Logger(LotesService.name);

  constructor(
    private repository: LotesRepository,
    private establecimientosService: EstablecimientosService,
    private reportesNDVIsService: ReporteNDVIsService,
    private ndviQueue: NdviQueueService,
    private axios: AxiosService,
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
    const ultimaFechaImagen = await this.getUltimaFechaNdvi(id, permiso);
    const encolado = await this.ndviQueue.enqueueLote(lote, ultimaFechaImagen);
    return {
      encolado,
      ultimaFechaImagen,
      mensaje: encolado
        ? 'Tarea NDVI satelital encolada. El reporte aparecera cuando el worker termine el procesamiento.'
        : 'No se pudo encolar NDVI. Verificar Redis, worker NDVI y poligono del lote.',
    };
  }

  async getNdviQueueStatus() {
    return await this.ndviQueue.getStatus();
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
        const ultimaFechaImagen = await this.getUltimaFechaNdvi(
          lote._id,
          permisoSistema,
        );
        const encolado = await this.ndviQueue.enqueueLote(
          lote,
          ultimaFechaImagen,
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
    } catch (error) {
      this.logger.error(`Error consultando suelo INTA: ${error?.message || error}`);
      return {
        ...base,
        mensaje: 'No se pudo consultar INTA en este momento. Los campos quedan editables.',
      };
    }
  }

  // Private

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

  private inferirTexturaSuelo(properties: Record<string, any>): TTexturaSuelo {
    const texto = this.normalizar(
      `${properties.text_sups1 || ''} ${properties.text_bs1 || ''}`,
    );

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
    const query: IQueryParam = {
      filter: JSON.stringify({ idLote }),
      limit: 1,
      sort: '-fechaDeLaImagen',
    };
    const reportes = await this.reportesNDVIsService.get(query, permiso);
    const ultimo = reportes?.datos?.[0];
    return this.toIsoString(ultimo?.fechaDeLaImagen || ultimo?.fechaCreacion);
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
