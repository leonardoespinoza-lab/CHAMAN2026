describe('Open-Meteo environment parsing', () => {
  const originalMinInterval = process.env.OPEN_METEO_MIN_INTERVAL_MS;
  const originalMaxRetries = process.env.OPEN_METEO_MAX_RETRIES;
  const originalForecastKey = process.env.OPEN_METEO_API_KEY;
  const originalForecastBase = process.env.OPEN_METEO_FORECAST_BASE_URL;
  const originalLegacyBase = process.env.API_OPEN_METEO;
  const originalEnv = process.env.ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRailwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;
  const originalSkipValidation = process.env.CHAMAN_SKIP_STARTUP_VALIDATION;

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
      ['ENV', originalEnv],
      ['NODE_ENV', originalNodeEnv],
      ['RAILWAY_ENVIRONMENT_NAME', originalRailwayEnv],
      ['CHAMAN_SKIP_STARTUP_VALIDATION', originalSkipValidation],
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
  ])(
    'rechaza un forecast base inseguro o de familia incorrecta: %s',
    async (base) => {
      process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
      process.env.OPEN_METEO_FORECAST_BASE_URL = base;
      jest.resetModules();

      await expect(import('./env')).rejects.toThrow(
        /OPEN_METEO_FORECAST_BASE_URL/,
      );
    },
  );

  it('rechaza clave customer combinada con host publico', async () => {
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_FORECAST_BASE_URL = 'https://api.open-meteo.com/v1';
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

  it('Railway testing prevalece sobre ENV y NODE_ENV production', async () => {
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'testing';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.API_OPEN_METEO;
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toContain('api.open-meteo.com');
  });

  it('sin Railway, ENV=test prevalece sobre NODE_ENV=production', async () => {
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'production';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.API_OPEN_METEO;
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toContain('api.open-meteo.com');
  });

  it('Railway production exige forecast aunque ENV y NODE_ENV sean test', async () => {
    process.env.ENV = 'test';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    process.env.NODE_ENV = 'test';
    process.env.CHAMAN_SKIP_STARTUP_VALIDATION = 'true';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.API_OPEN_METEO;
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(/clave comercial/);
  });

  it('acepta production con forecast comercial completo', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = '  PrOdUcTiOn  ';
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://customer-api.open-meteo.com/v1';
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toBe(
      'https://customer-api.open-meteo.com/v1',
    );
  });
});
