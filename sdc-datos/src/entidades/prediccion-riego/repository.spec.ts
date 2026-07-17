import { PrediccionRiegosRepository } from './repository';

describe('PrediccionRiegosRepository', () => {
  it('persiste de forma idempotente por siembra y fecha', async () => {
    const persisted = { _id: 'prediccion-1' };
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue(persisted),
    };
    const repository = new PrediccionRiegosRepository(model as any);
    const data = {
      idSiembra: 'siembra-1',
      fechaPrediccion: '2026-07-17',
      regar: [{ fecha: '2026-07-17', cantidad: 0 }],
    } as any;

    await expect(repository.create(data)).resolves.toBe(persisted as any);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { idSiembra: 'siembra-1', fechaPrediccion: '2026-07-17' },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });
});
