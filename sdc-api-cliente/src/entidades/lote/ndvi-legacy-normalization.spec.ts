import { LotesService } from './service';

describe('LotesService normalizacion satelital legacy', () => {
  const legacy = (
    id: string,
    date: string,
    collection = 'sentinel-2-l2a',
  ) => ({
    _id: id,
    idLote: 'lote-1',
    fechaDeLaImagen: date,
    coleccion: collection,
    metadataImagen: { renderVersion: 'legacy-v2' },
  });

  const fixed = (date: string) => ({
    _id: 'fixed-1',
    idLote: 'lote-1',
    fechaDeLaImagen: date,
    coleccion: 'sentinel-2-l2a',
    metadataImagen: { renderVersion: 'fixed-index-v3' },
  });

  const createSubject = () => {
    const service = Object.create(LotesService.prototype) as any;
    service.reportesNDVIsService = { get: jest.fn() };
    service.repository = { getById: jest.fn() };
    service.ndviQueue = { enqueueLote: jest.fn() };
    service.logger = { error: jest.fn() };
    return service;
  };

  it('omite todos los legacy cubiertos por un fixed igual o posterior', async () => {
    const service = createSubject();
    service.reportesNDVIsService.get
      .mockResolvedValueOnce({
        datos: [
          legacy('legacy-2', '2026-06-15T10:00:00.000Z'),
          legacy('legacy-1', '2026-05-31T10:00:00.000Z'),
        ],
        totalCount: 2,
      })
      .mockResolvedValueOnce({
        datos: [fixed('2026-07-05T10:00:00.000Z')],
        totalCount: 1,
      });

    await expect(service.normalizarNdviLegacy(100)).resolves.toEqual({
      total: 2,
      encolados: 0,
      omitidos: 2,
      lotesUnicos: 1,
    });
    expect(service.reportesNDVIsService.get).toHaveBeenCalledTimes(2);
    expect(service.repository.getById).not.toHaveBeenCalled();
    expect(service.ndviQueue.enqueueLote).not.toHaveBeenCalled();
  });

  it('encola como fecha exacta un legacy que todavia no tiene fixed posterior', async () => {
    const service = createSubject();
    const lote = { _id: 'lote-1', ubicacion: { geojson: {} } };
    service.reportesNDVIsService.get
      .mockResolvedValueOnce({
        datos: [legacy('legacy-1', '2026-07-10T10:00:00.000Z')],
        totalCount: 1,
      })
      .mockResolvedValueOnce({
        datos: [fixed('2026-07-05T10:00:00.000Z')],
        totalCount: 1,
      });
    service.repository.getById.mockResolvedValue(lote);
    service.ndviQueue.enqueueLote.mockResolvedValue(true);

    await expect(service.normalizarNdviLegacy(100)).resolves.toEqual({
      total: 1,
      encolados: 1,
      omitidos: 0,
      lotesUnicos: 1,
    });
    expect(service.ndviQueue.enqueueLote).toHaveBeenCalledWith(
      lote,
      '2026-07-10T10:00:00.000Z',
      'sentinel-2-l2a',
      {
        forceRender: true,
        exactSceneDate: true,
      },
    );
  });

  it('prefiere el render fixed cuando comparte fecha con un legacy', async () => {
    const service = createSubject();
    const lote = { _id: 'lote-1', ubicacion: { geojson: {} } };
    service.getById = jest.fn().mockResolvedValue(lote);
    service.reportesNDVIsService.get.mockResolvedValueOnce({
      datos: [
        legacy('legacy-1', '2026-07-05T10:00:00.000Z'),
        fixed('2026-07-05T10:00:00.000Z'),
      ],
      totalCount: 2,
    });
    service.ndviQueue.enqueueLote.mockResolvedValue(true);

    await service.generarNdvi('lote-1', { nivel: 'Admin', rol: 'Admin' });

    expect(service.ndviQueue.enqueueLote).toHaveBeenCalledWith(
      lote,
      '2026-07-05T10:00:00.000Z',
      'sentinel-2-l2a',
      expect.objectContaining({
        forceRender: false,
        exactSceneDate: false,
      }),
    );
  });
});
