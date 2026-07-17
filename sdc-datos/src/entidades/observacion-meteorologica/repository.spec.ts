import { ObservacionesMeteorologicasRepository } from './repository';
import { ObservacionMeteorologicaSchema } from './modelos/schema';

describe('ObservacionesMeteorologicasRepository', () => {
  it('admite observaciones directas y derivadas de sensores de campo', () => {
    const fuentes = (
      ObservacionMeteorologicaSchema.path('fuente') as any
    ).options.enum;

    expect(fuentes).toEqual(
      expect.arrayContaining(['sensor', 'derived_sensor']),
    );
  });

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

  it('preserva un contexto meteorologico independiente por lote sin cambiar el indice historico', async () => {
    const model = {
      bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    const repository = new ObservacionesMeteorologicasRepository(model as any);
    const observation = {
      idEstablecimiento: '64b000000000000000000003',
      idLote: '64b000000000000000000010',
      timestamp: '2026-07-13T15:00:00.000Z',
      fechaLocal: '2026-07-13',
      timezone: 'America/Argentina/Cordoba',
      granularidad: 'hourly' as const,
      estado: 'estimated' as const,
      esPronostico: false,
      valores: { temperatureC: 18 },
      fuente: 'open_meteo' as const,
      fuentePorVariable: { temperatureC: 'open_meteo' as const },
      banderasCalidad: [],
      completitudPct: 20,
      obtenidoEn: '2026-07-13T14:00:00.000Z',
    };

    await repository.upsertMany([observation]);

    const operation = model.bulkWrite.mock.calls[0][0][0].updateOne;
    expect(operation.filter).toEqual({
      idEstablecimiento: observation.idEstablecimiento,
      timestamp: new Date(observation.timestamp),
      granularidad: 'hourly',
    });
    expect(operation.update.$set.idLote).toBe(observation.idLote);
    expect(
      operation.update.$set[
        `contextosLote.${observation.idLote}`
      ],
    ).toMatchObject({
      idLote: observation.idLote,
      valores: { temperatureC: 18 },
    });
  });
});
