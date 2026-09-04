import { AlgoritmosService } from './service';

describe('AlgoritmosService - selección estacional de malezas', () => {
  const malezas = {
    getFilter: jest.fn().mockResolvedValue({
      datos: [
        { nombre: 'Eleusine', nombreCientifico: 'Eleusine indica' },
        { nombre: 'Amaranthus', nombreCientifico: 'Amaranthus spp.' },
      ],
    }),
  };
  const service = new AlgoritmosService(
    {} as any,
    {} as any,
    malezas as any,
    {} as any,
    {} as any,
  ) as any;

  beforeEach(() => jest.clearAllMocks());

  it('clasifica las dos especies existentes como estivales', () => {
    expect(
      service.temporadaMaleza({ nombreCientifico: 'Eleusine indica' }),
    ).toBe('estival');
    expect(
      service.temporadaMaleza({ nombreCientifico: 'Amaranthus spp.' }),
    ).toBe('estival');
  });

  it('respeta la temporada declarada y no inventa una para especies nuevas', () => {
    expect(service.temporadaMaleza({ temporadaEmergencia: 'invernal' })).toBe(
      'invernal',
    );
    expect(
      service.temporadaMaleza({ nombreCientifico: 'Especie futura' }),
    ).toBeUndefined();
  });

  it('consulta el banco de semillas sin filtrar por cultivo', async () => {
    await service.getModelosMalezas();

    expect(malezas.getFilter).toHaveBeenCalledWith({
      filter: JSON.stringify({}),
      sort: 'nombre',
    });
  });
});
