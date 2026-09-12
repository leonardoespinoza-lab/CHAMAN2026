import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ISiembra, IQueryParam, esCultivoPerenne } from 'modelos/src';
import { ProductorsRepository } from '../entidades/productor/repository';
import { EstablecimientosRepository } from '../entidades/establecimiento/repository';
import { LotesRepository } from '../entidades/lote/repository';
import { SiembrasRepository } from '../entidades/siembra/repository';
import { ProductorsService } from '../entidades/productor/service';
import { EstablecimientosService } from '../entidades/establecimiento/service';
import { LotesService } from '../entidades/lote/service';
import { SiembrasService } from '../entidades/siembra/service';
import { SemillasService } from '../entidades/semilla/service';
import {
  IntegrationContext,
  ResourceType,
  resourceId,
  normalizeBody,
  externalId,
} from './contract';
import { IntegrationRuntime } from './runtime';
import { projectPhenology } from './phenology';
import { DecisionPipelineQueueService } from '../auxiliares/decision-pipeline/decision-pipeline-queue.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private producers: ProductorsService,
    private farms: EstablecimientosService,
    private lots: LotesService,
    private sowings: SiembrasService,
    private seeds: SemillasService,
    private producerRepository: ProductorsRepository,
    private farmRepository: EstablecimientosRepository,
    private lotRepository: LotesRepository,
    private sowingRepository: SiembrasRepository,
    private runtime: IntegrationRuntime,
    private decisions: DecisionPipelineQueueService,
  ) {}

  private repository(kind: ResourceType): {
    getById(id: string): Promise<any>;
    get(params: IQueryParam): Promise<{ totalCount: number; datos: any[] }>;
  } {
    return {
      productores: this.producerRepository,
      establecimientos: this.farmRepository,
      lotes: this.lotRepository,
      siembras: this.sowingRepository,
    }[kind];
  }
  private async raw(kind: ResourceType, id: string): Promise<any | undefined> {
    try {
      return await this.repository(kind).getById(id);
    } catch (error) {
      if ((error?.getStatus?.() || error?.status) === 404) return undefined;
      throw new ServiceUnavailableException(
        'No se pudo consultar el recurso. Reintentar sin cambiar idExterno.',
      );
    }
  }
  private async assertOwned(
    kind: ResourceType,
    entity: any,
    ctx: IntegrationContext,
  ): Promise<void> {
    if (!entity || entity.archivado)
      throw new NotFoundException(
        'Recurso no disponible para esta integración.',
      );
    if (kind === 'productores') {
      if (
        String(entity.idAsesorPropietario || '') !== ctx.client.advisorUserId ||
        String(entity.idTenant || '') !== String(ctx.permission.idTenant || '')
      )
        throw new NotFoundException(
          'Recurso no disponible para esta integración.',
        );
      return;
    }
    const parentKind =
      kind === 'establecimientos'
        ? 'productores'
        : kind === 'lotes'
          ? 'establecimientos'
          : 'lotes';
    const parentId =
      kind === 'establecimientos'
        ? entity.idProductor
        : kind === 'lotes'
          ? entity.idEstablecimiento
          : entity.idLote;
    if (!/^[a-f0-9]{24}$/.test(String(parentId)))
      throw new NotFoundException('Recurso sin vinculación válida.');
    await this.assertOwned(
      parentKind,
      await this.raw(parentKind, String(parentId)),
      ctx,
    );
  }
  private async own(kind: ResourceType, id: string, ctx: IntegrationContext) {
    const entity = await this.raw(kind, resourceId(ctx.client, kind, id));
    await this.assertOwned(kind, entity, ctx);
    return entity;
  }
  private view(kind: ResourceType, id: string, entity: any) {
    return {
      tipo: kind,
      idExterno: id,
      estado: entity.archivado ? 'archivado' : 'registrado',
      ...(kind !== 'siembras'
        ? { nombre: entity.nombre }
        : {
            fechaSiembra: String(entity.fechaSiembra).slice(0, 10),
            activa: entity.activa === true,
          }),
    };
  }
  async get(kind: ResourceType, id: string, ctx: IntegrationContext) {
    return this.view(kind, id, await this.own(kind, externalId(id), ctx));
  }
  async create(
    kind: ResourceType,
    id: string,
    input: unknown,
    ctx: IntegrationContext,
  ) {
    externalId(id);
    const body = normalizeBody(kind, input);
    const internalId = resourceId(ctx.client, kind, id);
    // Serialize writes per integration. Deterministic persisted _id remains the
    // duplicate-prevention boundary even after a restart or an expired Redis lease.
    return this.runtime.exclusive(ctx.client.id, async (assertHeld) => {
      const data: any = { _id: internalId };
      if (kind !== 'siembras') data.nombre = body.nombre;
      if (kind === 'establecimientos') {
        data.idProductor = (
          await this.own('productores', body.productorIdExterno, ctx)
        )._id;
      } else if (kind === 'lotes') {
        data.idEstablecimiento = (
          await this.own('establecimientos', body.establecimientoIdExterno, ctx)
        )._id;
        // A point is a real declared point, never a fabricated field polygon.
        data.ubicacion = {
          centro: body.ubicacion,
          superficie: body.superficieHa,
        };
      } else if (kind === 'siembras') {
        data.idLote = (await this.own('lotes', body.loteIdExterno, ctx))._id;
        let seed;
        try {
          seed = await this.seeds.getById(body.idSemilla);
        } catch (error) {
          if (error?.getStatus?.() === 404)
            throw new BadRequestException('Semilla no disponible.');
          throw new ServiceUnavailableException(
            'No se pudo verificar la semilla.',
          );
        }
        if (!seed?._id || (seed as any).archivado)
          throw new BadRequestException('Semilla no disponible.');
        if (esCultivoPerenne(seed.cultivo))
          throw new BadRequestException(
            'La implantación de perennes requiere un contrato específico, no una siembra anual.',
          );
        data.idSemilla = body.idSemilla;
        data.fechaSiembra = body.fechaSiembra + 'T12:00:00.000Z';
        data.activa = true;
      }
      const matches = (entity: any) => {
        if (kind !== 'siembras' && entity.nombre !== data.nombre) return false;
        if (kind === 'establecimientos')
          return String(entity.idProductor) === String(data.idProductor);
        if (kind === 'lotes')
          return (
            String(entity.idEstablecimiento) ===
              String(data.idEstablecimiento) &&
            entity.ubicacion?.centro?.lat === data.ubicacion.centro.lat &&
            entity.ubicacion?.centro?.lng === data.ubicacion.centro.lng &&
            entity.ubicacion?.superficie === data.ubicacion.superficie
          );
        if (kind === 'siembras')
          return (
            String(entity.idLote) === String(data.idLote) &&
            String(entity.idSemilla) === data.idSemilla &&
            String(entity.fechaSiembra).slice(0, 10) === body.fechaSiembra
          );
        return true;
      };
      const replay = async (entity: any) => {
        await this.assertOwned(kind, entity, ctx);
        if (!matches(entity))
          throw new ConflictException(
            'idExterno ya registrado con otros datos. No se sobrescribió el recurso.',
          );
        if (kind === 'siembras' && entity.activa === true) {
          await assertHeld();
          await this.reconcileSowing(entity, ctx, true);
        }
        return { ...this.view(kind, id, entity), creado: false };
      };
      const existing = await this.raw(kind, internalId);
      if (existing) return replay(existing);
      await this.assertCapacity(kind, body, ctx);
      if (kind === 'siembras') {
        const active = await this.sowingRepository.get({
          limit: 1,
          filter: JSON.stringify({ idLote: data.idLote, activa: true }),
        });
        if (active.datos.length)
          throw new ConflictException(
            'El lote ya tiene una siembra activa. Debe cerrarse desde Chamán antes de iniciar otra campaña.',
          );
      }
      await assertHeld();
      try {
        const created =
          kind === 'productores'
            ? await this.producers.create(data, ctx.permission, ctx.license)
            : kind === 'establecimientos'
              ? await this.farms.create(data, ctx.permission)
              : kind === 'lotes'
                ? await this.lots.create(data, ctx.permission)
                : await this.sowings.create(data, ctx.permission);
        if (String(created?._id) !== internalId)
          throw new ServiceUnavailableException(
            'El recurso no conservó su identificador de integración.',
          );
        await this.assertOwned(kind, created, ctx);
        if (kind === 'siembras') {
          await assertHeld();
          await this.reconcileSowing(created, ctx, false);
        }
        return { ...this.view(kind, id, created), creado: true };
      } catch (error) {
        const recovered = await this.raw(kind, internalId);
        if (recovered) return replay(recovered);
        if (/E11000|duplicate key/i.test(String(error?.message || '')))
          throw new ConflictException(
            'Existe un recurso con ese nombre en la misma cartera. Usar un nombre distintivo, sin cambiar el idExterno de un alta confirmada.',
          );
        if ([400, 403, 409].includes(error?.getStatus?.())) throw error;
        throw new ServiceUnavailableException(
          'Alta no confirmada. Reintentar el mismo idExterno y los mismos datos.',
        );
      }
    });
  }
  private async assertCapacity(
    kind: ResourceType,
    body: Record<string, any>,
    ctx: IntegrationContext,
  ): Promise<void> {
    if (kind === 'siembras') {
      const days = ctx.client.maxSowingAgeDays;
      if (
        days !== undefined &&
        body.fechaSiembra <
          new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      )
        throw new BadRequestException(
          'La fecha de siembra supera la antigüedad habilitada para esta integración. Solicitar revisión del histórico.',
        );
      return;
    }
    const limit = ctx.client.limits?.[kind];
    if (limit === undefined) return; // Existing sandbox clients only; live registry requires limits.
    let count: number;
    try {
      // Include manual creations in this dedicated advisor portfolio too. Do not
      // count other advisors, fetch whole documents or trust client-supplied usage.
      const result = await this.repository(kind).get({
        page: 0,
        limit: 1,
        select: '_id',
        filter: JSON.stringify({
          idAsesorPropietario: ctx.client.advisorUserId,
          archivado: { $ne: true },
        }),
      });
      count = result.totalCount;
      if (!Number.isSafeInteger(count) || count < 0) throw Error();
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo verificar el cupo de la integración. No se realizó el alta.',
      );
    }
    if (count >= limit)
      throw new ForbiddenException(
        `Cupo de ${kind} alcanzado (${limit}). Solicitar ampliación a Chamán; las consultas y confirmaciones siguen disponibles.`,
      );
  }
  private async reconcileSowing(
    sowing: ISiembra,
    ctx: IntegrationContext,
    retry: boolean,
  ) {
    try {
      const lot = await this.raw('lotes', String(sowing.idLote));
      await this.assertOwned('lotes', lot, ctx);
      const active = await this.sowingRepository.get({
        limit: 2,
        filter: JSON.stringify({ idLote: sowing.idLote, activa: true }),
      });
      if (active.datos.some((item) => String(item._id) !== String(sowing._id)))
        throw new ConflictException(
          'El lote tiene otra siembra activa. Revisar desde Chamán antes de continuar.',
        );
      if (String(lot.idSiembra || '') !== String(sowing._id))
        await this.lots.update(
          String(sowing.idLote),
          { idSiembra: sowing._id },
          ctx.permission,
        );
      // Repair a persisted sowing whose original request stopped before queueing.
      // A stable operation ID deduplicates retries in the existing durable queue.
      if (retry)
        await this.decisions.enqueueForSowing(String(sowing._id), {
          trigger: 'reconciliation',
          operationId: `integration-init-${sowing._id}`,
          changedFields: ['fechaSiembra', 'idSemilla'],
          sincronizarClima: true,
          forceClimateBackfill: true,
        });
    } catch (error) {
      if (error?.getStatus?.() === 409) throw error;
      throw new ServiceUnavailableException(
        'Siembra registrada; procesamiento no confirmado. Reintentar el mismo idExterno y los mismos datos.',
      );
    }
  }
  async catalog(crop?: string, page = 0) {
    if (
      crop !== undefined &&
      (typeof crop !== 'string' ||
        crop.length > 50 ||
        !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ -]+$/.test(crop))
    )
      throw new BadRequestException('cultivo inválido.');
    if (!Number.isInteger(page) || page < 0 || page > 10000)
      throw new BadRequestException('pagina inválida.');
    let list;
    try {
      list = await this.seeds.get({
        page,
        limit: 100,
        sort: '_id',
        filter: JSON.stringify(crop ? { cultivo: crop } : {}),
        select: '_id cultivo variedad ciclo semillero',
      });
    } catch {
      throw new ServiceUnavailableException(
        'Catálogo temporalmente no disponible.',
      );
    }
    return {
      pagina: page,
      limite: 100,
      datos: list.datos.map((seed) => ({
        idSemilla: seed._id,
        cultivo: seed.cultivo,
        variedad: seed.variedad,
        ciclo: seed.ciclo,
        semillero: seed.semillero,
      })),
      siguientePagina: list.datos.length === 100 ? page + 1 : null,
    };
  }
  async phenology(id: string, ctx: IntegrationContext) {
    const sowing: ISiembra = await this.own('siembras', id, ctx);
    // Read the current server result on each request; do not send raw weather,
    // crop model parameters, database documents, or browser-only calculations.
    let snapshot;
    try {
      snapshot = await this.sowings.agrometeorologia(
        String(sowing._id),
        undefined,
        undefined,
        false,
        ctx.permission,
      );
    } catch {
      throw new ServiceUnavailableException(
        'El resultado fenológico no está disponible temporalmente. Conservar el último resultado y reintentar.',
      );
    }
    return projectPhenology(id, sowing, snapshot);
  }
}
