import { SiembrasService } from './service';

describe('SiembrasService agrometeorologia', () => {
  const response = {
    summary: {},
    dataSource: { type: 'open_meteo', completenessPercentage: 90 },
    series: [],
    warnings: [],
    calculationVersion: 'agromet-v1',
    parametersVersion: 'params-v1',
  };

  function setup() {
    const repository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'siembra-1',
        idProductor: 'productor-owner',
      }),
      agrometeorologia: jest.fn().mockResolvedValue(response),
    };
    const service = new SiembrasService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, repository };
  }

  it('valida tenancy antes de consultar la serie persistida', async () => {
    const { service, repository } = setup();
    const result = await service.agrometeorologia(
      'siembra-1',
      '2026-07-01',
      '2026-07-13',
      { nivel: 'Productor', rol: 'Lectura', idProductor: 'productor-owner' },
    );
    expect(result).toBe(response as any);
    expect(repository.getById).toHaveBeenCalledWith('siembra-1');
    expect(repository.agrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      '2026-07-01',
      '2026-07-13',
    );
  });

  it('impide consultar una siembra de otro productor', async () => {
    const { service, repository } = setup();
    await expect(
      service.agrometeorologia('siembra-1', undefined, undefined, {
        nivel: 'Productor',
        rol: 'Lectura',
        idProductor: 'otro-productor',
      }),
    ).rejects.toThrow('No tiene permiso');
    expect(repository.agrometeorologia).not.toHaveBeenCalled();
  });
});
