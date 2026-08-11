describe('Open-Meteo environment parsing', () => {
  const originalMinInterval = process.env.OPEN_METEO_MIN_INTERVAL_MS;
  const originalMaxRetries = process.env.OPEN_METEO_MAX_RETRIES;
  const originalForecastKey = process.env.OPEN_METEO_API_KEY;
  const originalArchiveKey = process.env.OPEN_METEO_ARCHIVE_API_KEY;
  const originalForecastBase = process.env.OPEN_METEO_FORECAST_BASE_URL;
  const originalArchiveBase = process.env.OPEN_METEO_ARCHIVE_BASE_URL;

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
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://customer-api.open-meteo.com/v1';
    process.env.OPEN_METEO_ARCHIVE_BASE_URL =
      'https://customer-archive-api.open-meteo.com/v1';
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(
      /OPEN_METEO_ARCHIVE_BASE_URL no coincide/,
    );
  });

  it('habilita archive customer solo con su clave separada', async () => {
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
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

  it('rechaza HTTPS con host de Open-Meteo falsificado', async () => {
    delete process.env.OPEN_METEO_API_KEY;
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://api.open-meteo.com.evil.example/v1';
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    process.env.OPEN_METEO_ARCHIVE_BASE_URL =
      'https://archive-api.open-meteo.com/v1';
    jest.resetModules();

    await expect(import('./env')).rejects.toThrow(
      /host oficial de Open-Meteo/,
    );
  });
});
