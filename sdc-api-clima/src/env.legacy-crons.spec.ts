describe('CLIMA_LEGACY_CRONS_ENABLED', () => {
  const originalFlag = process.env.CLIMA_LEGACY_CRONS_ENABLED;
  const originalEnv = process.env.ENV;

  afterEach(() => {
    if (originalFlag === undefined)
      delete process.env.CLIMA_LEGACY_CRONS_ENABLED;
    else process.env.CLIMA_LEGACY_CRONS_ENABLED = originalFlag;
    if (originalEnv === undefined) delete process.env.ENV;
    else process.env.ENV = originalEnv;
    jest.resetModules();
  });

  function loadFlag(): boolean {
    let enabled = false;
    jest.isolateModules(() => {
      enabled = require('./env').CLIMA_LEGACY_CRONS_ENABLED;
    });
    return enabled;
  }

  it('preserva los cron existentes salvo opt-out explicito', () => {
    delete process.env.CLIMA_LEGACY_CRONS_ENABLED;
    process.env.ENV = 'local';
    expect(loadFlag()).toBe(true);

    jest.resetModules();
    process.env.CLIMA_LEGACY_CRONS_ENABLED = 'false';
    expect(loadFlag()).toBe(false);
  });

  it('falla cerrado ante espacios, mayusculas o un valor desconocido', () => {
    process.env.ENV = 'local';
    process.env.CLIMA_LEGACY_CRONS_ENABLED = ' FALSE ';
    expect(loadFlag()).toBe(false);

    jest.resetModules();
    process.env.CLIMA_LEGACY_CRONS_ENABLED = 'habilitado';
    expect(loadFlag()).toBe(false);
  });

  it('nunca ejecuta los cron durante tests', () => {
    process.env.CLIMA_LEGACY_CRONS_ENABLED = 'true';
    process.env.ENV = 'test';
    expect(loadFlag()).toBe(false);
  });
});
