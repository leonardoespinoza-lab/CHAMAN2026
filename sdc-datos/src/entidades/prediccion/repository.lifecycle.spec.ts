import { PrediccionsRepository } from './repository';

describe('Predicciones datos - ciclo de vida de la siembra', () => {
  function subject({
    tombstoneBefore = false,
    sowingBefore = true,
    tombstoneAfter = false,
    sowingAfter = true,
  } = {}) {
    const model = {
      create: jest.fn().mockResolvedValue({ _id: 'prediccion-1' }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const tombstoneModel = {
      exists: jest
        .fn()
        .mockResolvedValueOnce(tombstoneBefore ? { _id: 'baja' } : null)
        .mockResolvedValueOnce(tombstoneAfter ? { _id: 'baja' } : null),
      updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    const siembraModel = {
      exists: jest
        .fn()
        .mockResolvedValueOnce(sowingBefore ? { _id: 'siembra-1' } : null)
        .mockResolvedValueOnce(sowingAfter ? { _id: 'siembra-1' } : null),
    };
    return {
      repository: new PrediccionsRepository(
        model as any,
        tombstoneModel as any,
        siembraModel as any,
      ),
      model,
      tombstoneModel,
    };
  }

  it('rechaza crear una prediccion cuando la siembra ya fue cerrada', async () => {
    const { repository, model } = subject({ sowingBefore: false });

    await expect(
      repository.create({ idSiembra: 'siembra-1' } as any),
    ).rejects.toThrow('eliminada o cerrada');
    expect(model.create).not.toHaveBeenCalled();
  });

  it('purga la fila si la siembra se elimina durante la escritura', async () => {
    const { repository, model } = subject({
      sowingBefore: true,
      sowingAfter: false,
    });

    await expect(
      repository.create({ idSiembra: 'siembra-1' } as any),
    ).rejects.toThrow('eliminada o cerrada');
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: 'prediccion-1' });
  });

  it('crea la marca de baja antes de limpiar la serie', async () => {
    const { repository, model, tombstoneModel } = subject();

    await repository.deleteByIdSiembra('siembra-1');

    expect(
      tombstoneModel.updateOne.mock.invocationCallOrder[0],
    ).toBeLessThan(model.deleteMany.mock.invocationCallOrder[0]);
  });
});
