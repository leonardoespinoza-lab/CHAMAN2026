import { GeorefCatalogSyncService } from './georef-sync.service';

describe('GeorefCatalogSyncService', () => {
  const service = new GeorefCatalogSyncService({} as any);
  const normalize = (geometry: { type: string; coordinates: unknown }) =>
    (service as any).normalizeSourceGeometry(geometry);

  it('descarta anillos oficiales degenerados sin invalidar el poligono util', () => {
    const result = normalize({
      type: 'Polygon',
      coordinates: [
        [
          [-62, -33],
          [-61, -33],
          [-61, -32],
          [-62, -32],
          [-62, -33],
        ],
        [
          [-61.5, -32.5],
          [-61.5, -32.5],
          [-61.5, -32.5],
        ],
      ],
    });

    expect(result.geometry.type).toBe('Polygon');
    expect(result.repaired).toBe(true);
    expect(result.removedRings).toBe(1);
    expect(result.removedPolygons).toBe(0);
  });

  it('promueve un anillo no contenido a una parte auditable de MultiPolygon', () => {
    const result = normalize({
      type: 'Polygon',
      coordinates: [
        [
          [-62, -33],
          [-61, -33],
          [-61, -32],
          [-62, -32],
          [-62, -33],
        ],
        [
          [-60, -31],
          [-59.8, -31],
          [-59.8, -30.8],
          [-60, -30.8],
          [-60, -31],
        ],
      ],
    });

    expect(result.geometry.type).toBe('MultiPolygon');
    expect(result.geometry.coordinates).toHaveLength(2);
    expect(result.repaired).toBe(true);
    expect(result.promotedRings).toBe(1);
  });

  it('respeta el lock distribuido y reutiliza el snapshot activo de otra replica', async () => {
    const repository = {
      acquireSyncLock: jest.fn(async () => false),
      getActiveSnapshot: jest.fn(async () => ({
        snapshotId: 'snapshot-activo',
        sourceVersion: 'fuente-1',
        resources: [{ resource: 'provincias', count: 24 }],
      })),
    } as any;
    const lockedService = new GeorefCatalogSyncService(repository);

    await expect(lockedService.sync()).resolves.toEqual({
      activated: false,
      snapshotId: 'snapshot-activo',
      sourceVersion: 'fuente-1',
      counts: { provincias: 24 },
    });
    expect(repository.acquireSyncLock).toHaveBeenCalledTimes(1);
  });

  it('libera el lock distribuido aun cuando la sincronizacion falla', async () => {
    const repository = {
      acquireSyncLock: jest.fn(async () => true),
      releaseSyncLock: jest.fn(async () => undefined),
    } as any;
    const lockedService = new GeorefCatalogSyncService(repository);
    jest
      .spyOn(lockedService as any, 'execute')
      .mockRejectedValueOnce(new Error('fuente no disponible'));

    await expect(lockedService.sync()).rejects.toThrow('fuente no disponible');
    expect(repository.releaseSyncLock).toHaveBeenCalledTimes(1);
  });

  it('conserva el ultimo snapshot valido si la fuente remota falla', async () => {
    const repository = {
      getActiveSnapshot: jest.fn(async () => ({
        snapshotId: 'snapshot-validado',
        sourceVersion: 'fuente-estable',
        resources: [
          { resource: 'provincias', count: 24 },
          { resource: 'departamentos', count: 529 },
        ],
      })),
    } as any;
    const fallbackService = new GeorefCatalogSyncService(repository);
    jest
      .spyOn(fallbackService as any, 'download')
      .mockRejectedValue(new Error('unable to verify the first certificate'));

    await expect((fallbackService as any).execute(false)).resolves.toEqual({
      activated: false,
      snapshotId: 'snapshot-validado',
      sourceVersion: 'fuente-estable',
      counts: { provincias: 24, departamentos: 529 },
    });
  });

  it('no oculta el fallo remoto durante una sincronizacion forzada', async () => {
    const repository = {
      getActiveSnapshot: jest.fn(async () => ({
        snapshotId: 'snapshot-validado',
        sourceVersion: 'fuente-estable',
        resources: [{ resource: 'provincias', count: 24 }],
      })),
    } as any;
    const forcedService = new GeorefCatalogSyncService(repository);
    jest
      .spyOn(forcedService as any, 'download')
      .mockRejectedValue(new Error('fuente no disponible'));

    await expect((forcedService as any).execute(true)).rejects.toThrow(
      'fuente no disponible',
    );
  });
});
