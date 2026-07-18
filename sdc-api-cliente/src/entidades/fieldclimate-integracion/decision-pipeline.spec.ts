import { FieldClimateIntegracionService } from './service';

describe('FieldClimateIntegracionService - decision pipeline', () => {
  it('recalcula los establecimientos anterior y nuevo al reasignar la central', async () => {
    const repository = {
      obtenerCentralChaman: jest.fn().mockResolvedValue({
        _id: 'central-1',
        idEstablecimiento: 'establecimiento-anterior',
        estado: {},
      }),
      actualizarCentral: jest.fn().mockResolvedValue({
        _id: 'central-1',
        idEstablecimiento: 'establecimiento-nuevo',
        estado: {},
      }),
      actualizarEstablecimiento: jest.fn().mockResolvedValue({}),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      enqueueForEstablishment: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new FieldClimateIntegracionService(
      repository as any,
      queue as any,
    );

    await service.asignar('central-1', {
      idEstablecimiento: 'establecimiento-nuevo',
    });

    expect(repository.actualizarEstablecimiento).toHaveBeenCalledWith(
      'establecimiento-anterior',
      {
        idEstacionMeteorologica: null,
        fuenteClimaPreferida: 'Open-Meteo',
      },
    );
    expect(repository.actualizarEstablecimiento).toHaveBeenCalledWith(
      'establecimiento-nuevo',
      {
        idEstacionMeteorologica: 'central-1',
        fuenteClimaPreferida: 'FieldClimate',
      },
    );
    expect(queue.enqueueForEstablishment).toHaveBeenCalledTimes(2);
    expect(queue.enqueueForEstablishment).toHaveBeenCalledWith(
      'establecimiento-anterior',
      expect.objectContaining({
        trigger: 'fieldclimate.assigned',
        sincronizarClima: true,
      }),
    );
    expect(queue.enqueueForEstablishment).toHaveBeenCalledWith(
      'establecimiento-nuevo',
      expect.objectContaining({
        trigger: 'fieldclimate.assigned',
        sincronizarClima: true,
      }),
    );
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });
});
