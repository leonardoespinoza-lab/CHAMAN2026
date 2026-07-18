import { SemillasService } from './service';

describe('SemillasService - decision pipeline durable', () => {
  function setup() {
    const repository = {
      update: jest.fn(async (_id, data) => ({ _id: 'semilla-1', ...data })),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      enqueueForSeed: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    return {
      repository,
      queue,
      service: new SemillasService(repository as any, queue as any),
    };
  }

  it('encola sanidad completa cuando cambia resistencia', async () => {
    const { service, repository, queue } = setup();

    await service.update('semilla-1', {
      resistencia: [{ enfermedad: 'Roya', tipo: 'MS' }] as any,
    });

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(queue.enqueueForSeed).toHaveBeenCalledWith('semilla-1', {
      trigger: 'semilla.science-updated',
      changedFields: ['resistencia'],
      sincronizarClima: false,
    });
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });

  it('no recalcula por cambios editoriales sin efecto cientifico', async () => {
    const { service, queue } = setup();

    await service.update('semilla-1', { observaciones: 'Texto editorial' });

    expect(queue.enqueueForSeed).not.toHaveBeenCalled();
  });

  it('propaga una falla solo cuando cola y recuperacion sincronica fallan', async () => {
    const { service, queue } = setup();
    queue.enqueueForSeed.mockRejectedValueOnce(new Error('Redis caido'));

    await expect(
      service.update('semilla-1', { sensibilidadHelada: {} }),
    ).rejects.toThrow('Redis caido');
  });
});
