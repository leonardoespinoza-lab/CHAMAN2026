import { LotLocationService } from './service';

describe('LotLocationService idempotency', () => {
  const lot = {
    _id: 'lot-1',
    ubicacion: {
      geojson: {
        type: 'Polygon',
        coordinates: [
          [
            [-61.98, -32.82],
            [-61.94, -32.82],
            [-61.94, -32.79],
            [-61.98, -32.79],
            [-61.98, -32.82],
          ],
        ],
      },
    },
  };

  function createModel() {
    return {
      findById: jest.fn(() => ({
        populate: jest.fn(() => ({ lean: jest.fn(async () => lot) })),
      })),
    } as any;
  }

  it('reutiliza una resolucion lista para la misma geometria, fuente y motor', async () => {
    const existing = {
      loteId: 'lot-1',
      resolutionKey: 'existing-key',
      geometryHash: 'geometry-hash',
      snapshotId: 'snapshot-1',
      sourceVersion: 'source-1',
      resolverVersion: 'lot-location-v1.0.0',
      estado: 'ready',
      confianza: 'alta',
      isCurrent: true,
    };
    const repository: any = {
      getActiveSnapshot: jest.fn(async () => ({
        snapshotId: 'snapshot-1',
        sourceVersion: 'source-1',
      })),
      getByResolutionKey: jest.fn(async () => existing),
      makeCurrent: jest.fn(async () => undefined),
      getCurrentLocation: jest.fn(async () => existing),
      getIntersections: jest.fn(async () => []),
    };
    const normalizer: any = {
      normalize: jest.fn(() => ({ geometryHash: 'geometry-hash' })),
    };
    const resolver: any = { resolve: jest.fn() };
    const service = new LotLocationService(
      createModel(),
      repository,
      normalizer,
      resolver,
    );

    const first = await service.requestResolution('lot-1', 'geometry_changed');
    const second = await service.requestResolution('lot-1', 'geometry_changed');

    expect(first.estado).toBe('ready');
    expect(second.estado).toBe('ready');
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(repository.makeCurrent).toHaveBeenCalledTimes(2);
  });

  it('persiste source_unavailable sin consultar internet durante la lectura', async () => {
    const repository: any = {
      getActiveSnapshot: jest.fn(async () => null),
      prepareLocation: jest.fn(async (value) => value),
    };
    const normalizer: any = {
      normalize: jest.fn(() => ({
        geometryHash: 'geometry-hash',
        warnings: [],
      })),
    };
    const service = new LotLocationService(
      createModel(),
      repository,
      normalizer,
      {} as any,
    );
    const result = await service.requestResolution('lot-1', 'lot_created');
    expect(result.estado).toBe('source_unavailable');
    expect(repository.prepareLocation).toHaveBeenCalledTimes(1);
  });
});
