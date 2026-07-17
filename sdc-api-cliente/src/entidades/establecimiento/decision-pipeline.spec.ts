import { EstablecimientosService } from './service';

describe('EstablecimientosService - decision pipeline', () => {
  it('encola el establecimiento al cambiar fuente meteorologica', async () => {
    const repository = {
      update: jest.fn().mockResolvedValue({ _id: 'establecimiento-1' }),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      enqueueForEstablishment: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new EstablecimientosService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      queue as any,
    );
    jest.spyOn(service, 'getById').mockResolvedValue({
      _id: 'establecimiento-1',
    } as any);

    await service.update(
      'establecimiento-1',
      { fuenteClimaPreferida: 'Open-Meteo' } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(queue.enqueueForEstablishment).toHaveBeenCalledWith(
      'establecimiento-1',
      {
        trigger: 'establecimiento.weather-source-updated',
        changedFields: ['fuenteClimaPreferida'],
        sincronizarClima: true,
      },
    );
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });
});
