import { LorawanUplinksService } from './service';

describe('LorawanUplinksService Milesight TS201', () => {
  it('persists the ChirpStack TS201 aliases with their historical units', async () => {
    const dispositivos = { update: jest.fn() };
    const reportes = {
      getByDeveuiAndFecha: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ _id: 'reporte-ts201' }),
    };
    const service = new LorawanUplinksService(
      {} as any,
      dispositivos as any,
      reportes as any,
    );

    const synced = await (service as any).syncGenericClimateReport(
      {
        devEUI: '24E124433F027440',
        timestamp: '2026-08-17T20:30:00.000Z',
        rawPayload: {
          object: {
            battery_pct: 96,
            temperature_c: -0.7,
            humidity_pct: 93,
          },
        },
      },
      { _id: 'sensor-1' },
    );

    expect(synced).toBe(true);
    expect(reportes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deveui: '24E124433F027440',
        estado: 'completo',
        datos: {
          valores: {
            Temperatura: [
              { unidad: 'C', valores: { actual: -0.7 } },
            ],
            Humedad: [
              { unidad: '%', valores: { actual: 93 } },
            ],
            'Batería': [
              { unidad: '%', valores: { actual: 96 } },
            ],
          },
        },
      }),
    );
    expect(dispositivos.update).toHaveBeenCalledWith(
      'sensor-1',
      expect.objectContaining({
        bateria: {
          valor: 96,
          unidad: '%',
          fecha: '2026-08-17T20:30:00.000Z',
        },
        ultimoReporte: { _id: 'reporte-ts201' },
      }),
    );
  });

  it('passes an application and start date scope to a replay', async () => {
    const repository = { byDevEUI: jest.fn().mockResolvedValue([]) };
    const service = new LorawanUplinksService(
      repository as any,
      {} as any,
      {} as any,
    );

    await service.reprocess({
      devEUI: '24e124433f027440',
      applicationID: '834e2f40-8ce6-4b94-9f14-e9db28092f40',
      from: '2026-08-17T20:20:00.000Z',
      limit: 100,
    });

    expect(repository.byDevEUI).toHaveBeenCalledWith(
      '24E124433F027440',
      100,
      {
        applicationID: '834e2f40-8ce6-4b94-9f14-e9db28092f40',
        from: new Date('2026-08-17T20:20:00.000Z'),
      },
    );
  });

  it('refuses replacement when a replay is limited to a new session', async () => {
    const repository = { byDevEUI: jest.fn() };
    const reportes = { deleteByDeveui: jest.fn() };
    const service = new LorawanUplinksService(
      repository as any,
      {} as any,
      reportes as any,
    );

    const result = await service.reprocess({
      devEUI: '24e124433f027440',
      applicationID: '834e2f40-8ce6-4b94-9f14-e9db28092f40',
      from: '2026-08-17T20:20:00.000Z',
      replace: true,
    });

    expect(result).toMatchObject({ procesados: 0, errores: 0 });
    expect(result.mensaje).toMatch(/replace no se permite/);
    expect(repository.byDevEUI).not.toHaveBeenCalled();
    expect(reportes.deleteByDeveui).not.toHaveBeenCalled();
  });
});
