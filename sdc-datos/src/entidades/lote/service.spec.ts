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
    location.requestResolution.mockResolvedValue({ estado: 'ready' });
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

  it('no convierte en manual un cambio dinamico de raices', async () => {
    repository.getById.mockResolvedValue({
      _id: 'lot-roots',
      suelos: [
        {
          numeroDeSensor: 1,
          textura: 'Franco',
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
          hayRaices: false,
        },
      ],
      sueloProcedencia: 'soilgrids',
      sueloConfirmadoPorUsuario: false,
    });
    repository.update.mockImplementation((_id, data) => ({
      _id: 'lot-roots',
      ...data,
    }));

    await service.update('lot-roots', {
      suelos: [
        {
          numeroDeSensor: 1,
          textura: 'Franco',
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
          hayRaices: true,
        },
      ],
    } as any);

    expect(repository.update).toHaveBeenCalledWith(
      'lot-roots',
      expect.not.objectContaining({
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
      }),
    );
    expect(soil.request).not.toHaveBeenCalled();
  });

  it('no confirma como manual un perfil nuevo que solo mapea sensores', async () => {
    repository.create.mockImplementation((data) => ({
      _id: 'lot-operational-create',
      ...data,
    }));

    await service.create({
      nombre: 'Lote operativo',
      suelos: [
        {
          numeroDeSensor: 1,
          profundidad: 10,
          hayRaices: true,
        },
      ],
    } as any);

    expect(repository.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
      }),
    );
  });

  it('confirma como manual un perfil nuevo con propiedades fisicas', async () => {
    repository.create.mockImplementation((data) => ({
      _id: 'lot-physical-create',
      ...data,
    }));

    await service.create({
      nombre: 'Lote con textura',
      suelos: [{ profundidad: 20, textura: 'Franco' }],
    } as any);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
        sueloFechaConfirmacion: expect.any(String),
      }),
    );
  });

  it('no convierte en manual un remapeo del numero de sensor', async () => {
    repository.getById.mockResolvedValue({
      _id: 'lot-sensor-map',
      suelos: [
        {
          numeroDeSensor: 1,
          profundidad: 10,
          textura: 'Franco',
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
        },
      ],
    });
    repository.update.mockImplementation((_id, data) => ({
      _id: 'lot-sensor-map',
      ...data,
    }));

    await service.update('lot-sensor-map', {
      suelos: [
        {
          numeroDeSensor: 2,
          profundidad: 10,
          textura: 'Franco',
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
        },
      ],
    } as any);

    expect(repository.update).toHaveBeenCalledWith(
      'lot-sensor-map',
      expect.not.objectContaining({
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
      }),
    );
    expect(soil.request).not.toHaveBeenCalled();
  });

  it('marca y recalcula solo cuando cambia un valor fisico del suelo', async () => {
    repository.getById.mockResolvedValue({
      _id: 'lot-manual',
      capacidadDeCampo: 30,
    });
    repository.update.mockImplementation((_id, data) => ({
      _id: 'lot-manual',
      ...data,
    }));

    await service.update('lot-manual', { capacidadDeCampo: 33 } as any);

    expect(repository.update).toHaveBeenCalledWith(
      'lot-manual',
      expect.objectContaining({
        capacidadDeCampo: 33,
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
        sueloFechaConfirmacion: expect.any(String),
      }),
    );
    expect(soil.request).toHaveBeenCalledWith(
      'lot-manual',
      'manual_value_changed',
    );
  });

  it('conserva la procedencia de una calibracion automatica por sensor', async () => {
    repository.getById.mockResolvedValue({
      _id: 'lot-sensor',
      suelos: [{ numeroDeSensor: 1, capacidadDeCampo: 30 }],
    });
    repository.update.mockImplementation((_id, data) => ({
      _id: 'lot-sensor',
      ...data,
    }));

    await service.update('lot-sensor', {
      suelos: [{ numeroDeSensor: 1, capacidadDeCampo: 34 }],
      sueloProcedencia: 'sensor',
      sueloConfirmadoPorUsuario: false,
    } as any);

    expect(repository.update).toHaveBeenCalledWith(
      'lot-sensor',
      expect.objectContaining({
        sueloProcedencia: 'sensor',
        sueloConfirmadoPorUsuario: false,
      }),
    );
    expect(repository.update.mock.calls[0][1]).not.toEqual(
      expect.objectContaining({ sueloFechaConfirmacion: expect.any(String) }),
    );
  });
});
