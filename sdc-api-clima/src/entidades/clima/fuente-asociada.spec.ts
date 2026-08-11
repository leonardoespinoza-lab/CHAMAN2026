import { ClimaService } from './service';

const row = (fuente: 'FieldClimate' | 'OpenMeteo', fecha = '2026-07-10') => ({
  fecha,
  fuente,
  temperatura: { avg: 18, min: 12, max: 24 },
  humedad: { avg: 82 },
  lluvia: { sum: 2 },
});

describe('polÃ­tica de fuente climÃ¡tica para enfermedades', () => {
  const fieldClimate = {
    getEstacionMasCercanaEntreFechas: jest.fn(),
    getDataBetweenDates: jest.fn(),
  };
  const estaciones = { getById: jest.fn() };
  const service = new ClimaService(
    fieldClimate as any,
    {} as any,
    {} as any,
    estaciones as any,
    { getJson: jest.fn() } as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa Open-Meteo sin buscar una estaciÃ³n cercana cuando no hay asociaciÃ³n', async () => {
    jest
      .spyOn(service as any, 'getOpenMeteoEntreFechas')
      .mockResolvedValue([row('OpenMeteo')]);

    const result = await service.getEstacionMasCercanaEntreFechas(
      { lat: -33.9, lng: -60.6 },
      '2026-07-10',
      '2026-07-11',
      'daily',
      undefined,
      true,
    );

    expect(
      fieldClimate.getEstacionMasCercanaEntreFechas,
    ).not.toHaveBeenCalled();
    expect(fieldClimate.getDataBetweenDates).not.toHaveBeenCalled();
    expect(result[0].fuente).toBe('OpenMeteo');
    expect(result[0].calidadDatos?.fallback).toBe(true);
  });

  it('consulta solo la central FieldClimate asociada al establecimiento', async () => {
    estaciones.getById.mockResolvedValue({
      _id: 'station-db-id',
      idExterno: 'station-field-id',
      origen: 'FieldClimate',
      user: 'user',
      pass: 'pass',
    });
    fieldClimate.getDataBetweenDates.mockResolvedValue({ dates: [], data: [] });
    jest
      .spyOn(service, 'parsearClimaFieldClimate')
      .mockReturnValue([row('FieldClimate') as any]);
    const openMeteo = jest
      .spyOn(service as any, 'getOpenMeteoEntreFechas')
      .mockResolvedValue([]);

    const result = await service.getEstacionMasCercanaEntreFechas(
      { lat: -33.9, lng: -60.6 },
      '2026-07-10',
      '2026-07-11',
      'daily',
      'station-db-id',
      true,
    );

    expect(estaciones.getById).toHaveBeenCalledWith('station-db-id');
    expect(fieldClimate.getDataBetweenDates).toHaveBeenCalledWith(
      'station-field-id',
      'daily',
      expect.any(Number),
      expect.any(Number),
      'user',
      'pass',
    );
    expect(
      fieldClimate.getEstacionMasCercanaEntreFechas,
    ).not.toHaveBeenCalled();
    expect(openMeteo).not.toHaveBeenCalled();
    expect(result[0].fuente).toBe('FieldClimate');
    expect(result[0].calidadDatos?.fuente).toBe('estacion_asignada');
  });

  it('cae automaticamente a Open-Meteo si la asociacion antigua es invalida', async () => {
    estaciones.getById.mockRejectedValue(new Error('Estacion inexistente'));
    jest
      .spyOn(service as any, 'getOpenMeteoEntreFechas')
      .mockResolvedValue([row('OpenMeteo')]);

    const result = await service.getEstacionMasCercanaEntreFechas(
      { lat: -33.9, lng: -60.6 },
      '2026-07-10',
      '2026-07-11',
      'daily',
      'station-deleted-id',
      true,
    );

    expect(
      fieldClimate.getEstacionMasCercanaEntreFechas,
    ).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].fuente).toBe('OpenMeteo');
  });

  it('completa automaticamente con Open-Meteo los dias faltantes de la central asociada', async () => {
    estaciones.getById.mockResolvedValue({
      _id: 'station-db-id',
      idExterno: 'station-field-id',
      origen: 'FieldClimate',
    });
    fieldClimate.getDataBetweenDates.mockResolvedValue({ dates: [], data: [] });
    jest
      .spyOn(service, 'parsearClimaFieldClimate')
      .mockReturnValue([row('FieldClimate', '2026-07-10') as any]);
    jest
      .spyOn(service as any, 'getOpenMeteoEntreFechas')
      .mockResolvedValue([
        row('OpenMeteo', '2026-07-10'),
        row('OpenMeteo', '2026-07-11'),
      ]);

    const result = await service.getEstacionMasCercanaEntreFechas(
      { lat: -33.9, lng: -60.6 },
      '2026-07-10',
      '2026-07-12',
      'daily',
      'station-db-id',
      true,
    );

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.fuente)).toEqual([
      'FieldClimate',
      'OpenMeteo',
    ]);
    expect(result.map((item) => item.calidadDatos?.fuente)).toEqual([
      'estacion_asignada',
      'open_meteo',
    ]);
  });
});
