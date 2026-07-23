import { Injectable, Logger } from '@nestjs/common';
import { IPermiso } from 'modelos/src';
import { EstablecimientosRepository } from '../../entidades/establecimiento/repository';
import { ProductorsRepository } from '../../entidades/productor/repository';

interface AdvisorScopeCacheEntry {
  expiresAt: number;
  producerIds: string[];
  establishmentIds: string[];
}

@Injectable()
export class AdvisorScopeService {
  private readonly logger = new Logger(AdvisorScopeService.name);
  private readonly cache = new Map<string, AdvisorScopeCacheEntry>();
  private readonly ttlMs = 5000;

  constructor(
    private readonly establecimientos: EstablecimientosRepository,
    private readonly productores: ProductorsRepository,
  ) {}

  async enrichPermission(
    permiso: IPermiso | undefined,
    userId: string | undefined,
  ): Promise<void> {
    if (permiso?.nivel !== 'Asesor' || !userId) return;

    const idAsesor = String(userId);
    permiso.idAsesor = idAsesor;
    // El Asesor administra productores y observa toda su red aguas abajo.
    // No es propietario operativo de establecimientos ni lotes.
    permiso.idLotes = [];
    const establecimientosAsignados = permiso.idTenant
      ? await this.getTenantAssignedEstablishments(
          permiso.idEstablecimientos || [],
          permiso.idTenant,
        )
      : permiso.idEstablecimientos || [];
    const scope = await this.getOwnedScope(idAsesor, permiso.idTenant);
    permiso.idProductores = scope.producerIds;
    permiso.idEstablecimientos = this.unique([
      ...establecimientosAsignados,
      ...scope.establishmentIds,
    ]);
  }

  registerOwnedEstablishment(
    permiso: IPermiso,
    idEstablecimiento: string,
  ): void {
    if (permiso.nivel !== 'Asesor' || !permiso.idAsesor || !idEstablecimiento) {
      return;
    }
    permiso.idEstablecimientos = this.unique([
      ...(permiso.idEstablecimientos || []),
      String(idEstablecimiento),
    ]);
    const cacheKey = this.scopeCacheKey(
      String(permiso.idAsesor),
      permiso.idTenant,
    );
    const current = this.cache.get(cacheKey);
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + this.ttlMs,
      producerIds: current?.producerIds || [],
      establishmentIds: this.unique([
        ...(current?.establishmentIds || []),
        String(idEstablecimiento),
      ]),
    });
  }

  registerOwnedProducer(permiso: IPermiso, idProductor: string): void {
    if (permiso.nivel !== 'Asesor' || !permiso.idAsesor || !idProductor) {
      return;
    }
    permiso.idProductores = this.unique([
      ...(permiso.idProductores || []),
      String(idProductor),
    ]);
    const cacheKey = this.scopeCacheKey(
      String(permiso.idAsesor),
      permiso.idTenant,
    );
    const current = this.cache.get(cacheKey);
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + this.ttlMs,
      producerIds: this.unique([
        ...(current?.producerIds || []),
        String(idProductor),
      ]),
      establishmentIds: current?.establishmentIds || [],
    });
  }

  removeOwnedProducer(permiso: IPermiso, idProductor: string): void {
    if (permiso.nivel !== 'Asesor' || !permiso.idAsesor) return;
    const removed = String(idProductor);
    permiso.idProductores = (permiso.idProductores || []).filter(
      (id) => String(id) !== removed,
    );
    const current = this.cache.get(
      this.scopeCacheKey(String(permiso.idAsesor), permiso.idTenant),
    );
    if (current) {
      current.producerIds = current.producerIds.filter((id) => id !== removed);
      current.expiresAt = Date.now() + this.ttlMs;
    }
  }

  removeOwnedEstablishment(permiso: IPermiso, idEstablecimiento: string): void {
    if (permiso.nivel !== 'Asesor' || !permiso.idAsesor) return;
    const removed = String(idEstablecimiento);
    permiso.idEstablecimientos = (permiso.idEstablecimientos || []).filter(
      (id) => String(id) !== removed,
    );
    const current = this.cache.get(
      this.scopeCacheKey(String(permiso.idAsesor), permiso.idTenant),
    );
    if (current) {
      current.establishmentIds = current.establishmentIds.filter(
        (id) => id !== removed,
      );
      current.expiresAt = Date.now() + this.ttlMs;
    }
  }

  private async getOwnedScope(
    idAsesor: string,
    idTenant?: string,
  ): Promise<{
    producerIds: string[];
    establishmentIds: string[];
  }> {
    const cacheKey = this.scopeCacheKey(idAsesor, idTenant);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        producerIds: cached.producerIds,
        establishmentIds: cached.establishmentIds,
      };
    }

    try {
      const productores = await this.productores.get({
        page: 0,
        limit: 0,
        select: '_id',
        filter: JSON.stringify({
          idAsesorPropietario: idAsesor,
          ...(idTenant ? { idTenant } : {}),
        }),
      });
      const producerIds = this.unique(
        (productores?.datos || []).map((item) => String(item._id || '')),
      );
      const establecimientos = await this.establecimientos.get({
        page: 0,
        limit: 0,
        select: '_id',
        filter: JSON.stringify({
          ...(idTenant ? { idTenant } : {}),
          $or: [
            { idAsesorPropietario: idAsesor },
            ...(producerIds.length
              ? [{ idProductor: { $in: producerIds } }]
              : []),
          ],
        }),
      });
      const establishmentIds = this.unique(
        (establecimientos?.datos || []).map((item) => String(item._id || '')),
      );
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + this.ttlMs,
        producerIds,
        establishmentIds,
      });
      return { producerIds, establishmentIds };
    } catch (error) {
      this.logger.warn(
        `No se pudo consolidar el alcance propio del asesor ${idAsesor}; se conserva solo el alcance asignado.`,
      );
      return { producerIds: [], establishmentIds: [] };
    }
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values.map(String).filter(Boolean)));
  }

  private async getTenantAssignedEstablishments(
    ids: string[],
    idTenant: string,
  ): Promise<string[]> {
    const assignedIds = this.unique(ids);
    if (!assignedIds.length) return [];

    try {
      const establecimientos = await this.establecimientos.get({
        page: 0,
        limit: 0,
        select: '_id',
        filter: JSON.stringify({
          _id: { $in: assignedIds },
          idTenant: String(idTenant),
        }),
      });
      return this.unique(
        (establecimientos?.datos || []).map((item) => String(item._id || '')),
      );
    } catch (error) {
      this.logger.warn(
        `No se pudieron validar las asignaciones del asesor para el tenant ${idTenant}; se descartan para mantener el aislamiento.`,
      );
      return [];
    }
  }

  private scopeCacheKey(idAsesor: string, idTenant?: string): string {
    return `${String(idAsesor)}::${String(idTenant || 'sin-tenant')}`;
  }
}
