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
