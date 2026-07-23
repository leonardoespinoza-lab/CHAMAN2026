import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ICreateReporteNDVI,
  IQueryParam,
  IReporteNDVI,
  IUpdateReporteNDVI,
  SATELLITE_INGESTION_MIN_VALID_COVERAGE_PCT,
} from 'modelos/src';
import {
  ReporteNDVIsRepository,
  TReporteNdviTenantScope,
} from './repository';

const MIN_VALID_COVERAGE_PCT = SATELLITE_INGESTION_MIN_VALID_COVERAGE_PCT;
const NDVI_MATCH_TOLERANCE = 1e-6;

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class ReporteNDVIsService {
  constructor(private repository: ReporteNDVIsRepository) {}

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

  async getLastByIdProductor(idProductor: string) {
    return await this.repository.getLastByIdProductor(idProductor);
  }

  async getLastByIdDistribuidor(idDistribuidor: string) {
    return await this.repository.getLastByIdDistribuidor(idDistribuidor);
  }

  async getLastByIdLote(idLote: string) {
    return await this.repository.getLastByIdLote(idLote);
  }

  async getLastByScope(scope: string, id: string) {
    const scopes = new Set<TReporteNdviTenantScope>([
      'quimica',
      'distribuidor',
      'productor',
      'establecimiento',
    ]);
    if (!scopes.has(scope as TReporteNdviTenantScope) || !String(id).trim()) {
      throw new BadRequestException(
        'El alcance tenant del reporte NDVI no es valido',
      );
    }
    return await this.repository.getLastByScope(
      scope as TReporteNdviTenantScope,
      id,
    );
  }

  async getLastByLote() {
    return await this.repository.getLast();
  }

  async create(dato: ICreateReporteNDVI) {
    const normalizado = this.normalizarYValidarReporte(dato);
    return await this.repository.create(normalizado);
  }

  async update(id: string, dato: IUpdateReporteNDVI) {
    const actual = await this.repository.getById(id);
    if (!actual) {
      throw new NotFoundException('No encontrado');
    }

    const combinado = this.combinarReporte(actual, dato);
    const normalizado = this.normalizarYValidarReporte(combinado);
    const updateNormalizado: IUpdateReporteNDVI = {
      ...dato,
      indices: normalizado.indices,
      metadataImagen: normalizado.metadataImagen,
      ndviPromedio: normalizado.ndviPromedio,
    };

    const updated = await this.repository.update(id, updateNormalizado);
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

  async deleteMany(query: IQueryParam) {
    return await this.repository.deleteMany(query);
  }

  private normalizarYValidarReporte<T extends Partial<IReporteNDVI>>(
    dato: T,
  ): T {
    const indices = this.registroOpcional(dato.indices, 'indices');
    const ndviIndice = indices?.ndvi;
    const ndviPromedio = dato.ndviPromedio;
    const tieneIndice = ndviIndice !== undefined && ndviIndice !== null;
    const tienePromedio = ndviPromedio !== undefined && ndviPromedio !== null;

    if (!tieneIndice && !tienePromedio) {
      throw new BadRequestException(
        'El reporte NDVI requiere un valor cientifico verificable',
      );
    }

    if (tieneIndice) {
      this.validarValorNdvi(ndviIndice, 'indices.ndvi');
    }
    if (tienePromedio) {
      this.validarValorNdvi(ndviPromedio, 'ndviPromedio');
    }

    if (
      tieneIndice &&
      tienePromedio &&
      Math.abs((ndviIndice as number) - (ndviPromedio as number)) >
        NDVI_MATCH_TOLERANCE
    ) {
      throw new BadRequestException(
        'ndviPromedio no coincide con el valor NDVI validado por indice',
      );
    }

    const ndviCanonico = (tieneIndice ? ndviIndice : ndviPromedio) as number;
    const metadata = this.registroRequerido(
      dato.metadataImagen,
      'metadataImagen',
    );
    this.validarQa(metadata);

    return {
      ...dato,
      indices: {
        ...(indices ?? {}),
        ndvi: ndviCanonico,
      },
      metadataImagen: metadata,
      ndviPromedio: ndviCanonico,
    } as T;
  }

  private validarValorNdvi(
    value: unknown,
    campo: string,
  ): asserts value is number {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < -1 ||
      value > 1
    ) {
      throw new BadRequestException(
        `${campo} debe ser un numero finito entre -1 y 1`,
      );
    }
  }

  private validarQa(metadata: UnknownRecord): void {
    const renderQa = this.registroOpcional(metadata.renderQa, 'renderQa');
    const indicesStats = this.registroOpcional(
      metadata.indicesStats,
      'indicesStats',
    );
    const qualityMask = this.registroOpcional(
      metadata.qualityMask,
      'qualityMask',
    );

    this.validarStatuses(renderQa, 'renderQa');
    this.validarStatuses(indicesStats, 'indicesStats');

    const qaNdvi = this.registroOpcional(renderQa?.ndvi, 'renderQa.ndvi');
    const statsNdvi = this.registroOpcional(
      indicesStats?.ndvi,
      'indicesStats.ndvi',
    );
    const coberturas = [
      ['renderQa.ndvi.validCoveragePct', qaNdvi?.validCoveragePct],
      ['indicesStats.ndvi.validCoveragePct', statsNdvi?.validCoveragePct],
      ['qualityMask.validCoveragePct', qualityMask?.validCoveragePct],
    ].filter(([, value]) => value !== undefined && value !== null) as Array<
      [string, unknown]
    >;

    if (!coberturas.length) {
      throw new BadRequestException(
        'El reporte NDVI requiere QA con cobertura valida',
      );
    }

    for (const [campo, value] of coberturas) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < MIN_VALID_COVERAGE_PCT ||
        value > 100
      ) {
        throw new BadRequestException(
          `${campo} debe ser finita y estar entre ${MIN_VALID_COVERAGE_PCT} y 100`,
        );
      }
    }

    if (
      metadata.renderVersion === 'fixed-index-v3' &&
      qaNdvi?.status !== 'ok'
    ) {
      throw new BadRequestException(
        'fixed-index-v3 requiere renderQa.ndvi.status=ok',
      );
    }
  }

  private validarStatuses(
    mapa: UnknownRecord | undefined,
    campo: string,
  ): void {
    if (!mapa) {
      return;
    }

    for (const [indice, valor] of Object.entries(mapa)) {
      const qa = this.registroRequerido(valor, `${campo}.${indice}`);
      if (qa.status !== undefined && qa.status !== null && qa.status !== 'ok') {
        throw new BadRequestException(
          `${campo}.${indice}.status debe ser ok cuando esta informado`,
        );
      }
    }
  }

  private combinarReporte(
    actual: IReporteNDVI,
    parche: IUpdateReporteNDVI,
  ): Partial<IReporteNDVI> {
    const actualRecord = actual as UnknownRecord;
    const patchRecord = parche as UnknownRecord;
    const indicesActuales = this.registroOpcional(
      actualRecord.indices,
      'indices actuales',
    );

    if (
      Object.prototype.hasOwnProperty.call(patchRecord, 'indices') &&
      (patchRecord.indices === null || typeof patchRecord.indices !== 'object')
    ) {
      throw new BadRequestException(
        'No se puede borrar indices en un reporte NDVI',
      );
    }

    const indicesParche = this.registroOpcional(patchRecord.indices, 'indices');
    const metadata = this.combinarMetadata(
      actualRecord.metadataImagen,
      patchRecord.metadataImagen,
      Object.prototype.hasOwnProperty.call(patchRecord, 'metadataImagen'),
    );

    return {
      ...actual,
      ...parche,
      indices: {
        ...(indicesActuales ?? {}),
        ...(indicesParche ?? {}),
      },
      metadataImagen: metadata,
    } as unknown as Partial<IReporteNDVI>;
  }

  private combinarMetadata(
    actualValue: unknown,
    patchValue: unknown,
    fueInformado: boolean,
  ): UnknownRecord | undefined {
    const actual = this.registroOpcional(actualValue, 'metadataImagen actual');
    if (!fueInformado) {
      return actual;
    }
    if (patchValue === null || typeof patchValue !== 'object') {
      throw new BadRequestException(
        'No se puede borrar metadataImagen ni su QA',
      );
    }

    const patch = patchValue as UnknownRecord;
    if (
      actual?.renderVersion === 'fixed-index-v3' &&
      Object.prototype.hasOwnProperty.call(patch, 'renderVersion') &&
      patch.renderVersion !== 'fixed-index-v3'
    ) {
      throw new BadRequestException(
        'No se puede degradar la version de render validada',
      );
    }

    const result: UnknownRecord = { ...(actual ?? {}), ...patch };
    result.qualityMask = this.combinarRegistroQa(
      actual?.qualityMask,
      patch.qualityMask,
      Object.prototype.hasOwnProperty.call(patch, 'qualityMask'),
      'qualityMask',
    );
    result.indicesStats = this.combinarMapaQa(
      actual?.indicesStats,
      patch.indicesStats,
      Object.prototype.hasOwnProperty.call(patch, 'indicesStats'),
      'indicesStats',
    );
    result.renderQa = this.combinarMapaQa(
      actual?.renderQa,
      patch.renderQa,
      Object.prototype.hasOwnProperty.call(patch, 'renderQa'),
      'renderQa',
    );
    return result;
  }

  private combinarRegistroQa(
    actualValue: unknown,
    patchValue: unknown,
    fueInformado: boolean,
    campo: string,
  ): UnknownRecord | undefined {
    const actual = this.registroOpcional(actualValue, `${campo} actual`);
    if (!fueInformado) {
      return actual;
    }
    const patch = this.registroRequerido(patchValue, campo);
    return { ...(actual ?? {}), ...patch };
  }

  private combinarMapaQa(
    actualValue: unknown,
    patchValue: unknown,
    fueInformado: boolean,
    campo: string,
  ): UnknownRecord | undefined {
    const actual = this.registroOpcional(actualValue, `${campo} actual`);
    if (!fueInformado) {
      return actual;
    }
    const patch = this.registroRequerido(patchValue, campo);
    const result: UnknownRecord = { ...(actual ?? {}) };
    for (const [indice, value] of Object.entries(patch)) {
      const actualIndice = this.registroOpcional(
        actual?.[indice],
        `${campo}.${indice} actual`,
      );
      const patchIndice = this.registroRequerido(value, `${campo}.${indice}`);
      result[indice] = { ...(actualIndice ?? {}), ...patchIndice };
    }
    return result;
  }

  private registroRequerido(value: unknown, campo: string): UnknownRecord {
    const record = this.registroOpcional(value, campo);
    if (!record) {
      throw new BadRequestException(`${campo} es requerido`);
    }
    return record;
  }

  private registroOpcional(
    value: unknown,
    campo: string,
  ): UnknownRecord | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${campo} debe ser un objeto`);
    }
    return value as UnknownRecord;
  }
}
