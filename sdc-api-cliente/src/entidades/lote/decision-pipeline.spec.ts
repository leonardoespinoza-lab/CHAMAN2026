import { LotesService } from './service';

describe('LotesService - decision pipeline', () => {
  it('encola todas las siembras del lote cuando cambia una dependencia de suelo', async () => {
    const repository = {
      update: jest.fn().mockResolvedValue({ _id: 'lote-1' }),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      enqueueForLot: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new LotesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queue as any,
    );
    jest.spyOn(service, 'getById').mockResolvedValue({
      _id: 'lote-1',
      idSiembra: 'siembra-actual',
    } as any);

    await service.update(
      'lote-1',
      { capacidadDeCampo: 31 } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(queue.enqueueForLot).toHaveBeenCalledWith('lote-1', {
      trigger: 'lote.science-updated',
      changedFields: ['capacidadDeCampo'],
      sincronizarClima: false,
    });
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });

  it('fuerza una nueva ingesta cuando cambia el poligono', async () => {
    const repository = {
      update: jest.fn().mockResolvedValue({ _id: 'lote-1' }),
    };
    const queue = {
      enqueueForLot: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new LotesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queue as any,
    );
    jest.spyOn(service, 'getById').mockResolvedValue({ _id: 'lote-1' } as any);

    await service.update(
      'lote-1',
      { ubicacion: { poligono: [] } } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(queue.enqueueForLot).toHaveBeenCalledWith(
      'lote-1',
      expect.objectContaining({ sincronizarClima: true }),
    );
  });
});
