import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  aplicarEntradasAgronomicasSuelo,
  AGROMET_ENGINE_VERSION,
  ICreateSiembra,
  IEntradasAgronomicasSuelo,
  IHuellaHidrica,
  IRegistroFenologico,
  IQueryParam,
  IUpdateLote,
  IUpdateSiembra,
  TObjetivoBiofixFenologico,
} from 'modelos/src';
import { AlgoritmosService } from '../algoritmos/service';
import { FertilizacionsService } from '../fertilizacion/service';
import { FumigacionsService } from '../fumigacion/service';
import { LotesService } from '../lote/service';
import { SoilAgronomicInputsService } from '../suelo-inteligencia/agronomic-inputs.service';
import { IndicadoresAgrometeorologicosService } from '../indicador-agrometeorologico/service';
import { SiembrasRepository } from './repository';
import { PrediccionsService } from '../prediccion/service';
import { AlertasService } from '../alerta/service';
import {
  DiaClimaHuella,
  HuellaHidricaSeguimientoResultado,
} from '../algoritmos/huella-hidrica.engine';

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
  private readonly logger = new Logger(SiembrasService.name);

  constructor(
    private repository: SiembrasRepository,
    private lotesService: LotesService,
    private fertilizacionsService: FertilizacionsService,
    private fumigacionsService: FumigacionsService,
    private algoritmosService: AlgoritmosService,
    private soilInputsService: SoilAgronomicInputsService,
    private indicadoresAgrometeorologicosService: IndicadoresAgrometeorologicosService,
    private prediccionsService: PrediccionsService,
    private alertasService: AlertasService,
  ) {}

  async getFilter(query: IQueryParam) {
    const listado = await this.repository.getFilter(query);
    return {
      ...listado,
      datos: (listado?.datos || []).map((siembra) =>
        this.ocultarParametrosMalezas(siembra),
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

  async create(dato: ICreateSiembra) {
    return await this.repository.create(
      this.sinHistorialFenologicoGenerico(dato),
    );
  }

  async update(id: string, dato: IUpdateSiembra) {
    const updated = await this.repository.update(
      id,
      this.sinHistorialFenologicoGenerico(dato),
    );
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async appendPhenologyRecord(id: string, dato: IRegistroFenologico) {
    const siembra = await this.getById(id);
    const record = this.validarRegistroFenologico(dato);
    const history = siembra.registrosFenologicos || [];
    if (history.some((item) => item.id === record.id)) {
      throw new BadRequestException(
        'El identificador del registro fenologico ya existe.',
      );
    }
    if (
      record.reemplazaRegistroId &&
      !history.some((item) => item.id === record.reemplazaRegistroId)
    ) {
      throw new BadRequestException(
        'El registro fenologico corregido no existe.',
      );
    }
    if (
      record.reemplazaRegistroId &&
      history.some(
        (item) => item.reemplazaRegistroId === record.reemplazaRegistroId,
      )
    ) {
      throw new BadRequestException(
        'El registro fenologico ya tiene una correccion posterior.',
      );
    }
    const updated = await this.repository.appendPhenologyRecord(id, record);
    if (updated) {
      return updated;
    }
    throw new BadRequestException(
      'El registro fenologico no pudo agregarse de forma atomica.',
    );
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    await Promise.all([
      this.indicadoresAgrometeorologicosService.deleteBySowing(id),
      this.prediccionsService.deleteByIdSiembra(id),
    ]);
    if (deleted) return deleted;
    throw new NotFoundException('No encontrado');
  }

  async cosechar(id: string, dato: IUpdateSiembra) {
    dato = this.sinHistorialFenologicoGenerico(dato);
    const siembra = await this.getById(id);
    const lotePersistido = await this.lotesService.getById(siembra.idLote);
    const soilContext = await this.getCanonicalSoilContext(lotePersistido);
    const lote = this.completarPendienteCanonica(soilContext.lote);

    const rendimientoSeco = this.algoritmosService.calcularHumedadSeca(
      dato.rendimientoObtenidoKgHa,
      dato.humedadCosecha,
    );

    const siembraParaCalculo = this.completarSiembraConSueloCanonico(
      {
        ...siembra,
        ...dato,
        fechaCosecha: dato.fechaCosecha,
        rendimientoObtenidoKgHaSeco: rendimientoSeco,
        activa: false,
      },
      soilContext.inputs,
    );

    const desdeFertilizacion = new Date(siembra.fechaSiembra);
    desdeFertilizacion.setDate(desdeFertilizacion.getDate() - 30);
    const hasta = new Date(dato.fechaCosecha).toISOString();

    const [fertilizacionesResult, fumigacionesResult] =
      await Promise.allSettled([
        this.fertilizacionsService.getFilter({
          filter: JSON.stringify({
            idLote: siembra.idLote,
            fechaFertilizacion: {
              $gte: desdeFertilizacion.toISOString(),
              $lte: hasta,
            },
          }),
          populate: 'fertilizante',
        }),
        this.fumigacionsService.getFilter({
          filter: JSON.stringify({ idSiembra: id }),
          populate: 'principioActivo',
        }),
      ]);
    const fertilizaciones =
      fertilizacionesResult.status === 'fulfilled'
        ? fertilizacionesResult.value?.datos || []
        : [];
    const fumigaciones =
      fumigacionesResult.status === 'fulfilled'
        ? fumigacionesResult.value?.datos || []
        : [];
    if (fertilizacionesResult.status === 'rejected') {
      this.logger.warn(
        `Cosecha ${id}: fertilizaciones no disponibles; la huella queda incompleta.`,
      );
    }
    if (fumigacionesResult.status === 'rejected') {
      this.logger.warn(
        `Cosecha ${id}: aplicaciones no disponibles; la huella queda incompleta.`,
      );
    }

    const huellaHidrica = await this.calcularHuellaCosechaSinBloqueo({
      idSiembra: id,
      siembra: siembraParaCalculo,
      lote,
      fertilizaciones,
      fumigaciones,
    });

    const updateSiembra: IUpdateSiembra = {
      ...dato,
      rendimientoObtenidoKgHaSeco: rendimientoSeco,
      activa: false,
      huellaHidrica,
    };

    const loteUpdate: IUpdateLote = { huellaHidrica };
    if (lotePersistido.suelos?.length) {
      loteUpdate.suelos = lotePersistido.suelos.map((suelo) => ({
        ...suelo,
        hayRaices: false,
      }));
    }

    // El cierre de la siembra es la operacion primaria. Las proyecciones sobre
    // el lote y las alertas son efectos secundarios reparables y no deben hacer
    // que el cliente reciba un error luego de una cosecha ya persistida.
    const updated = await this.repository.update(id, updateSiembra);
    if (!updated) {
      throw new NotFoundException('No encontrado');
    }

    const [lotResult, alertsResult] = await Promise.allSettled([
      this.lotesService.update(lote._id, loteUpdate),
      this.alertasService.finalizarTodasPorSiembra(
        id,
        'Ciclo productivo cerrado por cosecha. Las alertas previas se conservan como historial y dejan de estar activas.',
        new Date(dato.fechaCosecha).toISOString(),
      ),
    ]);
    if (lotResult.status === 'rejected') {
      this.logger.error(
        `Cosecha ${id} cerrada; quedo pendiente sincronizar el resumen del lote: ${lotResult.reason?.message || lotResult.reason}`,
      );
    }
    if (alertsResult.status === 'rejected') {
      this.logger.error(
        `Cosecha ${id} cerrada; quedo pendiente finalizar alertas: ${alertsResult.reason?.message || alertsResult.reason}`,
      );
    }
    return updated;
  }

  async seguimientoHuellaHidrica(id: string) {
    const siembraPersistida = await this.getById(id);
    const soilContext = await this.getCanonicalSoilContext(
      await this.lotesService.getById(siembraPersistida.idLote),
    );
    const lote = this.completarPendienteCanonica(soilContext.lote);
    const siembra = this.completarSiembraConSueloCanonico(
      siembraPersistida,
      soilContext.inputs,
    );
    const fechaSiembra = siembra.fechaSiembra
      ? new Date(siembra.fechaSiembra)
      : new Date();
    fechaSiembra.setDate(fechaSiembra.getDate() - 30);
    const hasta = (
      siembra.fechaCosecha ? new Date(siembra.fechaCosecha) : new Date()
    ).toISOString();

    const [fertilizacionesResult, fumigacionesResult] =
      await Promise.allSettled([
        this.fertilizacionsService.getFilter({
          filter: JSON.stringify({
            idLote: siembra.idLote,
            fechaFertilizacion: {
              $gte: fechaSiembra.toISOString(),
              $lte: hasta,
            },
          }),
          populate: 'fertilizante',
        }),
        this.fumigacionsService.getFilter({
          filter: JSON.stringify({ idSiembra: id }),
          populate: 'principioActivo',
        }),
      ]);

    const fertilizaciones =
      fertilizacionesResult.status === 'fulfilled'
        ? fertilizacionesResult.value?.datos || []
        : [];
    const fumigaciones =
      fumigacionesResult.status === 'fulfilled'
        ? fumigacionesResult.value?.datos || []
        : [];
    const base = {
      siembra,
      lote,
      fertilizaciones,
      fumigaciones,
    };
    const canonical = await this.getClimaCanonicoHuella(
      id,
      siembra.fechaSiembra,
      siembra.fechaCosecha || new Date().toISOString(),
    );
    if (!canonical.clima.length) {
      return await this.algoritmosService.calcularSeguimientoHuellaHidrica(
        base,
      );
    }
    const seguimiento = this.algoritmosService.simularSeguimientoHuellaHidrica({
      ...base,
      clima: canonical.clima,
    });
    seguimiento.metodologia = {
      ...seguimiento.metodologia,
      fuenteClima: `motor agrometeorologico canonico (${canonical.fuentes.join(', ') || 'fuente resuelta'})`,
    };
    return seguimiento;
  }

  private sinHistorialFenologicoGenerico<
    T extends ICreateSiembra | IUpdateSiembra,
  >(dato: T): T {
    this.validarClavesPersistencia(dato);
    const sanitized = { ...(dato || {}) } as T & {
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

  private validarRegistroFenologico(
    dato: IRegistroFenologico,
  ): IRegistroFenologico {
    const record: IRegistroFenologico = {
      ...(dato || {}),
      id: String(dato?.id || '').trim(),
      etapa: String(dato?.etapa || '').trim(),
    };
    if (!record.id || !record.etapa) {
      throw new BadRequestException(
        'El registro fenologico debe incluir id y etapa.',
      );
    }
    const date = String(
      record.fechaInicioEtapa || record.fechaObservacion || record.fecha || '',
    ).trim();
    if (!date || Number.isNaN(new Date(date).getTime())) {
      throw new BadRequestException(
        'El registro fenologico debe incluir una fecha valida.',
      );
    }
    if (
      record.confianza &&
      !['alta', 'media', 'baja'].includes(record.confianza)
    ) {
      throw new BadRequestException(
        'La confianza del registro fenologico no es valida.',
      );
    }
    const coverage =
      record.coberturaObservadaPct == null
        ? undefined
        : Number(record.coberturaObservadaPct);
    if (
      coverage !== undefined &&
      (!Number.isFinite(coverage) || coverage < 0 || coverage > 100)
    ) {
      throw new BadRequestException(
        'La cobertura fenologica observada debe estar entre 0 y 100%.',
      );
    }
    record.coberturaObservadaPct = coverage;

    if (record.tipoEvento === 'biofix') {
      if (
        !Array.isArray(record.objetivosBiofix) ||
        record.objetivosBiofix.length === 0
      ) {
        throw new BadRequestException(
          'Un biofix fenologico debe indicar al menos un objetivo biologico.',
        );
      }
      const invalid = record.objetivosBiofix.filter(
        (objective) => !OBJETIVOS_BIOFIX_PERMITIDOS.has(objective),
      );
      if (invalid.length) {
        throw new BadRequestException(
          'El biofix contiene objetivos biologicos no permitidos.',
        );
      }
      record.objetivosBiofix = [...new Set(record.objetivosBiofix)];
    } else {
      delete record.objetivosBiofix;
    }
    if (
      record.tipoEvento === 'correccion' &&
      !String(record.reemplazaRegistroId || '').trim()
    ) {
      throw new BadRequestException(
        'Una correccion fenologica debe identificar el registro reemplazado.',
      );
    }
    return record;
  }

  private async getCanonicalSoilContext(lote: any): Promise<{
    lote: any;
    inputs: IEntradasAgronomicasSuelo | null;
  }> {
    try {
      const inputs = await this.soilInputsService.getForLot(`${lote._id}`);
      return { lote: aplicarEntradasAgronomicasSuelo(lote, inputs), inputs };
    } catch (error) {
      this.logger.warn(
        `Entradas edaficas canonicas no disponibles para huella del lote ${lote?._id || ''}; se conserva el perfil previo: ${error?.message || error}`,
      );
      return {
        lote: aplicarEntradasAgronomicasSuelo(lote, null),
        inputs: null,
      };
    }
  }

  private completarSiembraConSueloCanonico(
    siembra: any,
    inputs: IEntradasAgronomicasSuelo | null,
  ): any {
    if (
      siembra.materiaOrganica ||
      !inputs?.organicMatterEstimatedPercentage ||
      inputs.stale ||
      !['ready', 'partial'].includes(inputs.status)
    ) {
      return siembra;
    }
    const organicMatter = Number(inputs.organicMatterEstimatedPercentage);
    const materiaOrganica =
      organicMatter < 1
        ? '< 1'
        : organicMatter < 3
          ? '> 1 < 3'
          : organicMatter < 5
            ? '> 3 < 5'
            : '> 5';
    return { ...siembra, materiaOrganica };
  }

  private completarPendienteCanonica(lote: any): any {
    if (lote.erosionEscorrentiaPendiente) return lote;
    const pendiente = Number(lote?.sueloReferencia?.pendientePorcentaje);
    if (!Number.isFinite(pendiente) || pendiente < 0) return lote;
    const erosionEscorrentiaPendiente =
      pendiente <= 3
        ? 'Baja (0 - 3%)'
        : pendiente <= 8
          ? 'Moderada (3 - 8%)'
          : pendiente <= 15
            ? 'Alta (8 - 15%)'
            : 'Muy Alta (> 15%)';
    return { ...lote, erosionEscorrentiaPendiente };
  }

  private async getClimaCanonicoHuella(
    idSiembra: string,
    desde?: string,
    hasta?: string,
  ): Promise<{ clima: DiaClimaHuella[]; fuentes: string[] }> {
    try {
      const active =
        await this.indicadoresAgrometeorologicosService.getActiveGeneration(
          idSiembra,
          AGROMET_ENGINE_VERSION,
        );
      const start = String(desde || '').slice(0, 10);
      const end = String(hasta || '').slice(0, 10);
      const rows = (active?.data || []).filter((row: any) => {
        const date = String(row?.fecha || '').slice(0, 10);
        return (
          !row?.esPronostico &&
          !!date &&
          (!start || date >= start) &&
          (!end || date <= end)
        );
      });
      const fuentes = [
        ...new Set(
          rows
            .flatMap((row: any) => [
              String(
                row?.fuentePorVariable?.precipitationMm || row?.fuente || '',
              ),
              String(row?.fuentePorVariable?.et0Mm || row?.fuente || ''),
            ])
            .filter(Boolean),
        ),
      ];
      return {
        clima: rows.map((row: any) => ({
          fecha: String(row.fecha).slice(0, 10),
          lluviaMm: Math.max(0, Number(row.metricas?.precipitationMm || 0)),
          et0Mm: Math.max(0, Number(row.metricas?.et0Mm || 0)),
        })),
        fuentes,
      };
    } catch (error) {
      this.logger.warn(
        `Serie agrometeorologica canonica no disponible para cosecha ${idSiembra}: ${error?.message || error}`,
      );
      return { clima: [], fuentes: [] };
    }
  }

  private async calcularHuellaCosechaSinBloqueo(params: {
    idSiembra: string;
    siembra: any;
    lote: any;
    fertilizaciones: any[];
    fumigaciones: any[];
  }): Promise<IHuellaHidrica> {
    const canonical = await this.getClimaCanonicoHuella(
      params.idSiembra,
      params.siembra.fechaSiembra,
      params.siembra.fechaCosecha,
    );
    const base = {
      siembra: params.siembra,
      lote: params.lote,
      fertilizaciones: params.fertilizaciones,
      fumigaciones: params.fumigaciones,
    };
    try {
      if (!canonical.clima.length) {
        throw new Error(
          'No hay serie agrometeorologica canonica historica para consolidar.',
        );
      }
      const resultado = this.algoritmosService.simularHuellaHidrica({
        ...base,
        clima: canonical.clima,
      });
      return {
        ...resultado.huella,
        estado: 'consolidada',
        faltantes: [],
        metodologia: {
          ...resultado.huella.metodologia,
          fuenteClima: canonical.clima.length
            ? `motor agrometeorologico canonico (${canonical.fuentes.join(', ') || 'fuente resuelta'})`
            : resultado.huella.metodologia?.fuenteClima,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Cosecha ${params.idSiembra}: huella final no consolidable; se guarda seguimiento incompleto: ${error?.message || error}`,
      );
      let seguimiento: HuellaHidricaSeguimientoResultado;
      try {
        seguimiento = this.algoritmosService.simularSeguimientoHuellaHidrica({
          ...base,
          clima: canonical.clima,
        });
      } catch (trackingError) {
        seguimiento = this.algoritmosService.simularSeguimientoHuellaHidrica({
          ...base,
          clima: [],
        });
      }
      return this.huellaIncompletaDesdeSeguimiento(
        seguimiento,
        canonical.fuentes,
      );
    }
  }

  private huellaIncompletaDesdeSeguimiento(
    seguimiento: HuellaHidricaSeguimientoResultado,
    fuentes: string[],
  ): IHuellaHidrica {
    return {
      estado: 'incompleta',
      faltantes: seguimiento.faltantes,
      verde: { litrosKg: seguimiento.progreso.verde.litrosKg },
      azul: { litrosKg: seguimiento.progreso.azul.litrosKg },
      gris: { litrosKg: seguimiento.progreso.gris.litrosKg },
      total: { litrosKg: seguimiento.progreso.total.litrosKg },
      componentes: seguimiento.parciales,
      calidad: seguimiento.calidad,
      metodologia: {
        ...seguimiento.metodologia,
        fuenteClima: fuentes.length
          ? `motor agrometeorologico canonico (${fuentes.join(', ')})`
          : seguimiento.metodologia.fuenteClima,
        limites: [
          ...(seguimiento.metodologia.limites || []),
          'La cosecha fue cerrada correctamente; la huella queda incompleta hasta incorporar los datos faltantes.',
        ],
      },
    };
  }

  async prediccionMalezas(id: string) {
    const siembra = await this.getById(id);
    if (!siembra.idLote) {
      throw new BadRequestException(
        'La siembra no tiene un lote asociado para calcular malezas.',
      );
    }
    return this.lotesService.prediccionMalezas(String(siembra.idLote));
  }

  /** Evita que resultados legacy transporten parametros propietarios al cliente. */
  private ocultarParametrosMalezas<T>(siembra: T): T {
    if (!siembra || typeof siembra !== 'object') return siembra;
    const origen: any = siembra as any;
    const salida: any =
      typeof origen.toObject === 'function' ? origen.toObject() : { ...origen };
    const prediccion = salida.ultimaPrediccionMalezas;
    if (!prediccion || typeof prediccion !== 'object') return salida as T;
    salida.ultimaPrediccionMalezas = {
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
    return salida as T;
  }
}
