import { ClimaService } from './service';

describe('resiliencia de proveedores climaticos', () => {
  const service = new ClimaService({} as any, {} as any, {} as any, {} as any);

  it('descarta sin excepcion una respuesta historica FieldClimate malformada', () => {
    expect(
      service.parsearClimaFieldClimate({} as any, { error: true } as any),
    ).toEqual([]);
  });

  it('sirve cache reciente de emergencia cuando el circuito esta abierto', async () => {
    const url = new URL('https://api.open-meteo.com/v1/forecast?latitude=-33');
    (service as any).openMeteoCache.set(url.toString(), {
      expiresAt: Date.now() - 1000,
      data: { daily: { time: ['2026-07-12'] } },
    });
    (service as any).openMeteoCircuitoHasta = Date.now() + 60_000;

    await expect((service as any).fetchOpenMeteoJson(url, 'test')).resolves.toEqual({
      daily: { time: ['2026-07-12'] },
    });
  });
});
