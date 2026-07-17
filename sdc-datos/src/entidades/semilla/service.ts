import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  evaluarEvidenciaTermicaVarietal,
  ICreateSemilla,
  IQueryParam,
  ISemilla,
  IUpdateSemilla,
} from 'modelos/src';
import { SemillasRepository } from './repository';

const FALTANTES_PERFIL_TERMICO = new Set([
  'fuente térmica por fases',
  'temperatura base',
  'temperatura superior',
  'método GDD explícito',
  'semántica explícita de GDD por etapa',
  'objetivos GDD por etapa',
  'orden único por etapa térmica',
  'rangos GDD válidos por etapa',
  'secuencia GDD acumulada monotónica por etapa',
]);
const FALTANTES_VERNALIZACION = new Set([
  'proceso de vernalización anual',
  'hábito varietal',
  'fuente de vernalización',
  'requisito nulo explícito para hábito primaveral',
  'modelo ventana calibrada implementado',
  'requisito positivo de ventana calibrada',
  'rango térmico de vernalización',
  'ventana fenológica explícita de vernalización',
]);
const FALTANTES_FOTOPERIODO = new Set([
  'modelo fotoperiódico varietal implementado',
  'fuente fotoperiódica varietal',
  'umbrales fotoperiódicos por etapa',
  'respuesta y umbral fotoperiódico válidos por etapa',
]);
const FALTANTES_REQUERIMIENTO_FRIO = new Set([
  'fuente de frío',
  'modelo rector HF o CP',
  'requisito HF positivo',
  'requisito CP positivo',
  'proceso de dormancia perenne',
]);
const FALTANTES_PROTOCOLO_FRIO = new Set([
  'fuente del protocolo estacional',
  'región del protocolo estacional',
  'inicio y fin de la ventana de frío',
]);

const CULTIVOS_CON_DORMANCIA = new Set([
  'MANZANO',
  'PERAL',
  'VID',
  'PECAN',
]);
const CULTIVOS_CON_VERNALIZACION_OBLIGATORIA = new Set(['TRIGO', 'CEBADA']);
const CULTIVOS_CON_VERNALIZACION_OPCIONAL = new Set(['ARVEJA']);
const PROCESOS_TERMICOS_ANUALES = new Set([
  'termico',
  'termico_fotoperiodico',
]);
const CAMPOS_VERNALIZACION = [
  'rangoVernalizacionC',
  'requerimientoVernalizacion',
  'modeloVernalizacion',
  'habitoVernalizacion',
  'fuenteVernalizacion',
  'estadoVernalizacion',
  'ventanaVernalizacion',
] as const;

@Injectable()
export class SemillasService {
  constructor(private repository: SemillasRepository) {}

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

  async create(dato: ICreateSemilla) {
    const normalized = this.normalizeForCreate(dato);
    this.assertNoFalseValidatedScientificClaims(normalized);
    return await this.repository.create(normalized);
  }

  async bulk(data: ICreateSemilla[]) {
    const normalized = (data || []).map((item) =>
      this.normalizeForCreate(item),
    );
    normalized.forEach((item) =>
      this.assertNoFalseValidatedScientificClaims(item),
    );
    return await this.repository.bulk(normalized);
  }

  async update(id: string, dato: IUpdateSemilla) {
    const current = await this.repository.getById(id);
    if (!current) {
      throw new NotFoundException('No encontrado');
    }
    const { data, unsetPaths } = this.normalizeForUpdate(current, dato);
    const effectiveSeed = this.mergeForScientificValidation(
      current,
      data,
      unsetPaths,
    );
    this.assertNoFalseValidatedScientificClaims(effectiveSeed);
    const updated = await this.repository.update(id, data, unsetPaths);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  private normalizeForCreate(data: ICreateSemilla): ICreateSemilla {
    const normalized: ICreateSemilla = {
      ...data,
      ...(data.requerimientoFrio
        ? { requerimientoFrio: { ...data.requerimientoFrio } }
        : {}),
      ...(data.parametrosAgrometeorologicos
        ? {
            parametrosAgrometeorologicos: {
              ...data.parametrosAgrometeorologicos,
            },
          }
        : {}),
    };
    const cultivo = this.normalizeCrop(normalized.cultivo);

    this.removeNullColdRequirementValues(normalized);
    this.removeNullAgrometeorologicalValues(normalized);
    if (!CULTIVOS_CON_DORMANCIA.has(cultivo)) {
      delete normalized.requerimientoFrio;
    }
    if (
      !this.debeConservarVernalizacion(
        cultivo,
        normalized.parametrosAgrometeorologicos?.procesoTermico,
      )
    ) {
      this.removeVernalizationFields(normalized);
    }
    this.removeIncompatibleThermalProcess(normalized, cultivo);
    return normalized;
  }

  private normalizeForUpdate(
    current: Partial<ISemilla>,
    data: IUpdateSemilla,
  ): { data: IUpdateSemilla; unsetPaths: string[] } {
    const normalized: IUpdateSemilla = {
      ...data,
      ...(data.requerimientoFrio
        ? { requerimientoFrio: { ...data.requerimientoFrio } }
        : {}),
      ...(data.parametrosAgrometeorologicos
        ? {
            parametrosAgrometeorologicos: {
              ...data.parametrosAgrometeorologicos,
            },
          }
        : {}),
    };
    const cultivo = this.normalizeCrop(data.cultivo || current.cultivo);
    const unsetPaths: string[] = [];

    this.extractExplicitNullUnsets(data, normalized, unsetPaths);
    this.removeNullColdRequirementValues(normalized);
    if (!CULTIVOS_CON_DORMANCIA.has(cultivo)) {
      delete normalized.requerimientoFrio;
      unsetPaths.push('requerimientoFrio');
    }

    const incomingParameters = data.parametrosAgrometeorologicos;
    const hasIncomingProcess =
      !!incomingParameters &&
      Object.prototype.hasOwnProperty.call(
        incomingParameters,
        'procesoTermico',
      );
    const cultivoCambio =
      !!data.cultivo &&
      this.normalizeCrop(current.cultivo) !== cultivo;
    const effectiveProcess = hasIncomingProcess
      ? incomingParameters?.procesoTermico
      : cultivoCambio
        ? undefined
        : current.parametrosAgrometeorologicos?.procesoTermico;

    if (!this.debeConservarVernalizacion(cultivo, effectiveProcess)) {
      this.removeVernalizationFields(normalized);
      unsetPaths.push(
        ...CAMPOS_VERNALIZACION.map(
          (field) => `parametrosAgrometeorologicos.${field}`,
        ),
      );
    }
    this.normalizeThermalProcessForUpdate(
      current,
      data,
      normalized,
      cultivo,
      cultivoCambio,
      unsetPaths,
    );

    return { data: normalized, unsetPaths: [...new Set(unsetPaths)] };
  }

  private removeNullAgrometeorologicalValues(
    data: ICreateSemilla | IUpdateSemilla,
  ): void {
    const rawParameters = (
      data as ICreateSemilla & {
        parametrosAgrometeorologicos?: Record<string, unknown> | null;
      }
    ).parametrosAgrometeorologicos;
    if (rawParameters === null) {
      delete data.parametrosAgrometeorologicos;
      return;
    }
    if (!rawParameters || typeof rawParameters !== 'object') {
      return;
    }
    for (const [field, value] of Object.entries(rawParameters)) {
      if (value === null || value === undefined) {
        delete rawParameters[field];
      }
    }
    this.removeEmptyAgrometeorologicalParameters(data);
  }

  private removeNullColdRequirementValues(
    data: ICreateSemilla | IUpdateSemilla,
  ): void {
    const container = data as ICreateSemilla & {
      requerimientoFrio?: Record<string, unknown> | null;
    };
    const requirement = container.requerimientoFrio;
    if (requirement === null) {
      delete data.requerimientoFrio;
      return;
    }
    if (!requirement || typeof requirement !== 'object') {
      return;
    }
    for (const [field, value] of Object.entries(requirement)) {
      if (value === null || value === undefined) {
        delete requirement[field];
      }
    }
    const protocol = requirement.protocoloTemporada;
    if (protocol && typeof protocol === 'object') {
      const normalizedProtocol =
        protocol as unknown as Record<string, unknown>;
      for (const [field, value] of Object.entries(normalizedProtocol)) {
        if (value === null || value === undefined) {
          delete normalizedProtocol[field];
        }
      }
      if (!Object.keys(normalizedProtocol).length) {
        delete requirement.protocoloTemporada;
      }
    }
    if (!Object.keys(requirement).length) {
      delete data.requerimientoFrio;
    }
  }

  private extractExplicitNullUnsets(
    originalUpdate: IUpdateSemilla,
    normalizedUpdate: IUpdateSemilla,
    unsetPaths: string[],
  ): void {
    // Contrato PATCH interno: un campo ausente no se modifica; `null`
    // solicita borrar su valor persistido y nunca se guarda como dato científico.
    const original = originalUpdate as IUpdateSemilla & {
      requerimientoFrio?: IUpdateSemilla['requerimientoFrio'] | null;
      parametrosAgrometeorologicos?:
        | Record<string, unknown>
        | null;
    };
    if (
      Object.prototype.hasOwnProperty.call(
        original,
        'requerimientoFrio',
      ) &&
      original.requerimientoFrio === null
    ) {
      delete normalizedUpdate.requerimientoFrio;
      unsetPaths.push('requerimientoFrio');
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        original,
        'parametrosAgrometeorologicos',
      )
    ) {
      return;
    }
    if (original.parametrosAgrometeorologicos === null) {
      delete normalizedUpdate.parametrosAgrometeorologicos;
      unsetPaths.push('parametrosAgrometeorologicos');
      return;
    }
    if (
      !original.parametrosAgrometeorologicos ||
      typeof original.parametrosAgrometeorologicos !== 'object'
    ) {
      return;
    }
    const normalizedParameters =
      normalizedUpdate.parametrosAgrometeorologicos as unknown as
        | Record<string, unknown>
        | undefined;
    for (const [field, value] of Object.entries(
      original.parametrosAgrometeorologicos,
    )) {
      if (value !== null) {
        continue;
      }
      if (normalizedParameters) {
        delete normalizedParameters[field];
      }
      unsetPaths.push(`parametrosAgrometeorologicos.${field}`);
    }
    this.removeEmptyAgrometeorologicalParameters(normalizedUpdate);
  }

  private removeVernalizationFields(
    data: ICreateSemilla | IUpdateSemilla,
  ): void {
    const parameters = data.parametrosAgrometeorologicos;
    if (!parameters) {
      return;
    }
    for (const field of CAMPOS_VERNALIZACION) {
      delete parameters[field];
    }
    this.removeEmptyAgrometeorologicalParameters(data);
  }

  private normalizeThermalProcessForUpdate(
    current: Partial<ISemilla>,
    originalUpdate: IUpdateSemilla,
    normalizedUpdate: IUpdateSemilla,
    cultivo: string,
    cultivoCambio: boolean,
    unsetPaths: string[],
  ): void {
    const incomingParameters = originalUpdate.parametrosAgrometeorologicos;
    const hasIncomingProcess =
      !!incomingParameters &&
      Object.prototype.hasOwnProperty.call(
        incomingParameters,
        'procesoTermico',
      );
    const incomingProcess = incomingParameters?.procesoTermico;
    const currentProcess =
      current.parametrosAgrometeorologicos?.procesoTermico;
    if (
      cultivoCambio &&
      !hasIncomingProcess &&
      currentProcess !== undefined
    ) {
      unsetPaths.push('parametrosAgrometeorologicos.procesoTermico');
      return;
    }
    const processToValidate = hasIncomingProcess
      ? incomingProcess
      : currentProcess;
    const hasProcessToValidate =
      hasIncomingProcess || currentProcess !== undefined;

    if (
      hasProcessToValidate &&
      !this.isThermalProcessAllowed(cultivo, processToValidate)
    ) {
      if (normalizedUpdate.parametrosAgrometeorologicos) {
        delete normalizedUpdate.parametrosAgrometeorologicos.procesoTermico;
        this.removeEmptyAgrometeorologicalParameters(normalizedUpdate);
      }
      unsetPaths.push('parametrosAgrometeorologicos.procesoTermico');
    }
  }

  private removeIncompatibleThermalProcess(
    data: ICreateSemilla | IUpdateSemilla,
    cultivo: string,
  ): void {
    const parameters = data.parametrosAgrometeorologicos;
    if (
      !parameters ||
      !Object.prototype.hasOwnProperty.call(parameters, 'procesoTermico')
    ) {
      return;
    }
    if (!this.isThermalProcessAllowed(cultivo, parameters.procesoTermico)) {
      delete parameters.procesoTermico;
      this.removeEmptyAgrometeorologicalParameters(data);
    }
  }

  private isThermalProcessAllowed(
    cultivo: string,
    process: unknown,
  ): boolean {
    if (CULTIVOS_CON_DORMANCIA.has(cultivo)) {
      return process === 'dormancia_perenne';
    }
    if (CULTIVOS_CON_VERNALIZACION_OBLIGATORIA.has(cultivo)) {
      return process === 'vernalizacion_anual';
    }
    if (CULTIVOS_CON_VERNALIZACION_OPCIONAL.has(cultivo)) {
      return (
        process === 'vernalizacion_anual' ||
        PROCESOS_TERMICOS_ANUALES.has(String(process || ''))
      );
    }
    return PROCESOS_TERMICOS_ANUALES.has(String(process || ''));
  }

  private debeConservarVernalizacion(
    cultivo: string,
    process: unknown,
  ): boolean {
    if (CULTIVOS_CON_VERNALIZACION_OBLIGATORIA.has(cultivo)) {
      return process === 'vernalizacion_anual';
    }
    return (
      CULTIVOS_CON_VERNALIZACION_OPCIONAL.has(cultivo) &&
      process === 'vernalizacion_anual'
    );
  }

  private removeEmptyAgrometeorologicalParameters(
    data: ICreateSemilla | IUpdateSemilla,
  ): void {
    if (
      data.parametrosAgrometeorologicos &&
      !Object.keys(data.parametrosAgrometeorologicos).length
    ) {
      delete data.parametrosAgrometeorologicos;
    }
  }

  private normalizeCrop(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  /**
   * El evaluador completo puede informar faltantes de varias capas a la vez.
   * En escritura solo hacemos cumplir la capa que el registro declara como
   * `validado`: una calibración térmica no convierte implícitamente en
   * validados al fotoperíodo, la vernalización o el protocolo de frío.
   */
  private assertNoFalseValidatedScientificClaims(
    seed: Partial<ISemilla>,
  ): void {
    const parametros = seed.parametrosAgrometeorologicos;
    const frio = seed.requerimientoFrio;
    const evaluation = evaluarEvidenciaTermicaVarietal(seed);
    const faltantes = new Set(evaluation.faltantes);
    const inconsistencias = new Set<string>();
    const tieneDeclaracionValidada =
      parametros?.estado === 'validado' ||
      parametros?.estadoVernalizacion === 'validado' ||
      parametros?.fotoperiodoVarietal?.estado === 'validado' ||
      frio?.estado === 'validado' ||
      frio?.protocoloTemporada?.estado === 'validado';

    const collect = (catalog: Set<string>) => {
      for (const missing of faltantes) {
        if (catalog.has(missing)) {
          inconsistencias.add(missing);
        }
      }
    };

    if (tieneDeclaracionValidada && faltantes.has('cultivo canónico')) {
      inconsistencias.add('cultivo canónico');
    }
    if (tieneDeclaracionValidada && faltantes.has('variedad')) {
      inconsistencias.add('variedad');
    }

    if (parametros?.estado === 'validado') {
      collect(FALTANTES_PERFIL_TERMICO);
    }
    if (parametros?.estadoVernalizacion === 'validado') {
      collect(FALTANTES_VERNALIZACION);
    }
    if (parametros?.fotoperiodoVarietal?.estado === 'validado') {
      collect(FALTANTES_FOTOPERIODO);
    }
    if (frio?.estado === 'validado') {
      collect(FALTANTES_REQUERIMIENTO_FRIO);
    }
    if (frio?.protocoloTemporada?.estado === 'validado') {
      collect(FALTANTES_PROTOCOLO_FRIO);
    }

    if (inconsistencias.size) {
      throw new BadRequestException(
        `No se puede guardar evidencia científica como validada: ${[
          ...inconsistencias,
        ].join(', ')}. Complete la calibración o cambie su estado a referencia/requiere_calibracion.`,
      );
    }
  }

  /**
   * Reproduce el PATCH que aplicará el repositorio para validar el estado
   * efectivo, no solo el fragmento recibido. Así tampoco se puede borrar una
   * parte de una ficha que continúa declarada como validada.
   */
  private mergeForScientificValidation(
    current: Partial<ISemilla>,
    patch: IUpdateSemilla,
    unsetPaths: string[],
  ): Partial<ISemilla> {
    const effective: Partial<ISemilla> = {
      ...current,
      ...patch,
      ...(patch.parametrosAgrometeorologicos
        ? {
            parametrosAgrometeorologicos: {
              ...(current.parametrosAgrometeorologicos || {}),
              ...patch.parametrosAgrometeorologicos,
            },
          }
        : {}),
    };

    for (const path of unsetPaths) {
      this.unsetValidationPath(
        effective as unknown as Record<string, unknown>,
        path,
      );
    }
    return effective;
  }

  private unsetValidationPath(
    target: Record<string, unknown>,
    path: string,
  ): void {
    const parts = path.split('.').filter(Boolean);
    let current: Record<string, unknown> | undefined = target;
    for (const part of parts.slice(0, -1)) {
      const next = current?.[part];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        return;
      }
      current = next as Record<string, unknown>;
    }
    if (current && parts.length) {
      delete current[parts[parts.length - 1]];
    }
  }
}
