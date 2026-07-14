import { EstablishmentLocationService } from './establishment-location.service';

describe('EstablishmentLocationService', () => {
  const establishment = {
    _id: 'establishment-1',
    ubicacion: [
      {
        geojson: {
          type: 'Polygon',
          coordinates: [
            [
              [-63.94, -31.61],
              [-63.90, -31.61],
              [-63.90, -31.58],
              [-63.94, -31.58],
              [-63.94, -31.61],
            ],
          ],
        },
      },
    ],
    ubicacionAdministrativa: {
      localidad: 'Referencia manual anterior',
      provincia: 'Cordoba',
    },
  };

  function establishmentModel() {
    return {
      findById: jest.fn(() => ({
        lean: jest.fn(async () => establishment),
        select: jest.fn(() => ({ lean: jest.fn(async () => establishment) })),
      })),
      updateOne: jest.fn(async () => undefined),
    } as any;
  }

  it('resuelve desde el poligono final y preserva la referencia manual como legado', async () => {
    const establishments = establishmentModel();
    const history = {
      findOneAndUpdate: jest.fn(async () => undefined),
    } as any;
    const repository = {
      getActiveSnapshot: jest.fn(async () => ({
        snapshotId: 'snapshot-1',
        sourceVersion: 'source-1',
      })),
    } as any;
    const normalizer = {
      normalize: jest.fn(() => ({
        geometry: { type: 'MultiPolygon', coordinates: [] },
        geometryHash: 'geometry-hash',
        areaM2: 1000,
        representativePoint: {
          type: 'Point',
          coordinates: [-63.92, -31.595],
        },
        warnings: [],
      })),
    } as any;
    const resolver = {
      resolve: jest.fn(async () => ({
        location: {
          estado: 'ready',
          confianza: 'alta',
          provincia: { id: '14', nombre: 'Cordoba' },
          nivelAdministrativo2: {
            id: '14070',
            nombre: 'Rio Segundo',
            tipo: 'Departamento',
          },
          coberturaPorcentaje: 100,
        },
        intersections: [],
      })),
    } as any;
    const service = new EstablishmentLocationService(
      establishments,
      history,
      repository,
      normalizer,
      resolver,
    );

    const result = await service.requestResolution(
      'establishment-1',
      'geometry_changed',
    );

    expect(result.estado).toBe('ready');
    expect(result.nivelAdministrativo2?.nombre).toBe('Rio Segundo');
    expect(normalizer.normalize).toHaveBeenCalledWith(
      expect.objectContaining({
        geojson: expect.objectContaining({ type: 'MultiPolygon' }),
      }),
    );
    expect(establishments.updateOne).toHaveBeenLastCalledWith(
      { _id: 'establishment-1' },
      {
        $set: expect.objectContaining({
          ubicacionOficial: expect.objectContaining({ estado: 'ready' }),
          ubicacionAdministrativaLegada: expect.objectContaining({
            soloLectura: true,
            valor: establishment.ubicacionAdministrativa,
          }),
        }),
      },
    );
    expect(history.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('marca fuente no disponible sin usar la busqueda orientativa como dato oficial', async () => {
    const establishments = establishmentModel();
    const service = new EstablishmentLocationService(
      establishments,
      {} as any,
      { getActiveSnapshot: jest.fn(async () => null) } as any,
      {
        normalize: jest.fn(() => ({
          geometryHash: 'geometry-hash',
          warnings: [],
        })),
      } as any,
      {} as any,
    );
    const result = await service.requestResolution(
      'establishment-1',
      'establishment_created',
    );
    expect(result.estado).toBe('source_unavailable');
    expect((result as any).localidadReferencia).toBeUndefined();
  });
});
