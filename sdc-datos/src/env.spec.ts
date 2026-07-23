describe('database index policy', () => {
  const original = process.env.DB_AUTO_INDEX_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DB_AUTO_INDEX_ENABLED;
    } else {
      process.env.DB_AUTO_INDEX_ENABLED = original;
    }
    jest.resetModules();
  });

  it('does not synchronize schema indexes unless explicitly enabled', () => {
    delete process.env.DB_AUTO_INDEX_ENABLED;
    jest.resetModules();

    const { DB_OPTIONS } = require('./env');

    expect(DB_OPTIONS.autoIndex).toBe(false);
  });

  it('allows an explicit local or test opt-in', () => {
    process.env.DB_AUTO_INDEX_ENABLED = 'true';
    jest.resetModules();

    const { DB_OPTIONS } = require('./env');

    expect(DB_OPTIONS.autoIndex).toBe(true);
  });
});
