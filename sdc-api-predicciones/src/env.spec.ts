describe('SOIL_INTELLIGENCE_INTERNAL_TOKEN', () => {
  const names = [
    'SOIL_INTELLIGENCE_INTERNAL_TOKEN',
    'LOT_LOCATION_INTERNAL_TOKEN',
    'AGROMETEO_INTERNAL_TOKEN',
  ] as const;
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  afterEach(() => {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.resetModules();
  });

  function loadToken(): string {
    let token = '';
    jest.isolateModules(() => {
      token = require('./env').SOIL_INTELLIGENCE_INTERNAL_TOKEN;
    });
    return token;
  }

  it('usa AGROMETEO como ultimo fallback compatible', () => {
    delete process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN;
    delete process.env.LOT_LOCATION_INTERNAL_TOKEN;
    process.env.AGROMETEO_INTERNAL_TOKEN = 'agrometeo';

    expect(loadToken()).toBe('agrometeo');
  });

  it('mantiene la precedencia SOIL sobre los tokens historicos', () => {
    process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN = 'soil';
    process.env.LOT_LOCATION_INTERNAL_TOKEN = 'lot';
    process.env.AGROMETEO_INTERNAL_TOKEN = 'agrometeo';

    expect(loadToken()).toBe('soil');
  });
});

describe('RIEGO_CRON_ENABLED', () => {
  const originalFlag = process.env.RIEGO_CRON_ENABLED;
  const originalEnv = process.env.ENV;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.RIEGO_CRON_ENABLED;
    else process.env.RIEGO_CRON_ENABLED = originalFlag;
    if (originalEnv === undefined) delete process.env.ENV;
    else process.env.ENV = originalEnv;
    jest.resetModules();
  });

  function loadFlag(): boolean {
    let enabled = false;
    jest.isolateModules(() => {
      enabled = require('./env').RIEGO_CRON_ENABLED;
    });
    return enabled;
  }

  it('queda apagado si la variable no existe', () => {
    delete process.env.RIEGO_CRON_ENABLED;
    process.env.ENV = 'local';
    expect(loadFlag()).toBe(false);
  });

  it('es opt-in explicito y nunca corre en test', () => {
    process.env.RIEGO_CRON_ENABLED = 'true';
    process.env.ENV = 'test';
    expect(loadFlag()).toBe(false);

    jest.resetModules();
    process.env.ENV = 'local';
    expect(loadFlag()).toBe(true);
  });
});
