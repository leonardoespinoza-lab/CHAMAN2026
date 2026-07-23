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
      token =
        jest.requireActual<typeof import('./env')>(
          './env',
        ).SOIL_INTELLIGENCE_INTERNAL_TOKEN;
    });
    return token;
  }

  it('prioriza el token dedicado', () => {
    process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN = 'soil';
    process.env.LOT_LOCATION_INTERNAL_TOKEN = 'lot';
    process.env.AGROMETEO_INTERNAL_TOKEN = 'agrometeo';

    expect(loadToken()).toBe('soil');
  });

  it('usa LOT_LOCATION como primer fallback', () => {
    delete process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN;
    process.env.LOT_LOCATION_INTERNAL_TOKEN = 'lot';
    process.env.AGROMETEO_INTERNAL_TOKEN = 'agrometeo';

    expect(loadToken()).toBe('lot');
  });

  it('usa AGROMETEO como ultimo fallback', () => {
    delete process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN;
    delete process.env.LOT_LOCATION_INTERNAL_TOKEN;
    process.env.AGROMETEO_INTERNAL_TOKEN = 'agrometeo';

    expect(loadToken()).toBe('agrometeo');
  });
});

describe('INTERNAL_HTTP_TIMEOUT_MS', () => {
  const original = process.env.INTERNAL_HTTP_TIMEOUT_MS;

  afterEach(() => {
    if (original === undefined) delete process.env.INTERNAL_HTTP_TIMEOUT_MS;
    else process.env.INTERNAL_HTTP_TIMEOUT_MS = original;
    jest.resetModules();
  });

  function loadTimeout(): number {
    let timeout = 0;
    jest.isolateModules(() => {
      timeout =
        jest.requireActual<typeof import('./env')>(
          './env',
        ).INTERNAL_HTTP_TIMEOUT_MS;
    });
    return timeout;
  }

  it('usa 30 segundos cuando no hay configuracion', () => {
    delete process.env.INTERNAL_HTTP_TIMEOUT_MS;

    expect(loadTimeout()).toBe(30_000);
  });

  it('acepta un timeout explicito dentro del rango seguro', () => {
    process.env.INTERNAL_HTTP_TIMEOUT_MS = '45000';

    expect(loadTimeout()).toBe(45_000);
  });

  it.each(['0', '-1', '999', '120001', 'invalido', '30000.5'])(
    'rechaza el valor inseguro o invalido %s',
    (value) => {
      process.env.INTERNAL_HTTP_TIMEOUT_MS = value;

      expect(loadTimeout()).toBe(30_000);
    },
  );
});
