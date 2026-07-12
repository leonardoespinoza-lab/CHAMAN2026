import { ClimaService } from './service';

describe('contexto climÃ¡tico del establecimiento', () => {
  const repository = {
    getEstacionMasCercanaEntreFechas: jest.fn().mockResolvedValue([]),
  };
  const service = new ClimaService(repository as any);

  beforeEach(() => jest.clearAllMocks());

  it('envÃ­a la central asociada al API de clima', async () => {
    await service.getEstacionMasCercanaEntreFechas(
      -33.9,
      -60.6,
      '2026-07-10',
      '2026-07-11',
      'daily',
      {
        idEstacionMeteorologica: 'station-id',
        fuenteClimaPreferida: 'FieldClimate',
      },
    );

    expect(repository.getEstacionMasCercanaEntreFechas).toHaveBeenCalledWith(
      -33.9,
      -60.6,
      '2026-07-10',
      '2026-07-11',
      'daily',
      'station-id',
    );
  });

  it('fuerza Open-Meteo cuando es la fuente preferida', async () => {
    await service.getEstacionMasCercanaEntreFechas(
      -33.9,
      -60.6,
      '2026-07-10',
      '2026-07-11',
      undefined,
      {
        idEstacionMeteorologica: 'station-id',
        fuenteClimaPreferida: 'Open-Meteo',
      },
    );

    expect(repository.getEstacionMasCercanaEntreFechas).toHaveBeenCalledWith(
      -33.9,
      -60.6,
      '2026-07-10',
      '2026-07-11',
      undefined,
      undefined,
    );
  });

  it('mantiene operativos los lotes antiguos sin configuracion de estacion', async () => {
    await service.getEstacionMasCercanaEntreFechas(
      -33.9,
      -60.6,
      '2026-07-10',
      '2026-07-11',
    );

    expect(repository.getEstacionMasCercanaEntreFechas).toHaveBeenCalledWith(
      -33.9,
      -60.6,
      '2026-07-10',
      '2026-07-11',
      undefined,
      undefined,
    );
  });
});
