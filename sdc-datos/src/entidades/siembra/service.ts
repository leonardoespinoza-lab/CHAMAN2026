import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  aplicarEntradasAgronomicasSuelo,
  ICreateSiembra,
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
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return data;
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
    const lote = await this.withCanonicalSoil(lotePersistido);

    const rendimientoSeco = this.algoritmosService.calcularHumedadSeca(
      dato.rendimientoObtenidoKgHa,
      dato.humedadCosecha,
    );

    const siembraParaCalculo = {
      ...siembra,
      ...dato,
      fechaCosecha: dato.fechaCosecha,
      rendimientoObtenidoKgHaSeco: rendimientoSeco,
      activa: false,
    };

    const desdeFertilizacion = new Date(siembra.fechaSiembra);
    desdeFertilizacion.setDate(desdeFertilizacion.getDate() - 30);
    const hasta = new Date(dato.fechaCosecha).toISOString();

    const [fertilizaciones, fumigaciones] = await Promise.all([
      this.fertilizacionsService.getFilter({
        filter: JSON.stringify({
          idLote: siembra.idLote,
          fechaFertilizacion: { $gte: desdeFertilizacion.toISOString(), $lte: hasta },
        }),
        populate: 'fertilizante',
      }),
      this.fumigacionsService.getFilter({
        filter: JSON.stringify({ idSiembra: id }),
        populate: 'principioActivo',
      }),
    ]);

    const resultado = await this.algoritmosService.calcularHuellaHidricaReal({
      siembra: siembraParaCalculo,
      lote,
      fertilizaciones: fertilizaciones.datos,
      fumigaciones: fumigaciones.datos,
    });

    const updateSiembra: IUpdateSiembra = {
      ...dato,
      rendimientoObtenidoKgHaSeco: rendimientoSeco,
      activa: false,
      huellaHidrica: resultado.huella,
    };

    const loteUpdate: IUpdateLote = { huellaHidrica: resultado.huella };
    if (lotePersistido.suelos?.length) {
      loteUpdate.suelos = lotePersistido.suelos.map((suelo) => ({
        ...suelo,
        hayRaices: false,
      }));
    }

    const [updated] = await Promise.all([
      this.repository.update(id, updateSiembra),
      this.lotesService.update(lote._id, loteUpdate),
    ]);

    if (updated) {
      await this.alertasService.finalizarTodasPorSiembra(
        id,
        'Ciclo productivo cerrado por cosecha. Las alertas previas se conservan como historial y dejan de estar activas.',
        new Date(dato.fechaCosecha).toISOString(),
      );
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async seguimientoHuellaHidrica(id: string) {
    const siembra = await this.getById(id);
    const lote = await this.withCanonicalSoil(
      await this.lotesService.getById(siembra.idLote),
    );
    const fechaSiembra = siembra.fechaSiembra ? new Date(siembra.fechaSiembra) : new Date();
    fechaSiembra.setDate(fechaSiembra.getDate() - 30);
    const hasta = (siembra.fechaCosecha ? new Date(siembra.fechaCosecha) : new Date()).toISOString();

    const [fertilizaciones, fumigaciones] = await Promise.all([
      this.fertilizacionsService.getFilter({
        filter: JSON.stringify({
          idLote: siembra.idLote,
          fechaFertilizacion: { $gte: fechaSiembra.toISOString(), $lte: hasta },
        }),
        populate: 'fertilizante',
      }),
      this.fumigacionsService.getFilter({
        filter: JSON.stringify({ idSiembra: id }),
        populate: 'principioActivo',
      }),
    ]);

    return await this.algoritmosService.calcularSeguimientoHuellaHidrica({
      siembra,
      lote,
      fertilizaciones: fertilizaciones.datos,
      fumigaciones: fumigaciones.datos,
    });
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

  private validarClavesPersistencia(
    value: unknown,
    path = 'siembra',
  ): void {
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
      record.fechaInicioEtapa ||
        record.fechaObservacion ||
        record.fecha ||
        '',
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

  private async withCanonicalSoil(lote: any) {
    try {
      const inputs = await this.soilInputsService.getForLot(`${lote._id}`);
      return aplicarEntradasAgronomicasSuelo(lote, inputs);
    } catch (error) {
      this.logger.warn(
        `Entradas edaficas canonicas no disponibles para huella del lote ${lote?._id || ''}; se conserva el perfil previo: ${error?.message || error}`,
      );
      return aplicarEntradasAgronomicasSuelo(lote, null);
    }
  }

  async prediccionMalezas(id: string) {
    const siembra = await this.getById(id);
    const lote = await this.lotesService.getById(siembra.idLote);
    const resultado = await this.algoritmosService.calcularPrediccionMalezas({ siembra, lote });

    if (resultado.estado !== 'sin_clima') {
      await this.repository.update(id, { ultimaPrediccionMalezas: resultado });
    }

    return resultado;
  }
}
