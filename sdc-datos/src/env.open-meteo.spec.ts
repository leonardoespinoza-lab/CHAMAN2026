describe('configuracion Open-Meteo de sdc-datos', () => {
  const names = [
    'ENV',
    'NODE_ENV',
    'RAILWAY_ENVIRONMENT_NAME',
    'OPEN_METEO_API_KEY',
    'OPEN_METEO_ARCHIVE_API_KEY',
    'OPEN_METEO_FORECAST_BASE_URL',
    'OPEN_METEO_ARCHIVE_BASE_URL',
    'API_OPEN_METEO',
  ] as const;
  const original = new Map(names.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of names) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.resetModules();
  });

  it('usa customer forecast y archive cuando hay claves separadas', () => {
    process.env.ENV = 'local';
    delete process.env.NODE_ENV;
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_ARCHIVE_API_KEY = 'archive-test-key';
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    const env = require('./env');

    expect(env.OPEN_METEO_FORECAST_BASE_URL).toBe(
      'https://customer-api.open-meteo.com/v1',
    );
    expect(env.OPEN_METEO_ARCHIVE_BASE_URL).toBe(
      'https://customer-archive-api.open-meteo.com/v1',
    );
  });

  it('permite endpoints publicos sin claves solo fuera de produccion', () => {
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'test';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    const env = require('./env');

    expect(env.OPEN_METEO_FORECAST_BASE_URL).toBe(
      'https://api.open-meteo.com/v1',
    );
    expect(env.OPEN_METEO_ARCHIVE_BASE_URL).toBe(
      'https://archive-api.open-meteo.com/v1',
    );
  });

  it('rechaza un hostname que imita al oficial', () => {
    process.env.ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    process.env.OPEN_METEO_ARCHIVE_API_KEY = 'archive-test-key';
    process.env.OPEN_METEO_FORECAST_BASE_URL =
      'https://customer-api.open-meteo.com.attacker.example/v1';
    jest.resetModules();

    expect(() => require('./env')).toThrow(/host oficial de Open-Meteo/);
  });

  it('impide arrancar production sin ambas claves comerciales', () => {
    process.env.ENV = 'production';
    process.env.NODE_ENV = 'production';
    process.env.OPEN_METEO_API_KEY = 'forecast-test-key';
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    expect(() => require('./env')).toThrow(/claves comerciales separadas/);
  });

  it('Railway testing prevalece sobre ENV y NODE_ENV production', () => {
    process.env.ENV = 'production';
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'testing';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    const env = require('./env');
    expect(env.OPEN_METEO_FORECAST_BASE_URL).toContain('api.open-meteo.com');
  });

  it('detecta production por Railway aunque ENV y NODE_ENV sean test', () => {
    process.env.ENV = 'test';
    process.env.RAILWAY_ENVIRONMENT_NAME = ' production ';
    process.env.NODE_ENV = 'test';
    delete process.env.OPEN_METEO_API_KEY;
    delete process.env.OPEN_METEO_ARCHIVE_API_KEY;
    delete process.env.OPEN_METEO_FORECAST_BASE_URL;
    delete process.env.OPEN_METEO_ARCHIVE_BASE_URL;
    jest.resetModules();

    expect(() => require('./env')).toThrow(/claves comerciales separadas/);
  });
});
