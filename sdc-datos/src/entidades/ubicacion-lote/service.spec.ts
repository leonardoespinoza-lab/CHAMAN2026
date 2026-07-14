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
      updateOne: jest.fn(async () => undefined),
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

  it('sincroniza el departamento operativo solo con coincidencia oficial exacta y confianza alta', async () => {
    const lotWithLegacy = {
      ...lot,
      idDepartamento: 'old-department',
      departamento: {
        nombre: 'Referencia anterior',
        provincia: { nombre: 'Cordoba' },
      },
    };
    const lotModel = {
      findById: jest.fn(() => ({
        populate: jest.fn(() => ({ lean: jest.fn(async () => lotWithLegacy) })),
      })),
      updateOne: jest.fn(async () => undefined),
    } as any;
    const current = {
      loteId: 'lot-1',
      resolutionKey: 'resolution-1',
      estado: 'ready',
      confianza: 'alta',
    };
    const repository: any = {
      getActiveSnapshot: jest.fn(async () => ({
        snapshotId: 'snapshot-1',
        sourceVersion: 'source-1',
      })),
      getByResolutionKey: jest.fn(async () => null),
      prepareLocation: jest.fn(async (value) => value),
      saveLocation: jest.fn(async () => undefined),
      replaceIntersections: jest.fn(async () => undefined),
      getCurrentLocation: jest.fn(async () => current),
      getIntersections: jest.fn(async () => []),
    };
    const normalizer: any = {
      normalize: jest.fn(() => ({
        geometryHash: 'geometry-hash',
        geometry: { type: 'Polygon', coordinates: [] },
        representativePoint: { type: 'Point', coordinates: [-63.92, -31.59] },
        areaM2: 1000,
        warnings: [],
      })),
    };
    const resolver: any = {
      resolve: jest.fn(async () => ({
        location: {
          estado: 'ready',
          confianza: 'alta',
          coberturaPorcentaje: 100,
          provincia: { nombre: 'Cordoba' },
          nivelAdministrativo2: { nombre: 'Rio Segundo' },
          conflictoManual: {
            existe: true,
            departamentoManualId: 'old-department',
            departamentoManual: 'Referencia anterior',
          },
          advertencias: [
            'La ubicacion manual no coincide con GeoRef. No fue sobrescrita.',
          ],
        },
        intersections: [],
      })),
    };
    const departments: any = {
      find: jest.fn(() => ({
        populate: jest.fn(() => ({
          lean: jest.fn(async () => [
            {
              _id: 'official-department',
              nombre: 'Río Segundo',
              provincia: { nombre: 'Córdoba' },
            },
          ]),
        })),
      })),
    };
    const service = new LotLocationService(
      lotModel,
      repository,
      normalizer,
      resolver,
      departments,
    );

    await service.requestResolution('lot-1', 'geometry_changed', {
      immediate: true,
    });

    expect(lotModel.updateOne).toHaveBeenCalledWith(
      { _id: 'lot-1' },
      {
        $set: expect.objectContaining({
          idDepartamento: 'official-department',
          ubicacionDepartamentoLegado: expect.objectContaining({
            idDepartamento: 'old-department',
            nombre: 'Referencia anterior',
          }),
        }),
      },
    );
    expect(repository.saveLocation).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        conflictoManual: expect.objectContaining({ existe: false }),
        advertencias: [],
      }),
    );
  });
});
