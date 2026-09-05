import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CHAMAN_METEO_CALCULATION_VERSION,
  IContextoLoteMalezas,
  ICreateLote,
  ILote,
  IQueryParam,
  IResultadoPrediccionMalezas,
  ISeguimientoMalezasLote,
  ISolicitudArchivado,
  IUpdateLote,
} from 'modelos/src';
import { LotesRepository } from './repository';
import { LotLocationService } from '../ubicacion-lote/service';
import { LotSoilIntelligenceEngine } from '../suelo-inteligencia/engine.service';
import { AlgoritmosService } from '../algoritmos/service';
import { ChamanMeteoService } from '../chaman-meteo/service';
import { ReporteNDVIsService } from '../reporte-ndvis/service';
import {
  contextoSatelitalMalezas,
  campaniaMalezasParaFecha,
  DiaClimaMalezas,
  MAX_DIAS_CAMPANIA_MALEZAS,
  resolverSeguimientoMalezasLote,
} from '../algoritmos/malezas-semillero.engine';

@Injectable()
export class LotesService {
  private readonly logger = new Logger(LotesService.name);

  constructor(
    private repository: LotesRepository,
    private lotLocationService: LotLocationService,
    private soilIntelligence: LotSoilIntelligenceEngine,
    @Optional() private readonly algoritmosService?: AlgoritmosService,
    @Optional() private readonly chamanMeteoService?: ChamanMeteoService,
    @Optional() private readonly reporteNDVIsService?: ReporteNDVIsService,
  ) {}

  async getFilter(query: IQueryParam) {
    const listado = await this.repository.getFilter(query);
    return {
      ...listado,
      datos: (listado?.datos || []).map((lote) =>
        this.ocultarParametrosMalezas(lote),
      ),
    };
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return this.ocultarParametrosMalezas(data);
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateLote) {
    dato = this.withManualSoilProvenance(
      this.withoutAutomaticDepartment(dato),
      this.hasPhysicalSoilChange(undefined, dato),
    );
    const created = await this.repository.create(dato);
    this.requestSpatialResolution(`${created._id}`, 'lot_created');
    return created;
  }

  async update(id: string, dato: IUpdateLote) {
    dato = this.withoutAutomaticDepartment(dato);
    const geometryChanged = Object.prototype.hasOwnProperty.call(
      dato,
      'ubicacion',
    );
    const hasSoilPayload = this.hasSoilPayload(dato);
    const current =
      geometryChanged || hasSoilPayload
        ? await this.repository.getById(id)
        : undefined;
    const manualSoilChanged = hasSoilPayload
      ? this.hasPhysicalSoilChange(current, dato)
      : false;
    dato = this.withManualSoilProvenance(dato, manualSoilChanged);
    const updated = await this.repository.update(id, dato);
    if (updated) {
      if (geometryChanged) {
        const hadGeometry = !!(
          current?.ubicacion?.geojson?.coordinates?.length ||
          current?.ubicacion?.poligono?.length
        );
        this.requestSpatialResolution(
          id,
          hadGeometry ? 'geometry_changed' : 'geometry_added',
        );
      } else if (manualSoilChanged) {
        this.requestSoilResolution(id, 'manual_value_changed');
      }
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string, audit: ISolicitudArchivado = {}) {
    const deleted = await this.repository.delete(id, audit);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  async deleteMany(query: IQueryParam) {
    return await this.repository.deleteMany(query);
  }

  async prediccionMalezas(
    id: string,
    options: { reiniciarSeguimiento?: boolean } = {},
  ): Promise<IResultadoPrediccionMalezas> {
    if (!this.algoritmosService) {
      throw new ServiceUnavailableException(
        'El motor de malezas no esta disponible.',
      );
    }
    const lote = await this.repository.getById(id);
    if (!lote) throw new NotFoundException('No encontrado');

    const hoy = this.fechaKey(new Date());
    const siembra = lote.siembra;
    const campania = campaniaMalezasParaFecha(hoy);
    const seguimiento = resolverSeguimientoMalezasLote({
      seguimiento: lote.seguimientoMalezas,
      hoy,
      temporada: campania.temporada,
      reiniciar: options.reiniciarSeguimiento === true,
    });
    const [climaCanonico, reporteSatelital] = await Promise.all([
      this.getClimaChamanMeteoLote(id, seguimiento.fechaInicio, hoy),
      this.getReporteSatelitalMalezas(id),
    ]);
    const resultado = await this.algoritmosService.calcularPrediccionMalezas({
      lote,
      siembra: siembra && !siembra.fechaCosecha ? siembra : undefined,
      fechaInicio: seguimiento.fechaInicio,
      climaCanonico,
      contextoSatelital: contextoSatelitalMalezas(reporteSatelital),
    });
    resultado.contextoLote = this.contextoLoteMalezas(lote, seguimiento);

    await this.repository.update(id, {
      seguimientoMalezas: seguimiento,
      ...(resultado.estado !== 'sin_clima'
        ? { ultimaPrediccionMalezas: resultado }
        : {}),
    });
    return this.prediccionMalezasSegura(resultado);
  }

  private async getClimaChamanMeteoLote(
    idLote: string,
    fechaInicio: string,
    hoy: string,
  ): Promise<DiaClimaMalezas[]> {
    if (!this.chamanMeteoService) return [];
    try {
      const binding = await this.chamanMeteoService.resolvedLocationBinding(
        'lote',
        idLote,
      );
      if (!binding?.gridPoint?.key) return [];
      const limite = this.desplazarFecha(hoy, -MAX_DIAS_CAMPANIA_MALEZAS);
      const desde = fechaInicio > limite ? fechaInicio : limite;
      const pagina = await this.chamanMeteoService.daily(
        binding.gridPoint.key,
        CHAMAN_METEO_CALCULATION_VERSION,
        '500',
        '0',
        desde,
        this.desplazarFecha(hoy, 1),
      );
      return (pagina?.datos || [])
        .map((dia) => {
          const temperaturaSuelo = this.numeroOpcional(
            dia.values?.soilTemperatureMeanC?.[0],
          );
          const humedadSuelo = this.fraccionHumedad(
            dia.values?.soilWaterMeanM3M3?.[0],
          );
          return {
            fecha: String(dia.date || '').slice(0, 10),
            tipo: dia.date < hoy ? 'historico' : 'pronostico',
            temperaturaSuelo,
            humedadSuelo,
            lluviaMm: this.numeroOpcional(dia.values?.precipitationMm),
            et0Mm: this.numeroOpcional(dia.values?.et0Mm),
            fuente: 'Chaman-Meteo · suelo 0-7 cm',
            profundidadReferenciaCm: '0-7',
            coberturaHorariaPct:
              dia.hoursExpected > 0
                ? Math.min(100, (dia.hoursAvailable / dia.hoursExpected) * 100)
                : 0,
          } as DiaClimaMalezas;
        })
        .filter(
          (dia) =>
            !!dia.fecha &&
            dia.temperaturaSuelo !== undefined &&
            dia.humedadSuelo !== undefined,
        )
        .sort((left, right) => left.fecha.localeCompare(right.fecha));
    } catch (error) {
      this.logger.warn(
        `Chaman-Meteo no disponible para malezas del lote ${idLote}; Open-Meteo conserva prioridad: ${error?.message || error}`,
      );
      return [];
    }
  }

  private async getReporteSatelitalMalezas(idLote: string) {
    if (!this.reporteNDVIsService) return undefined;
    try {
      const result = await this.reporteNDVIsService.getLastByIdLote(idLote);
      return result?.datos?.[0];
    } catch (error) {
      this.logger.warn(
        `Contexto satelital no disponible para malezas del lote ${idLote}: ${error?.message || error}`,
      );
      return undefined;
    }
  }

  private contextoLoteMalezas(
    lote: ILote,
    seguimiento: ISeguimientoMalezasLote,
  ): IContextoLoteMalezas {
    const cultivo = lote.siembra?.semilla?.cultivo;
    const activa = !!lote.siembra && !lote.siembra.fechaCosecha;
    return {
      estado: activa ? 'siembra_activa' : 'sin_siembra_registrada',
      etiqueta: activa
        ? `${cultivo || 'Cultivo'} en seguimiento`
        : 'Lote sin siembra registrada',
      fechaInicio: seguimiento.fechaInicio,
      origen: seguimiento.origen,
      temporada: seguimiento.temporada,
    };
  }

  private ocultarParametrosMalezas<T>(lote: T): T {
    if (!lote || typeof lote !== 'object') return lote;
    const origen: any = lote as any;
    const salida: any =
      typeof origen.toObject === 'function'
        ? origen.toObject({ virtuals: true, getters: true })
        : { ...origen };
    salida.ultimaPrediccionMalezas = this.prediccionMalezasSegura(
      salida.ultimaPrediccionMalezas,
    );
    if (salida.siembra) {
      salida.siembra = {
        ...salida.siembra,
        ultimaPrediccionMalezas: this.prediccionMalezasSegura(
          salida.siembra.ultimaPrediccionMalezas,
        ),
      };
    }
    return salida as T;
  }

  private prediccionMalezasSegura(prediccion: any): any {
    if (!prediccion || typeof prediccion !== 'object') return prediccion;
    return {
      ...prediccion,
      especies: Array.isArray(prediccion.especies)
        ? prediccion.especies.map((item: any) => {
            const seguro = { ...item };
            delete seguro.formula;
            delete seguro.temperaturaBase;
            delete seguro.deltaHoras;
            return seguro;
          })
        : prediccion.especies,
    };
  }

  private numeroOpcional(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : undefined;
  }

  private fraccionHumedad(value: unknown): number | undefined {
    const numero = this.numeroOpcional(value);
    if (numero === undefined || numero < 0) return undefined;
    return Math.min(numero > 1 ? numero / 100 : numero, 1);
  }

  private fechaKey(fecha: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(fecha);
  }

  private desplazarFecha(fecha: string, dias: number): string {
    const valor = new Date(`${fecha}T12:00:00.000Z`);
    valor.setUTCDate(valor.getUTCDate() + dias);
    return valor.toISOString().slice(0, 10);
  }

  private requestSpatialResolution(
    loteId: string,
    motivo: 'lot_created' | 'geometry_added' | 'geometry_changed',
  ): void {
    void (async () => {
      try {
        await this.lotLocationService.requestResolution(loteId, motivo, {
          immediate: true,
        });
      } catch (error) {
        this.logger.error(
          `No se pudo encolar la ubicacion administrativa del lote ${loteId}: ${error?.message || error}`,
        );
      }

      // El suelo depende de la provincia resuelta para priorizar las capas
      // INTA. Aun si la ubicacion falla, SoilGrids debe poder completar la
      // evaluacion, por eso este segundo intento nunca se omite.
      this.requestSoilResolution(loteId, motivo);
    })();
  }

  private withoutAutomaticDepartment<T>(input: T): T {
    const data = { ...input } as T & Record<string, unknown>;
    delete data.idDepartamento;
    delete data.ubicacionDepartamentoLegado;
    return data;
  }

  private requestSoilResolution(
    loteId: string,
    reason:
      | 'lot_created'
      | 'geometry_added'
      | 'geometry_changed'
      | 'manual_value_changed',
  ): void {
    this.soilIntelligence
      .request(loteId, reason)
      .catch((error) =>
        this.logger.error(
          `No se pudo encolar la inteligencia de suelo del lote ${loteId}: ${error?.message || error}`,
        ),
      );
  }

  private hasSoilPayload(data: IUpdateLote | ICreateLote): boolean {
    return [
      'suelos',
      'capacidadDeCampo',
      'puntoMarchitez',
      'sueloReferencia',
      'texturaLixiviacion',
      'texturaEscorrentia',
    ].some((key) => Object.prototype.hasOwnProperty.call(data, key));
  }

  /**
   * Separa una modificacion fisica del suelo de cambios dinamicos del cultivo
   * (por ejemplo `hayRaices`) o del mapeo de sensores. Antes cualquier PUT que
   * incluyera `suelos` convertia todo el lote en una observacion manual, aun
   * cuando riego solo actualizaba raices o el formulario reenviaba los mismos
   * valores.
   */
  private hasPhysicalSoilChange(current: any, data: IUpdateLote): boolean {
    const scalarFields = [
      'capacidadDeCampo',
      'puntoMarchitez',
      'sueloReferencia',
      'texturaLixiviacion',
      'texturaEscorrentia',
    ];
    for (const key of scalarFields) {
      if (
        Object.prototype.hasOwnProperty.call(data, key) &&
        !this.sameValue((current as any)?.[key], (data as any)[key])
      ) {
        return true;
      }
    }

    if (!Object.prototype.hasOwnProperty.call(data, 'suelos')) return false;
    return !this.sameValue(
      this.physicalLayers(current?.suelos),
      this.physicalLayers(data.suelos),
    );
  }

  private physicalLayers(layers: any[] | undefined): unknown[] {
    return (layers || [])
      .map((layer, index) => ({
        index,
        textura: layer?.textura,
        capacidadDeCampo: layer?.capacidadDeCampo,
        puntoMarchitez: layer?.puntoMarchitez,
        hasTexture: Object.prototype.hasOwnProperty.call(
          layer || {},
          'textura',
        ),
        hasFieldCapacity: Object.prototype.hasOwnProperty.call(
          layer || {},
          'capacidadDeCampo',
        ),
        hasWiltingPoint: Object.prototype.hasOwnProperty.call(
          layer || {},
          'puntoMarchitez',
        ),
      }))
      .filter(
        (layer) =>
          layer.hasTexture || layer.hasFieldCapacity || layer.hasWiltingPoint,
      );
  }

  private sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private withManualSoilProvenance<T extends ICreateLote | IUpdateLote>(
    data: T,
    physicalSoilChanged: boolean,
  ): T {
    if (!physicalSoilChanged) return data;
    // Una calibracion generada por la sonda conserva su procedencia. Los
    // valores cartograficos automaticos no pasan por este servicio: los
    // persiste exclusivamente el motor de inteligencia de suelo.
    if (
      data.sueloProcedencia === 'sensor' &&
      data.sueloConfirmadoPorUsuario !== true
    ) {
      return data;
    }
    return {
      ...data,
      sueloProcedencia: 'manual',
      sueloConfirmadoPorUsuario: true,
      sueloFechaConfirmacion: new Date().toISOString(),
    } as T;
  }
}
