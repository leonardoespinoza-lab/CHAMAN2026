import { SiembrasService } from './service';

describe('SiembrasService - integracion con decision pipeline durable', () => {
  function setup() {
    const persisted = {
      _id: 'siembra-1',
      idLote: 'lote-1',
      idSemilla: 'semilla-1',
      idProductor: 'productor-1',
      fechaSiembra: '2026-05-05T00:00:00.000Z',
      semilla: { cultivo: 'Trigo', ciclo: 'Intermedio' },
    };
    const repository = {
      create: jest.fn().mockResolvedValue(persisted),
      getById: jest.fn().mockResolvedValue(persisted),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const predictions = {
      prediccion: jest.fn().mockResolvedValue([]),
      reconstruir: jest.fn().mockResolvedValue([]),
      agroclima: jest.fn().mockResolvedValue({}),
    };
    const lots = {
      getById: jest.fn().mockResolvedValue({
        _id: 'lote-1',
        idProductor: 'productor-1',
        ubicacion: { centro: { lat: -39, lng: -68 } },
      }),
      update: jest.fn().mockResolvedValue(undefined),
      generarNdvi: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      enqueueForSowing: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new SiembrasService(
      repository as any,
      predictions as any,
      {} as any,
      {} as any,
      lots as any,
      {} as any,
      {} as any,
      {} as any,
      queue as any,
    );
    jest
      .spyOn(service as any, 'getCrono')
      .mockResolvedValue({ _id: 'crono-1' });
    return { service, repository, predictions, lots, queue };
  }

  it('crea la siembra y espera solo la persistencia del trabajo durable', async () => {
    const { service, repository, predictions, queue } = setup();

    await service.create(
      {
        idLote: 'lote-1',
        idSemilla: 'semilla-1',
        fechaSiembra: '2026-05-05T00:00:00.000Z',
      },
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(queue.enqueueForSowing).toHaveBeenCalledWith(
      'siembra-1',
      expect.objectContaining({
        trigger: 'siembra.created',
        sincronizarClima: true,
      }),
    );
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
    expect(predictions.prediccion).not.toHaveBeenCalled();
  });
});
