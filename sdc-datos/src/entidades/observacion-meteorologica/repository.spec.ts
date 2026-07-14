import { ObservacionesMeteorologicasRepository } from './repository';

describe('ObservacionesMeteorologicasRepository', () => {
  it('usa una clave idempotente que reemplaza pronostico por observacion', async () => {
    const model = {
      bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    const repository = new ObservacionesMeteorologicasRepository(model as any);
    const base = {
      idEstablecimiento: '64b000000000000000000003',
      timestamp: '2026-07-13T15:00:00.000Z',
      fechaLocal: '2026-07-13',
      timezone: 'America/Argentina/Cordoba',
      granularidad: 'hourly' as const,
      estado: 'forecast' as const,
      esPronostico: true,
      valores: { temperatureC: 18 },
      fuente: 'open_meteo' as const,
      fuentePorVariable: { temperatureC: 'open_meteo' as const },
      banderasCalidad: [],
      completitudPct: 20,
      obtenidoEn: '2026-07-13T14:00:00.000Z',
    };
    await repository.upsertMany([
      base,
      { ...base, estado: 'estimated', esPronostico: false },
    ]);
    const operations = model.bulkWrite.mock.calls[0][0];
    expect(operations[0].updateOne.filter).toEqual(
      operations[1].updateOne.filter,
    );
    expect(operations[0].updateOne.filter.esPronostico).toBeUndefined();
  });
});
