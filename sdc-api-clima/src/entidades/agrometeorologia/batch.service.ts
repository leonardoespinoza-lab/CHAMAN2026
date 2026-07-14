import { Injectable, Logger } from '@nestjs/common';
import { ICoordenadas, IEstablecimiento, ISiembra } from 'modelos/src';
import { AGROMETEO_BATCH_SIZE } from '../../env';
import { AgrometeorologiaRepository } from './repository';
import { WeatherIngestionService } from './weather-ingestion.service';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';

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
          $or: [{ fechaCosecha: { $exists: false } }, { fechaCosecha: null }],
        }),
        populate: 'lote establecimiento semilla crono',
        limit: 0,
      });
      const sowings = (list.datos || []).filter(
        (item) =>
          item._id &&
          item.fechaSiembra &&
          (item.idEstablecimiento || item.lote?.idEstablecimiento),
      );
      const groups = this.groupByEstablishment(sowings);
      let processed = 0;
      let failed = 0;
      for (const [idEstablecimiento, group] of groups) {
        try {
          const establishment =
            group.find((item) => item.establecimiento)?.establecimiento ||
            (await this.repository.getEstablecimiento(idEstablecimiento));
          const coordinates = this.resolveCoordinates(group, establishment);
          if (!coordinates || !establishment?._id) {
            throw new Error('Establecimiento sin coordenadas validas.');
          }
          const earliest = group
            .map((item) => String(item.fechaSiembra).slice(0, 10))
            .sort()[0];
          await this.ingestion.sincronizar(
            establishment,
            coordinates,
            earliest,
            false,
          );
          for (
            let index = 0;
            index < group.length;
            index += AGROMETEO_BATCH_SIZE
          ) {
            const slice = group.slice(index, index + AGROMETEO_BATCH_SIZE);
            const settled = await Promise.allSettled(
              slice.map((item) =>
                this.engine.procesarSiembra(String(item._id), {
                  sincronizarClima: false,
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
          failed += group.length;
          this.logger.error(
            `Fallo establecimiento ${idEstablecimiento}: ${error}`,
          );
        }
      }
      const result = {
        siembras: sowings.length,
        procesadas: processed,
        fallidas: failed,
        establecimientos: groups.size,
      };
      this.logger.log(
        JSON.stringify({ event: 'agromet_batch_complete', ...result }),
      );
      return result;
    } finally {
      this.running = false;
    }
  }

  private groupByEstablishment(sowings: ISiembra[]): Map<string, ISiembra[]> {
    const groups = new Map<string, ISiembra[]>();
    for (const sowing of sowings) {
      const id = String(
        sowing.idEstablecimiento || sowing.lote?.idEstablecimiento || '',
      );
      if (!id) continue;
      groups.set(id, [...(groups.get(id) || []), sowing]);
    }
    return groups;
  }

  private resolveCoordinates(
    group: ISiembra[],
    establishment: IEstablecimiento,
  ): ICoordenadas | undefined {
    for (const sowing of group) {
      const value =
        sowing.lote?.ubicacion?.centro ||
        sowing.coordenadas ||
        establishment.ubicacion?.find((item) => item?.centro)?.centro;
      if (value && Number.isFinite(+value.lat) && Number.isFinite(+value.lng)) {
        return { lat: +value.lat, lng: +value.lng };
      }
    }
    return undefined;
  }
}
