import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CATALOGO_CULTIVOS_FORMATO_VERSION,
  CATALOGO_CULTIVOS_MAX_FILAS,
  ICambioImportacionCatalogoCultivos,
  ICreateSemilla,
  IErrorImportacionCatalogoCultivos,
  IFilaCatalogoCultivos,
  IImportacionCatalogoCultivosRequest,
  IResistencia,
  IResultadoImportacionCatalogoCultivos,
  ISemilla,
  TEnfermedadId,
  claveNaturalCatalogo,
  columnasSanitariasCatalogo,
  derivarPerfilCatalogo,
  esCultivoCatalogo,
  getEnfermedadCanonica,
  getEnfermedadPorId,
  hashCatalogoEstable,
  normalizarPerfilCatalogo,
  normalizarTextoCatalogo,
  perfilVisibleCatalogo,
  snapshotSemillaCatalogo,
} from 'modelos/src';
import { SemillasRepository } from './repository';

type CatalogSeed = Omit<ISemilla, '_id'> & {
  _id?: unknown;
  __v?: number;
  id?: unknown;
};

type CatalogIdentityGuard = Partial<
  Pick<ISemilla, 'cultivo' | 'semillero' | 'variedad' | 'ciclo' | 'campania'>
>;

interface ExistingCatalogSeed {
  raw: CatalogSeed;
  plain: ISemilla;
  id: string;
  snapshot: string;
  naturalKey: string;
}

interface PlannedCreate {
  type: 'alta';
  row: IFilaCatalogoCultivos;
  naturalKey: string;
  data: ICreateSemilla;
  change: ICambioImportacionCatalogoCultivos;
}

interface PlannedUpdate {
  type: 'actualizacion';
  row: IFilaCatalogoCultivos;
  id: string;
  beforeSnapshot: string;
  expectedIdentity: CatalogIdentityGuard;
  beforeResistance: IResistencia[];
  replacementResistance: IResistencia[];
  change: ICambioImportacionCatalogoCultivos;
}

type PlannedOperation = PlannedCreate | PlannedUpdate;

interface ImportPlan {
  operations: PlannedOperation[];
  errors: IErrorImportacionCatalogoCultivos[];
  unchanged: number;
  planHash?: string;
}

interface UpdateAttempt {
  type: 'actualizacion';
  id: string;
  expectedIdentity: CatalogIdentityGuard;
  before: IResistencia[];
  after: IResistencia[];
}

interface CreateAttempt {
  type: 'alta';
  id: string;
  expected: CatalogSeed;
}

type WriteAttempt = UpdateAttempt | CreateAttempt;

const ESTADOS_RESISTENCIA = new Set([
  'observada',
  'historica',
  'inferida',
  'desconocida',
]);
const CONFIANZAS_RESISTENCIA = new Set(['alta', 'media', 'baja', 'sin_datos']);

@Injectable()
export class CatalogImportService {
  constructor(private readonly repository: SemillasRepository) {}

  async importar(
    request: IImportacionCatalogoCultivosRequest,
  ): Promise<IResultadoImportacionCatalogoCultivos> {
    const mode = request?.modo === 'confirmar' ? 'confirmar' : 'previsualizar';
    const envelopeErrors = this.validateEnvelope(request);
    if (envelopeErrors.length) {
      return this.result(mode, {
        operations: [],
        errors: envelopeErrors,
        unchanged: 0,
      });
    }

    const plan = await this.buildPlan(request);
    if (mode === 'previsualizar' || plan.errors.length) {
      return this.result(mode, plan);
    }

    if (!normalizarTextoCatalogo(request.planHash)) {
      plan.errors.push(
        this.error(0, '', 'planHash', 'Debe previsualizar antes de confirmar.'),
      );
      return this.result(mode, plan);
    }
    if (request.planHash !== plan.planHash) {
      plan.errors.push(
        this.error(
          0,
          '',
          'planHash',
          'El plan cambió desde la previsualización. Vuelva a previsualizar.',
        ),
      );
      return this.result(mode, plan);
    }

    if (!plan.operations.length) {
      return {
        ...this.result(mode, plan),
        idsCreados: [],
        idsActualizados: [],
      };
    }

    return await this.commitPlan(plan);
  }

  private validateEnvelope(
    request: IImportacionCatalogoCultivosRequest,
  ): IErrorImportacionCatalogoCultivos[] {
    const errors: IErrorImportacionCatalogoCultivos[] = [];
    if (!request || typeof request !== 'object') {
      return [
        this.error(
          0,
          '',
          undefined,
          'El cuerpo de importación es obligatorio.',
        ),
      ];
    }
    if (request.formatoVersion !== CATALOGO_CULTIVOS_FORMATO_VERSION) {
      errors.push(
        this.error(
          0,
          '',
          'formatoVersion',
          `Formato no soportado. Se esperaba ${CATALOGO_CULTIVOS_FORMATO_VERSION}.`,
        ),
      );
    }
    if (!['previsualizar', 'confirmar'].includes(String(request.modo || ''))) {
      errors.push(this.error(0, '', 'modo', 'Modo de importación inválido.'));
    }
    if (!Array.isArray(request.filas) || !request.filas.length) {
      errors.push(
        this.error(
          0,
          '',
          'filas',
          'La importación debe contener al menos una fila.',
        ),
      );
    } else if (request.filas.length > CATALOGO_CULTIVOS_MAX_FILAS) {
      errors.push(
        this.error(
          0,
          '',
          'filas',
          `La importación excede el máximo de ${CATALOGO_CULTIVOS_MAX_FILAS} filas.`,
        ),
      );
    }
    return errors;
  }

  private async buildPlan(
    request: IImportacionCatalogoCultivosRequest,
  ): Promise<ImportPlan> {
    const existing = (await this.repository.getAllForCatalogImport()).map(
      (seed) => this.describeExisting(seed as unknown as CatalogSeed),
    );
    const byId = new Map(existing.map((seed) => [seed.id, seed]));
    const byNaturalKey = new Map<string, ExistingCatalogSeed[]>();
    for (const seed of existing) {
      const grouped = byNaturalKey.get(seed.naturalKey) || [];
      grouped.push(seed);
      byNaturalKey.set(seed.naturalKey, grouped);
    }

    const operations: PlannedOperation[] = [];
    const errors: IErrorImportacionCatalogoCultivos[] = [];
    const seenIds = new Set<string>();
    const seenNaturalKeys = new Set<string>();
    let unchanged = 0;

    for (let index = 0; index < request.filas.length; index += 1) {
      const unsafeRow = request.filas[index] as IFilaCatalogoCultivos;
      const rowNumber = this.rowNumber(unsafeRow, index);
      const sheet = normalizarTextoCatalogo(unsafeRow?.hoja);
      const rowErrors: IErrorImportacionCatalogoCultivos[] = [];
      if (
        !unsafeRow ||
        typeof unsafeRow !== 'object' ||
        Array.isArray(unsafeRow)
      ) {
        errors.push(
          this.error(rowNumber, sheet, undefined, 'La fila no es válida.'),
        );
        continue;
      }
      if (!esCultivoCatalogo(unsafeRow.hoja)) {
        errors.push(
          this.error(
            rowNumber,
            sheet,
            'hoja',
            'La hoja no corresponde a un cultivo canónico.',
          ),
        );
        continue;
      }

      const row = this.normalizeRow(unsafeRow, rowNumber);
      this.validateIdentity(row, rowErrors);
      const identity = this.identityFor(row);
      const naturalKey = claveNaturalCatalogo(identity);
      const id = normalizarTextoCatalogo(row.id);

      if (id) {
        if (seenIds.has(id)) {
          rowErrors.push(
            this.error(
              row.fila,
              row.hoja,
              'id',
              'El mismo ID aparece más de una vez.',
            ),
          );
        }
        seenIds.add(id);
      }
      if (seenNaturalKeys.has(naturalKey)) {
        rowErrors.push(
          this.error(
            row.fila,
            row.hoja,
            'variedad',
            'La misma identidad varietal aparece más de una vez.',
          ),
        );
      }
      seenNaturalKeys.add(naturalKey);

      let current: ExistingCatalogSeed | undefined;
      if (id) {
        current = byId.get(id);
        if (!current) {
          rowErrors.push(
            this.error(
              row.fila,
              row.hoja,
              'id',
              'No existe una variedad con ese ID.',
            ),
          );
        } else {
          if (!normalizarTextoCatalogo(row.snapshot)) {
            rowErrors.push(
              this.error(
                row.fila,
                row.hoja,
                'snapshot',
                'El snapshot es obligatorio para actualizar.',
              ),
            );
          } else if (row.snapshot !== current.snapshot) {
            rowErrors.push(
              this.error(
                row.fila,
                row.hoja,
                'snapshot',
                'La variedad cambió desde la exportación. Exporte nuevamente.',
              ),
            );
          }
          if (naturalKey !== current.naturalKey) {
            rowErrors.push(
              this.error(
                row.fila,
                row.hoja,
                'identidad',
                'Cultivo, semillero, variedad, ciclo y campaña son inmutables al importar.',
              ),
            );
          }
        }
      } else {
        if (normalizarTextoCatalogo(row.snapshot)) {
          rowErrors.push(
            this.error(
              row.fila,
              row.hoja,
              'snapshot',
              'Una alta nueva no debe contener snapshot.',
            ),
          );
        }
        if ((byNaturalKey.get(naturalKey) || []).length) {
          rowErrors.push(
            this.error(
              row.fila,
              row.hoja,
              'id',
              'La identidad ya existe. Para actualizar debe conservar su ID exportado.',
            ),
          );
        }
      }

      const beforeResistance = this.clone(current?.plain.resistencia || []);
      const plannedResistance = this.planResistanceChanges(
        row,
        beforeResistance,
        rowErrors,
      );

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      if (current) {
        if (!plannedResistance.changedDiseases.length) {
          unchanged += 1;
          continue;
        }
        const effective = {
          ...current.raw,
          resistencia: plannedResistance.resistance,
        } as Partial<ISemilla>;
        try {
          await this.repository.validateCatalogDocument(effective);
        } catch (error) {
          errors.push(
            this.error(
              row.fila,
              row.hoja,
              'resistencia',
              `El documento efectivo no es válido: ${this.errorMessage(error)}`,
            ),
          );
          continue;
        }
        operations.push({
          type: 'actualizacion',
          row,
          id: current.id,
          beforeSnapshot: current.snapshot,
          expectedIdentity: this.identityGuardFor(current.plain),
          beforeResistance,
          replacementResistance: plannedResistance.resistance,
          change: this.change(
            'actualizacion',
            row,
            plannedResistance.changedDiseases,
            current.id,
          ),
        });
      } else {
        const data: ICreateSemilla = {
          cultivo: row.hoja,
          semillero: row.semillero,
          variedad: row.variedad,
          ciclo: row.ciclo,
          ...(row.campania ? { campania: row.campania } : {}),
          resistencia: plannedResistance.resistance,
        };
        try {
          await this.repository.validateCatalogDocument(data);
        } catch (error) {
          errors.push(
            this.error(
              row.fila,
              row.hoja,
              undefined,
              `La nueva variedad no es válida: ${this.errorMessage(error)}`,
            ),
          );
          continue;
        }
        operations.push({
          type: 'alta',
          row,
          naturalKey,
          data,
          change: this.change('alta', row, plannedResistance.changedDiseases),
        });
      }
    }

    const planHash = errors.length
      ? undefined
      : `v1-${hashCatalogoEstable(
          operations
            .map((operation) => this.operationForHash(operation))
            .sort((left, right) => left.key.localeCompare(right.key)),
        )}`;
    return { operations, errors, unchanged, planHash };
  }

  private planResistanceChanges(
    row: IFilaCatalogoCultivos,
    original: IResistencia[],
    errors: IErrorImportacionCatalogoCultivos[],
  ): { resistance: IResistencia[]; changedDiseases: TEnfermedadId[] } {
    if (
      !row.perfiles ||
      typeof row.perfiles !== 'object' ||
      Array.isArray(row.perfiles)
    ) {
      errors.push(
        this.error(
          row.fila,
          row.hoja,
          'perfiles',
          'Las categorías sanitarias son obligatorias.',
        ),
      );
      return { resistance: original, changedDiseases: [] };
    }

    const columns = columnasSanitariasCatalogo(row.hoja);
    const byDisease = new Map(
      columns.map((column) => [column.idEnfermedad, column]),
    );
    const requested = Object.entries(row.perfiles as Record<string, unknown>);
    const changes: Array<{
      id: TEnfermedadId;
      derived: NonNullable<ReturnType<typeof derivarPerfilCatalogo>>;
      existing?: IResistencia;
      index: number;
    }> = [];

    for (const [unsafeId, unsafeProfile] of requested) {
      const id = unsafeId as TEnfermedadId;
      const column = byDisease.get(id);
      if (!column) {
        errors.push(
          this.error(
            row.fila,
            row.hoja,
            `perfiles.${unsafeId}`,
            'La enfermedad no pertenece a este cultivo.',
          ),
        );
        continue;
      }
      const normalized = normalizarPerfilCatalogo(unsafeProfile);
      const matches = this.resistanceMatches(original, id);
      if (matches.length > 1) {
        errors.push(
          this.error(
            row.fila,
            row.hoja,
            `perfiles.${id}`,
            'Existen múltiples registros para la misma enfermedad; requiere conciliación manual.',
          ),
        );
        continue;
      }
      const index = matches[0] ?? -1;
      const existing = index >= 0 ? original[index] : undefined;
      const visible = perfilVisibleCatalogo(existing);

      if (!normalized || normalized === 'SIN_REGISTRO') continue;
      if (normalized === visible) continue;
      if (
        normalized === 'DATO_ESPECIFICO' ||
        normalized === 'NO_CATEGORIZADA'
      ) {
        errors.push(
          this.error(
            row.fila,
            row.hoja,
            `perfiles.${id}`,
            'El marcador no puede crear ni reemplazar información sanitaria.',
          ),
        );
        continue;
      }
      if (!column.editable) {
        errors.push(
          this.error(
            row.fila,
            row.hoja,
            `perfiles.${id}`,
            column.motivoSoloLectura || 'La enfermedad es de solo lectura.',
          ),
        );
        continue;
      }
      if (existing?.detalleSanitario) {
        errors.push(
          this.error(
            row.fila,
            row.hoja,
            `perfiles.${id}`,
            'Un dato sanitario específico no puede reemplazarse por una categoría general.',
          ),
        );
        continue;
      }
      const derived = derivarPerfilCatalogo(row.hoja, id, normalized);
      if (!derived) {
        errors.push(
          this.error(
            row.fila,
            row.hoja,
            `perfiles.${id}`,
            `Categoría no permitida. Valores: ${[
              ...column.perfilesPermitidos,
              'DESCONOCIDA',
            ].join(', ')}.`,
          ),
        );
        continue;
      }
      changes.push({ id, derived, existing, index });
    }

    if (!changes.length) return { resistance: original, changedDiseases: [] };
    this.validateUpdateMetadata(row, changes, errors);
    if (errors.length) return { resistance: original, changedDiseases: [] };

    const resistance = this.clone(original);
    for (const change of changes) {
      const definition = getEnfermedadPorId(change.id);
      if (!definition) continue;
      const known = change.derived.perfil !== 'DESCONOCIDA';
      const source = normalizarTextoCatalogo(row.fuenteActualizacion);
      const currentState = change.existing?.estado;
      const currentConfidence = change.existing?.confianza;
      const replacement: IResistencia = {
        ...(change.existing || {}),
        idEnfermedad: change.id,
        enfermedad: definition.nombre,
        perfil: change.derived.perfil,
        multiplicador: change.derived.multiplicador,
        indiceResistencia: change.derived.indiceResistencia,
        estado: known
          ? row.estado && row.estado !== 'desconocida'
            ? row.estado
            : currentState && currentState !== 'desconocida'
              ? currentState
              : 'inferida'
          : 'desconocida',
        confianza: known
          ? row.confianza ||
            (currentConfidence && currentConfidence !== 'sin_datos'
              ? currentConfidence
              : 'baja')
          : 'sin_datos',
        ...(source ? { fuente: source } : {}),
        ...(normalizarTextoCatalogo(row.campaniaFuente)
          ? { campaniaFuente: normalizarTextoCatalogo(row.campaniaFuente) }
          : {}),
        ...(normalizarTextoCatalogo(row.fechaFuente)
          ? { fechaFuente: normalizarTextoCatalogo(row.fechaFuente) }
          : {}),
        ...(normalizarTextoCatalogo(row.observacionesActualizacion)
          ? {
              observaciones: normalizarTextoCatalogo(
                row.observacionesActualizacion,
              ),
            }
          : {}),
      };
      if (change.index >= 0) resistance[change.index] = replacement;
      else resistance.push(replacement);
    }
    return { resistance, changedDiseases: changes.map((change) => change.id) };
  }

  private validateUpdateMetadata(
    row: IFilaCatalogoCultivos,
    changes: Array<{
      derived: NonNullable<ReturnType<typeof derivarPerfilCatalogo>>;
    }>,
    errors: IErrorImportacionCatalogoCultivos[],
  ): void {
    const knownChange = changes.some(
      (change) => change.derived.perfil !== 'DESCONOCIDA',
    );
    if (knownChange && !normalizarTextoCatalogo(row.fuenteActualizacion)) {
      errors.push(
        this.error(
          row.fila,
          row.hoja,
          'fuenteActualizacion',
          'La fuente es obligatoria para cargar una categoría conocida.',
        ),
      );
    }
    if (row.estado && !ESTADOS_RESISTENCIA.has(String(row.estado))) {
      errors.push(
        this.error(row.fila, row.hoja, 'estado', 'Estado sanitario inválido.'),
      );
    }
    if (knownChange && row.estado === 'desconocida') {
      errors.push(
        this.error(
          row.fila,
          row.hoja,
          'estado',
          'Una categoría conocida no puede declararse con estado desconocido.',
        ),
      );
    }
    if (row.confianza && !CONFIANZAS_RESISTENCIA.has(String(row.confianza))) {
      errors.push(
        this.error(
          row.fila,
          row.hoja,
          'confianza',
          'Confianza sanitaria inválida.',
        ),
      );
    }
    const date = normalizarTextoCatalogo(row.fechaFuente);
    if (date && !this.isIsoCalendarDate(date)) {
      errors.push(
        this.error(
          row.fila,
          row.hoja,
          'fechaFuente',
          'La fecha debe ser válida y usar AAAA-MM-DD.',
        ),
      );
    }
  }

  private async commitPlan(
    plan: ImportPlan,
  ): Promise<IResultadoImportacionCatalogoCultivos> {
    await this.assertPlanStillCurrent(plan);
    const attempts: WriteAttempt[] = [];
    const idsCreated: string[] = [];
    const idsUpdated: string[] = [];
    try {
      for (const operation of plan.operations) {
        if (operation.type === 'actualizacion') {
          attempts.push({
            type: 'actualizacion',
            id: operation.id,
            expectedIdentity: operation.expectedIdentity,
            before: operation.beforeResistance,
            after: operation.replacementResistance,
          });
          const updated = await this.repository.replaceCatalogResistance(
            operation.id,
            operation.expectedIdentity,
            operation.beforeResistance,
            operation.replacementResistance,
          );
          if (!updated) {
            // Un resultado null confirma que el compare-and-set no escribió.
            // No debe intentarse compensar una edición ajena.
            attempts.pop();
            throw new ConflictException(
              `La variedad ${operation.id} cambió durante la confirmación.`,
            );
          }
          const persisted = this.toPlain(updated as unknown as CatalogSeed);
          if (
            !this.sameResistance(
              persisted.resistencia,
              operation.replacementResistance,
            )
          ) {
            throw new Error('Mongo no devolvió la matriz sanitaria esperada.');
          }
          idsUpdated.push(operation.id);
          continue;
        }

        const id = new Types.ObjectId().toHexString();
        // Mongoose inicia el versionKey en cero. Incluirlo antes de esperar la
        // respuesta permite compensar también un alta aplicada cuyo ACK se perdió.
        const expected = { ...operation.data, _id: id, __v: 0 } as CatalogSeed;
        const attempt: CreateAttempt = { type: 'alta', id, expected };
        attempts.push(attempt);
        const created = await this.repository.createCatalogDocument(
          expected as unknown as ICreateSemilla,
        );
        const persisted = this.toPlain(
          created as unknown as CatalogSeed,
        ) as CatalogSeed;
        const persistedId = normalizarTextoCatalogo(persisted._id);
        if (!persistedId) {
          throw new Error('Mongo no devolvió el ID de la variedad creada.');
        }
        attempt.id = persistedId;
        attempt.expected = persisted;
        idsCreated.push(persistedId);
      }
    } catch (error) {
      const rollbackErrors = await this.rollback(attempts);
      if (rollbackErrors.length) {
        throw new InternalServerErrorException(
          `La importación falló y el rollback quedó incompleto: ${rollbackErrors.join(' | ')}`,
        );
      }
      throw new ConflictException(
        `La importación no se aplicó; rollback verificado. ${this.errorMessage(error)}`,
      );
    }

    return {
      ...this.result('confirmar', plan),
      idsCreados: idsCreated,
      idsActualizados: idsUpdated,
    };
  }

  private async assertPlanStillCurrent(plan: ImportPlan): Promise<void> {
    const current = (await this.repository.getAllForCatalogImport()).map(
      (seed) => this.describeExisting(seed as unknown as CatalogSeed),
    );
    const byId = new Map(current.map((seed) => [seed.id, seed]));
    const naturalKeys = new Set(current.map((seed) => seed.naturalKey));
    for (const operation of plan.operations) {
      if (operation.type === 'actualizacion') {
        if (byId.get(operation.id)?.snapshot !== operation.beforeSnapshot) {
          throw new ConflictException(
            `La variedad ${operation.id} cambió antes de escribir.`,
          );
        }
      } else if (naturalKeys.has(operation.naturalKey)) {
        throw new ConflictException(
          `La identidad de ${operation.row.variedad} ya existe.`,
        );
      }
    }
  }

  private async rollback(attempts: WriteAttempt[]): Promise<string[]> {
    const failures: string[] = [];
    for (const attempt of [...attempts].reverse()) {
      try {
        const current = await this.repository.getById(attempt.id);
        if (attempt.type === 'actualizacion') {
          if (!current) {
            failures.push(`${attempt.id}: documento ausente`);
            continue;
          }
          const currentResistance = this.toPlain(
            current as unknown as CatalogSeed,
          ).resistencia;
          if (this.sameResistance(currentResistance, attempt.before)) continue;
          if (!this.sameResistance(currentResistance, attempt.after)) {
            failures.push(`${attempt.id}: estado concurrente no reconocible`);
            continue;
          }
          const restored = await this.repository.replaceCatalogResistance(
            attempt.id,
            attempt.expectedIdentity,
            attempt.after,
            attempt.before,
          );
          if (!restored) {
            failures.push(
              `${attempt.id}: compare-and-set de rollback rechazado`,
            );
            continue;
          }
          const verified = await this.repository.getById(attempt.id);
          if (
            !verified ||
            !this.sameResistance(
              this.toPlain(verified as unknown as CatalogSeed).resistencia,
              attempt.before,
            )
          ) {
            failures.push(`${attempt.id}: restauración no verificada`);
          }
          continue;
        }

        if (!current) continue;
        const currentPlain = this.toPlain(current as unknown as CatalogSeed);
        if (
          snapshotSemillaCatalogo(currentPlain) !==
          snapshotSemillaCatalogo(attempt.expected as ISemilla)
        ) {
          failures.push(`${attempt.id}: alta modificada concurrentemente`);
          continue;
        }
        const deleted = await this.repository.deleteCreatedCatalogDocument(
          attempt.id,
          currentPlain as unknown as Partial<ISemilla> & { __v?: number },
        );
        const remaining = await this.repository.getById(attempt.id);
        if (!remaining) continue;
        failures.push(
          `${attempt.id}: eliminación compensatoria no verificada${
            deleted ? '' : ' (compare-and-set rechazado)'
          }`,
        );
      } catch (error) {
        failures.push(`${attempt.id}: ${this.errorMessage(error)}`);
      }
    }
    return failures;
  }

  private normalizeRow(
    row: IFilaCatalogoCultivos,
    rowNumber: number,
  ): IFilaCatalogoCultivos {
    return {
      ...row,
      fila: rowNumber,
      hoja: row.hoja,
      id: normalizarTextoCatalogo(row.id) || undefined,
      snapshot: normalizarTextoCatalogo(row.snapshot) || undefined,
      semillero: normalizarTextoCatalogo(row.semillero),
      variedad: normalizarTextoCatalogo(row.variedad),
      ciclo: normalizarTextoCatalogo(row.ciclo).toUpperCase(),
      campania: normalizarTextoCatalogo(row.campania) || undefined,
      perfiles: row.perfiles,
      fuenteActualizacion:
        normalizarTextoCatalogo(row.fuenteActualizacion) || undefined,
      campaniaFuente: normalizarTextoCatalogo(row.campaniaFuente) || undefined,
      fechaFuente: normalizarTextoCatalogo(row.fechaFuente) || undefined,
      observacionesActualizacion:
        normalizarTextoCatalogo(row.observacionesActualizacion) || undefined,
    };
  }

  private validateIdentity(
    row: IFilaCatalogoCultivos,
    errors: IErrorImportacionCatalogoCultivos[],
  ): void {
    for (const field of ['semillero', 'variedad', 'ciclo'] as const) {
      if (!normalizarTextoCatalogo(row[field])) {
        errors.push(
          this.error(row.fila, row.hoja, field, `${field} es obligatorio.`),
        );
      }
    }
  }

  private identityFor(row: IFilaCatalogoCultivos): ISemilla {
    return {
      cultivo: row.hoja,
      semillero: row.semillero,
      variedad: row.variedad,
      ciclo: row.ciclo,
      campania: row.campania,
    };
  }

  private identityGuardFor(seed: ISemilla): CatalogIdentityGuard {
    const guard: CatalogIdentityGuard = {};
    for (const field of [
      'cultivo',
      'semillero',
      'variedad',
      'ciclo',
      'campania',
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(seed, field)) {
        guard[field] = seed[field] as never;
      }
    }
    return guard;
  }

  private describeExisting(seed: CatalogSeed): ExistingCatalogSeed {
    const plain = this.toPlain(seed);
    const id = normalizarTextoCatalogo(plain._id);
    return {
      raw: seed,
      plain,
      id,
      snapshot: snapshotSemillaCatalogo(plain),
      naturalKey: claveNaturalCatalogo(plain),
    };
  }

  private toPlain(seed: CatalogSeed): ISemilla {
    return JSON.parse(JSON.stringify(seed)) as ISemilla;
  }

  private resistanceMatches(
    resistance: IResistencia[],
    id: TEnfermedadId,
  ): number[] {
    const matches: number[] = [];
    resistance.forEach((entry, index) => {
      const canonical = getEnfermedadPorId(entry.idEnfermedad as TEnfermedadId)
        ? entry.idEnfermedad
        : getEnfermedadCanonica(entry.enfermedad)?.id;
      if (canonical === id) matches.push(index);
    });
    return matches;
  }

  private isIsoCalendarDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }

  private sameResistance(
    left: IResistencia[] | undefined,
    right: IResistencia[] | undefined,
  ): boolean {
    return hashCatalogoEstable(left || []) === hashCatalogoEstable(right || []);
  }

  private operationForHash(operation: PlannedOperation): {
    key: string;
    type: PlannedOperation['type'];
    beforeSnapshot?: string;
    data?: ICreateSemilla;
    resistance?: IResistencia[];
  } {
    return operation.type === 'alta'
      ? {
          key: `alta|${operation.naturalKey}`,
          type: operation.type,
          data: operation.data,
        }
      : {
          key: `actualizacion|${operation.id}`,
          type: operation.type,
          beforeSnapshot: operation.beforeSnapshot,
          resistance: operation.replacementResistance,
        };
  }

  private change(
    type: ICambioImportacionCatalogoCultivos['tipo'],
    row: IFilaCatalogoCultivos,
    diseases: TEnfermedadId[],
    id?: string,
  ): ICambioImportacionCatalogoCultivos {
    return {
      tipo: type,
      ...(id ? { id } : {}),
      cultivo: row.hoja,
      semillero: row.semillero,
      variedad: row.variedad,
      enfermedades: diseases,
    };
  }

  private result(
    mode: IResultadoImportacionCatalogoCultivos['modo'],
    plan: ImportPlan,
  ): IResultadoImportacionCatalogoCultivos {
    const changes = plan.operations.map((operation) => operation.change);
    return {
      formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
      modo: mode,
      ...(plan.planHash ? { planHash: plan.planHash } : {}),
      altas: changes.filter((change) => change.tipo === 'alta').length,
      actualizaciones: changes.filter(
        (change) => change.tipo === 'actualizacion',
      ).length,
      sinCambios: plan.unchanged,
      errores: plan.errors,
      cambios: changes,
    };
  }

  private rowNumber(row: IFilaCatalogoCultivos, index: number): number {
    const value = Number(row?.fila);
    return Number.isInteger(value) && value > 0 ? value : index + 2;
  }

  private error(
    row: number,
    sheet: string,
    field: string | undefined,
    message: string,
  ): IErrorImportacionCatalogoCultivos {
    return {
      fila: row,
      hoja: sheet,
      ...(field ? { campo: field } : {}),
      mensaje: message,
    };
  }

  private errorMessage(error: unknown): string {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException
    ) {
      return error.message;
    }
    if (error instanceof Error && error.message) return error.message;
    return 'Error de persistencia no identificado.';
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
