import { LotesService } from './service';

describe('LotesService spatial resolution sequencing', () => {
  const repository = {
    create: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
  };
  const location = { requestResolution: jest.fn() };
  const soil = { request: jest.fn() };
  const service = new LotesService(
    repository as any,
    location as any,
    soil as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    soil.request.mockResolvedValue({ status: 'pending' });
  });

  it('crea el lote sin bloquear y solicita suelo solo despues de resolver ubicacion', async () => {
    let resolveLocation: (value: unknown) => void = () => undefined;
    location.requestResolution.mockReturnValue(
      new Promise((resolve) => {
        resolveLocation = resolve;
      }),
    );
    repository.create.mockResolvedValue({ _id: 'lot-1' });

    await expect(service.create({ nombre: 'Lote' } as any)).resolves.toEqual({
      _id: 'lot-1',
    });
    expect(location.requestResolution).toHaveBeenCalledWith(
      'lot-1',
      'lot_created',
      { immediate: true },
    );
    expect(soil.request).not.toHaveBeenCalled();

    resolveLocation({ estado: 'ready' });
    await Promise.resolve();
    expect(soil.request).toHaveBeenCalledWith('lot-1', 'lot_created');
  });

  it('actualiza geometria y solicita SoilGrids aunque falle la ubicacion', async () => {
    location.requestResolution.mockRejectedValue(new Error('sin catalogo'));
    repository.getById.mockResolvedValue({
      ubicacion: { geojson: { coordinates: [[[-60, -35]]] } },
    });
    repository.update.mockResolvedValue({ _id: 'lot-2' });
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await service.update('lot-2', {
      ubicacion: { geojson: { coordinates: [[[-61, -36]]] } },
    } as any);
    await Promise.resolve();
    await Promise.resolve();

    expect(location.requestResolution).toHaveBeenCalledWith(
      'lot-2',
      'geometry_changed',
      { immediate: true },
    );
    expect(soil.request).toHaveBeenCalledWith('lot-2', 'geometry_changed');
  });
});
