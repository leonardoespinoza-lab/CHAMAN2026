import { HttpException, Injectable } from '@nestjs/common';
import {
  esCultivoPerenne,
  IListado,
  ILote,
  IQueryParam,
  IResumenRiesgosAgroclimaticos,
  ISiembra,
  IPrediccion,
} from 'modelos/src';
import { AxiosService } from '../axios/axios.service';
import {
  AGROMETEO_INTERNAL_TOKEN,
  API_CLIMA,
  API_DATOS,
  API_PREDICCIONES,
  DECISION_PIPELINE_JOB_TIMEOUT_MS,
} from '../../env';
import { DecisionAggregateType } from './decision-pipeline.types';

@Injectable()
export class DecisionPipelineRepository {
  constructor(private readonly axios: AxiosService) {}

  async resolveActiveSowingIds(
    scopeType: Exclude<DecisionAggregateType, 'siembra'>,
    scopeId: string,
  ): Promise<string[]> {
    const filter = await this.scopeFilter(scopeType, scopeId);
    const query: IQueryParam = {
      filter: JSON.stringify({
        ...filter,
        activa: { $ne: false },
      }),
      populate: 'semilla lote',
      select:
        '_id fechaSiembra fechaCosecha activa idSemilla idLote idEstablecimiento semilla lote',
      limit: 0,
    };
    const result = await this.axios.GET<IListado<ISiembra>>(
      `${API_DATOS}/siembras`,
      { params: query },
    );
    return [
      ...new Set(
        (result?.datos || [])
          .filter((sowing) => this.isActiveSowing(sowing))
          .map((sowing) => String(sowing._id || ''))
          .filter(Boolean),
      ),
    ];
  }

  async getActiveSowing(idSiembra: string): Promise<ISiembra | undefined> {
    try {
      const sowing = await this.axios.GET<ISiembra>(
        `${API_DATOS}/siembras/${idSiembra}`,
      );
      return this.isActiveSowing(sowing) ? sowing : undefined;
    } catch (error) {
      if (
        (error instanceof HttpException && error.getStatus() === 404) ||
        Number((error as any)?.status) === 404
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async reprocessClimate(
    idSiembra: string,
    sincronizarClima: boolean,
  ): Promise<void> {
    await this.axios.POST<void>(
      `${API_CLIMA}/agrometeorologia/siembras/${idSiembra}/reprocesar`,
      { sincronizarClima },
      {
        headers: this.internalHeaders(),
        timeout: DECISION_PIPELINE_JOB_TIMEOUT_MS - 10_000,
      },
    );
  }

  async rebuildSanitaryPredictions(
    idSiembra: string,
  ): Promise<IPrediccion[]> {
    return await this.axios.POST<IPrediccion[]>(
      `${API_PREDICCIONES}/prediccions/${idSiembra}/reconstruir`,
      {},
      { timeout: DECISION_PIPELINE_JOB_TIMEOUT_MS - 10_000 },
    );
  }

  async evaluateAgroclimate(
    idSiembra: string,
  ): Promise<IResumenRiesgosAgroclimaticos> {
    return await this.axios.GET<IResumenRiesgosAgroclimaticos>(
      `${API_PREDICCIONES}/prediccions/${idSiembra}/agroclima`,
      { timeout: DECISION_PIPELINE_JOB_TIMEOUT_MS - 10_000 },
    );
  }

  isActiveSowing(sowing: ISiembra | undefined): boolean {
    if (!sowing?._id || !sowing.fechaSiembra || sowing.activa === false) {
      return false;
    }
    return (
      !sowing.fechaCosecha || esCultivoPerenne(sowing.semilla?.cultivo)
    );
  }

  private async scopeFilter(
    scopeType: Exclude<DecisionAggregateType, 'siembra'>,
    scopeId: string,
  ): Promise<Record<string, unknown>> {
    if (scopeType === 'semilla') return { idSemilla: scopeId };
    if (scopeType === 'lote') return { idLote: scopeId };

    const lots = await this.axios.GET<IListado<ILote>>(`${API_DATOS}/lotes`, {
      params: {
        filter: JSON.stringify({ idEstablecimiento: scopeId }),
        select: '_id',
        limit: 0,
      },
    });
    const lotIds = (lots?.datos || [])
      .map((lot) => String(lot._id || ''))
      .filter(Boolean);
    return lotIds.length
      ? {
          $or: [
            { idEstablecimiento: scopeId },
            { idLote: { $in: lotIds } },
          ],
        }
      : { idEstablecimiento: scopeId };
  }

  private internalHeaders(): Record<string, string> {
    return AGROMETEO_INTERNAL_TOKEN
      ? { 'x-chaman-internal-token': AGROMETEO_INTERNAL_TOKEN }
      : {};
  }
}
