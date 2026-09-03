import { SiembrasService } from './service';

describe('SiembrasService - universo sanitario activo', () => {
  it('incluye siembras perennes antiguas mientras sigan activas y sin cosecha', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({
        datos: [{ _id: 'manzano-2020' }, { _id: 'trigo-2026' }],
        total: 2,
      }),
    };
    const service = new SiembrasService(repository as any);

    await expect(
      service.listarSiembrasParaPrediccionesSanitarias(),
    ).resolves.toEqual([
      { _id: 'manzano-2020' },
      { _id: 'trigo-2026' },
    ]);
    expect(repository.get).toHaveBeenCalledWith({
      select: '_id',
      filter: JSON.stringify({
        fechaCosecha: { $eq: null },
        activa: { $ne: false },
      }),
      sort: '-fechaSiembra',
    });
  });
});
