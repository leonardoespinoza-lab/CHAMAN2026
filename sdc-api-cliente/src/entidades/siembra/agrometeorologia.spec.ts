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
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
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
      false,
      { nivel: 'Productor', rol: 'Lectura', idProductor: 'productor-owner' },
    );
    expect(result).toBe(response as any);
    expect(repository.getById).toHaveBeenCalledWith('siembra-1');
    expect(repository.agrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      '2026-07-01',
      '2026-07-13',
      false,
    );
  });

  it('impide consultar una siembra de otro productor', async () => {
    const { service, repository } = setup();
    await expect(
      service.agrometeorologia('siembra-1', undefined, undefined, false, {
        nivel: 'Productor',
        rol: 'Lectura',
        idProductor: 'otro-productor',
      }),
    ).rejects.toThrow('No tiene permiso');
    expect(repository.agrometeorologia).not.toHaveBeenCalled();
  });

  it('solicita horas solamente cuando el consumidor lo requiere', async () => {
    const { service, repository } = setup();
    await service.agrometeorologia(
      'siembra-1',
      '2026-09-01',
      '2026-09-03',
      true,
      { nivel: 'Productor', rol: 'Lectura', idProductor: 'productor-owner' },
    );
    expect(repository.agrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      '2026-09-01',
      '2026-09-03',
      true,
    );
  });

  it('autoriza, reprocesa y devuelve la nueva generación agrometeorológica', async () => {
    const { service, repository } = setup();
    const result = await service.reprocesarAgrometeorologia(
      'siembra-1',
      false,
      {
        nivel: 'Productor',
        rol: 'Admin',
        idProductor: 'productor-owner',
      },
    );

    expect(repository.reprocesarAgrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      false,
    );
    expect(repository.agrometeorologia).toHaveBeenCalledWith('siembra-1');
    expect(result).toBe(response as any);
  });
});
