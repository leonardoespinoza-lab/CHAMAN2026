import { DecisionPipelineRepository } from './decision-pipeline.repository';

describe('DecisionPipelineRepository', () => {
  it('conserva perennes antiguos activos y excluye anuales cosechados', async () => {
    const axios = {
      GET: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'anual-activa',
            fechaSiembra: '2026-05-05T00:00:00.000Z',
            semilla: { cultivo: 'Trigo' },
          },
          {
            _id: 'anual-cosechada',
            fechaSiembra: '2025-05-05T00:00:00.000Z',
            fechaCosecha: '2025-12-01T00:00:00.000Z',
            semilla: { cultivo: 'Trigo' },
          },
          {
            _id: 'perenne-2020',
            fechaSiembra: '2020-08-01T00:00:00.000Z',
            fechaCosecha: '2025-03-01T00:00:00.000Z',
            semilla: { cultivo: 'Manzano' },
          },
          {
            _id: 'inactiva',
            fechaSiembra: '2026-05-05T00:00:00.000Z',
            activa: false,
            semilla: { cultivo: 'Pecan' },
          },
        ],
      }),
    };
    const repository = new DecisionPipelineRepository(axios as any);

    await expect(
      repository.resolveActiveSowingIds('semilla', 'semilla-1'),
    ).resolves.toEqual(['anual-activa', 'perenne-2020']);
  });

  it('incluye lotes canonicos al expandir un establecimiento', async () => {
    const axios = {
      GET: jest
        .fn()
        .mockResolvedValueOnce({ datos: [{ _id: 'lote-1' }] })
        .mockResolvedValueOnce({
          datos: [
            {
              _id: 'siembra-legacy',
              fechaSiembra: '2026-05-05T00:00:00.000Z',
              semilla: { cultivo: 'Trigo' },
            },
          ],
        }),
    };
    const repository = new DecisionPipelineRepository(axios as any);

    await repository.resolveActiveSowingIds(
      'establecimiento',
      'establecimiento-1',
    );

    const sowingQuery = axios.GET.mock.calls[1][1].params;
    expect(JSON.parse(sowingQuery.filter)).toMatchObject({
      $or: [
        { idEstablecimiento: 'establecimiento-1' },
        { idLote: { $in: ['lote-1'] } },
      ],
      activa: { $ne: false },
    });
  });
});
