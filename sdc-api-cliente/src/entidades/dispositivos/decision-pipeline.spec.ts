import { DispositivosService } from './service';

describe('DispositivosService - decision pipeline', () => {
  function setup() {
    const repository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'device-1',
        idLote: 'lote-anterior',
      }),
      create: jest.fn().mockImplementation(async (data) => ({
        _id: 'device-1',
        ...data,
      })),
      update: jest.fn().mockImplementation(async (_id, data) => ({
        _id: 'device-1',
        idLote: 'lote-anterior',
        ...data,
      })),
      delete: jest.fn().mockResolvedValue({ _id: 'device-1' }),
    };
    const queue = {
      enqueueForLot: jest.fn().mockResolvedValue({ id: 'job-lote' }),
      enqueueForEstablishment: jest
        .fn()
        .mockResolvedValue({ id: 'job-establecimiento' }),
    };
    return {
      repository,
      queue,
      service: new DispositivosService(repository as any, queue as any),
    };
  }

  it('encola el alcance asignado al crear el dispositivo', async () => {
    const { service, queue } = setup();

    await service.create({
      deveui: 'ABC',
      idEstablecimiento: 'establecimiento-1',
    } as any);

    expect(queue.enqueueForEstablishment).toHaveBeenCalledWith(
      'establecimiento-1',
      expect.objectContaining({ trigger: 'dispositivo.created' }),
    );
  });

  it('recalcula el lote anterior y el nuevo al reasignar', async () => {
    const { service, queue } = setup();

    await service.update('device-1', { idLote: 'lote-nuevo' } as any);

    expect(queue.enqueueForLot).toHaveBeenCalledTimes(2);
    expect(queue.enqueueForLot).toHaveBeenCalledWith(
      'lote-anterior',
      expect.objectContaining({ trigger: 'dispositivo.updated' }),
    );
    expect(queue.enqueueForLot).toHaveBeenCalledWith(
      'lote-nuevo',
      expect.objectContaining({ trigger: 'dispositivo.updated' }),
    );
  });

  it('recalcula el alcance anterior despues de eliminar', async () => {
    const { service, repository, queue } = setup();

    await service.delete('device-1');

    expect(repository.delete).toHaveBeenCalledWith('device-1');
    expect(queue.enqueueForLot).toHaveBeenCalledWith(
      'lote-anterior',
      expect.objectContaining({ trigger: 'dispositivo.deleted' }),
    );
  });
});
