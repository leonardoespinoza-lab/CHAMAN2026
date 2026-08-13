describe('Open-Meteo environment parsing', () => {
  const originalMinInterval = process.env.OPEN_METEO_MIN_INTERVAL_MS;
  const originalMaxRetries = process.env.OPEN_METEO_MAX_RETRIES;
  const originalForecastKey = process.env.OPEN_METEO_API_KEY;
  const originalArchiveKey = process.env.OPEN_METEO_ARCHIVE_API_KEY;
  const originalForecastBase = process.env.OPEN_METEO_FORECAST_BASE_URL;
  const originalArchiveBase = process.env.OPEN_METEO_ARCHIVE_BASE_URL;
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
      ['OPEN_METEO_ARCHIVE_API_KEY', originalArchiveKey],
      ['OPEN_METEO_FORECAST_BASE_URL', originalForecastBase],
      ['OPEN_METEO_ARCHIVE_BASE_URL', originalArchiveBase],
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

  it('rechaza archive customer sin una clave Professional separada', async () => {
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    process.env.OPEN_METEO_ARCHIVE_BASE_URL =
      'https://customer-archive-api.open-meteo.com/v1';
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(
      /OPEN_METEO_ARCHIVE_BASE_URL no coincide/,
    );
  });

  it('usa archive customer cuando existe su clave dedicada', async () => {
    process.env.OPEN_METEO_ARCHIVE_API_KEY = 'archive-test-key';
    process.env.OPEN_METEO_ARCHIVE_BASE_URL =
      'https://customer-archive-api.open-meteo.com/v1';
    jest.resetModules();

    const env = await import('./env');

    expect(env.OPEN_METEO_ARCHIVE_API_KEY).toBe('archive-test-key');
    expect(env.OPEN_METEO_ARCHIVE_BASE_URL).toBe(
      'https://customer-archive-api.open-meteo.com/v1',
    );
  });

  it('rechaza hosts no oficiales antes de iniciar el servicio', async () => {
    delete process.env.OPEN_METEO_API_KEY;
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://api.open-meteo.com.attacker.example/v1';
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(/host oficial de Open-Meteo/);
  });

  it('Railway testing prevalece sobre ENV y NODE_ENV production', async () => {
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'testing';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toContain('api.open-meteo.com');
  });

  it('sin Railway, ENV=test prevalece sobre NODE_ENV=production', async () => {
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'production';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toContain('api.open-meteo.com');
  });

  it('bloquea production sin forecast comercial aunque ENV y NODE_ENV sean test', async () => {
    process.env.ENV = 'test';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    process.env.NODE_ENV = 'test';
    process.env.CHAMAN_SKIP_STARTUP_VALIDATION = 'true';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(/clave comercial.*Forecast/);
  });

  it('acepta Standard en production sin archive y lo deja deshabilitado', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_ARCHIVE_ENABLED).toBe(false);
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toContain(
      'customer-api.open-meteo.com',
    );
  });

  it('acepta production con forecast y archive comerciales completos', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = '  PrOdUcTiOn  ';
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_ARCHIVE_API_KEY = 'archive-test-key';
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://customer-api.open-meteo.com/v1';
    process.env.OPEN_METEO_ARCHIVE_BASE_URL =
      'https://customer-archive-api.open-meteo.com/v1';
    jest.resetModules();

    const env = await import('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toContain(
      'customer-api.open-meteo.com',
    );
    expect(env.OPEN_METEO_ARCHIVE_BASE_URL).toContain(
      'customer-archive-api.open-meteo.com',
    );
  });
});
