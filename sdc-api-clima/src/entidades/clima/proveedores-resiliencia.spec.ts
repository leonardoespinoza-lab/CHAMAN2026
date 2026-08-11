import { ClimaService } from './service';
import {
  OpenMeteoClientService,
  openMeteoCacheKey,
} from '../../auxiliares/open-meteo/open-meteo-client.service';

describe('resiliencia de proveedores climaticos', () => {
  const openMeteo = new OpenMeteoClientService();
  const service = new ClimaService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    openMeteo,
  );

  it('descarta sin excepcion una respuesta historica FieldClimate malformada', () => {
    expect(
      service.parsearClimaFieldClimate({} as any, { error: true } as any),
    ).toEqual([]);
  });

  it('sirve cache reciente de emergencia cuando el circuito esta abierto', async () => {
    const url = new URL('https://api.open-meteo.com/v1/forecast?latitude=-33');
    const key = openMeteoCacheKey(url);
    (openMeteo as any).cache.set(key, {
      expiresAt: Date.now() - 1000,
      staleUntil: Date.now() + 60_000,
      data: { daily: { time: ['2026-07-12'] } },
    });
    (openMeteo as any).circuitOpenUntil = Date.now() + 60_000;

    await expect(
      (service as any).fetchOpenMeteoJson(url, 'test'),
    ).resolves.toEqual({
      daily: { time: ['2026-07-12'] },
    });
  });
});
