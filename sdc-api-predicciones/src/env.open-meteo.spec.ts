describe('Open-Meteo environment parsing', () => {
  const originalMinInterval = process.env.OPEN_METEO_MIN_INTERVAL_MS;
  const originalMaxRetries = process.env.OPEN_METEO_MAX_RETRIES;
  const originalForecastKey = process.env.OPEN_METEO_API_KEY;
  const originalForecastBase = process.env.OPEN_METEO_FORECAST_BASE_URL;
  const originalLegacyBase = process.env.API_OPEN_METEO;

  afterEach(() => {
    if (originalMinInterval === undefined) {
      delete process.env.OPEN_METEO_MIN_INTERVAL_MS;
    } else {
      process.env.OPEN_METEO_MIN_INTERVAL_MS = originalMinInterval;
    }
    if (originalMaxRetries === undefined) {
      delete process.env.OPEN_METEO_MAX_RETRIES;
    } else {
      process.env.OPEN_METEO_MAX_RETRIES = originalMaxRetries;
    }
    for (const [name, value] of [
      ['OPEN_METEO_API_KEY', originalForecastKey],
      ['OPEN_METEO_FORECAST_BASE_URL', originalForecastBase],
      ['API_OPEN_METEO', originalLegacyBase],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.resetModules();
  });

  it('preserves an explicit zero for pacing and retries', async () => {
    process.env.OPEN_METEO_MIN_INTERVAL_MS = '0';
    process.env.OPEN_METEO_MAX_RETRIES = '0';
    jest.resetModules();

    const env = await import('./env');

    expect(env.OPEN_METEO_MIN_INTERVAL_MS).toBe(0);
    expect(env.OPEN_METEO_MAX_RETRIES).toBe(0);
  });

  it.each([
    'http://customer-api.open-meteo.com/v1',
    'https://customer-api.open-meteo.com.evil.example/v1',
    'https://customer-archive-api.open-meteo.com/v1',
  ])('rechaza un forecast base inseguro o de familia incorrecta: %s', async (base) => {
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_FORECAST_BASE_URL = base;
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(
      /OPEN_METEO_FORECAST_BASE_URL/,
    );
  });

  it('rechaza clave customer combinada con host publico', async () => {
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://api.open-meteo.com/v1';
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(/no coincide/);
  });

  it('acepta clave forecast solo con el host customer oficial', async () => {
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://customer-api.open-meteo.com/v1/';
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toBe(
      'https://customer-api.open-meteo.com/v1',
    );
  });
});
