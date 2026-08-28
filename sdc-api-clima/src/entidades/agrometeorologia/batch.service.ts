import { Injectable, Logger } from '@nestjs/common';
import {
  esCultivoPerenne,
  ICoordenadas,
  IEstablecimiento,
  ISiembra,
} from 'modelos/src';
import { AGROMETEO_BATCH_SIZE } from '../../env';
import { AgrometeorologiaRepository } from './repository';
import { WeatherIngestionService } from './weather-ingestion.service';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';

interface IWeatherContextGroup {
  idEstablecimiento: string;
  idLote?: string;
  siembras: ISiembra[];
}

@Injectable()
export class AgrometeorologiaBatchService {
  private readonly logger = new Logger(AgrometeorologiaBatchService.name);
  private running = false;

  constructor(
    private repository: AgrometeorologiaRepository,
    private ingestion: WeatherIngestionService,
    private engine: AgrometeorologicalEngineService,
  ) {}

  async procesarActivas(): Promise<{
    siembras: number;
    procesadas: number;
    fallidas: number;
    establecimientos: number;
  }> {
    return await this.procesarConFiltro({});
  }

  async procesarEstablecimiento(idEstablecimiento: string) {
    return await this.procesarConFiltro({ idEstablecimiento });
  }

  async procesarSemilla(idSemilla: string) {
    return await this.procesarConFiltro({ idSemilla });
  }

  private async procesarConFiltro(
    extraFilter: Record<string, unknown>,
  ): Promise<{
    siembras: number;
    procesadas: number;
    fallidas: number;
    establecimientos: number;
  }> {
    if (this.running) {
      this.logger.warn('El lote agrometeorologico ya esta en ejecucion.');
      return { siembras: 0, procesadas: 0, fallidas: 0, establecimientos: 0 };
    }
    this.running = true;
    try {
      const list = await this.repository.getSiembras({
        filter: JSON.stringify({
          ...extraFilter,
          activa: { $ne: false },
        }),
        populate: 'lote establecimiento semilla crono',
        limit: 0,
      });
      const sowings = (list.datos || []).filter(
        (item) =>
          item._id &&
          item.fechaSiembra &&
          (!item.fechaCosecha ||
            esCultivoPerenne(item.semilla?.cultivo)) &&
          (item.idEstablecimiento || item.lote?.idEstablecimiento),
      );
      const groups = this.groupByWeatherContext(sowings);
      const establishmentIds = new Set(
        [...groups.values()].map((group) => group.idEstablecimiento),
      );
      const establishmentCache = new Map<string, IEstablecimiento>();
      let processed = 0;
      let failed = 0;
      for (const group of groups.values()) {
        const { idEstablecimiento, idLote, siembras: contextSowings } = group;
        try {
          const establishment =
            establishmentCache.get(idEstablecimiento) ||
            contextSowings.find((item) => item.establecimiento)
              ?.establecimiento ||
            (await this.repository.getEstablecimiento(idEstablecimiento));
          if (establishment?._id) {
            establishmentCache.set(idEstablecimiento, establishment);
          }
          const coordinates = this.resolveCoordinates(
            contextSowings,
            establishment,
          );
          if (!coordinates || !establishment?._id) {
            throw new Error('Establecimiento sin coordenadas validas.');
          }
          const earliest = contextSowings
            .map((item) => this.engine.resolveCycleStart(item))
            .sort()[0];
          const sync = await this.ingestion.sincronizar(
            establishment,
            coordinates,
            earliest,
            false,
            idLote,
            contextSowings.map((item) => String(item._id)),
          );
          if (!sync?.hasta) {
            throw new Error(
              'La sincronizacion meteorologica no informo un horizonte completo.',
            );
          }
          for (
            let index = 0;
            index < contextSowings.length;
            index += AGROMETEO_BATCH_SIZE
          ) {
            const slice = contextSowings.slice(
              index,
              index + AGROMETEO_BATCH_SIZE,
            );
            const settled = await Promise.allSettled(
              slice.map((item) =>
                this.engine.procesarSiembra(String(item._id), {
                  sincronizarClima: false,
                  expectedEndDate: sync.hasta,
                }),
              ),
            );
            settled.forEach((result, resultIndex) => {
              if (result.status === 'fulfilled') processed += 1;
              else {
                failed += 1;
                this.logger.error(
                  `Fallo siembra ${slice[resultIndex]._id}: ${result.reason}`,
                );
              }
            });
          }
        } catch (error) {
          failed += contextSowings.length;
          this.logger.error(
            `Fallo contexto meteorologico ${idEstablecimiento}/${idLote || 'sin-lote'}: ${error}`,
          );
        }
      }
      const result = {
        siembras: sowings.length,
        procesadas: processed,
        fallidas: failed,
        establecimientos: establishmentIds.size,
      };
      this.logger.log(
        JSON.stringify({ event: 'agromet_batch_complete', ...result }),
      );
      return result;
    } finally {
      this.running = false;
    }
  }

  private groupByWeatherContext(
    sowings: ISiembra[],
  ): Map<string, IWeatherContextGroup> {
    const groups = new Map<string, IWeatherContextGroup>();
    for (const sowing of sowings) {
      const idEstablecimiento = String(
        sowing.idEstablecimiento || sowing.lote?.idEstablecimiento || '',
      );
      if (!idEstablecimiento) continue;
      const idLote = String(sowing.idLote || sowing.lote?._id || '') || undefined;
      const coordinates = this.resolveSowingCoordinates(sowing);
      const spatialKey =
        idLote ||
        (coordinates
          ? `${coordinates.lat.toFixed(6)},${coordinates.lng.toFixed(6)}`
          : 'establecimiento');
      const key = `${idEstablecimiento}|${spatialKey}`;
      const current = groups.get(key);
      groups.set(key, {
        idEstablecimiento,
        ...(idLote ? { idLote } : {}),
        siembras: [...(current?.siembras || []), sowing],
      });
    }
    return groups;
  }

  private resolveCoordinates(
    group: ISiembra[],
    establishment: IEstablecimiento,
  ): ICoordenadas | undefined {
    for (const sowing of group) {
      const value = this.resolveSowingCoordinates(sowing);
      if (value && Number.isFinite(+value.lat) && Number.isFinite(+value.lng)) {
        return { lat: +value.lat, lng: +value.lng };
      }
    }
    const establishmentCoordinates = establishment.ubicacion?.find(
      (item) => item?.centro,
    )?.centro;
    return establishmentCoordinates &&
      Number.isFinite(+establishmentCoordinates.lat) &&
      Number.isFinite(+establishmentCoordinates.lng)
      ? {
          lat: +establishmentCoordinates.lat,
          lng: +establishmentCoordinates.lng,
        }
      : undefined;
  }

  private resolveSowingCoordinates(
    sowing: ISiembra,
  ): ICoordenadas | undefined {
    const value = sowing.lote?.ubicacion?.centro || sowing.coordenadas;
    return value && Number.isFinite(+value.lat) && Number.isFinite(+value.lng)
      ? { lat: +value.lat, lng: +value.lng }
      : undefined;
  }
}
