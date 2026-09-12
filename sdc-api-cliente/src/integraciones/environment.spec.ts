import { IntegrationClient, hash, resourceId } from './contract';
import { IntegrationRegistry } from './registry';
import { IntegrationRuntime } from './runtime';
import { IntegrationsController } from './controller';

describe('Integration environment boundary', () => {
  const original = { ...process.env };
  const testKey = 'chm_test_environment_key.' + 'a'.repeat(43);
  const liveKey = 'chm_live_environment_key.' + 'a'.repeat(43);
  const fixture = (
    environment?: 'testing' | 'production',
    credential = testKey,
  ): IntegrationClient => ({
    id: 'environment-fixture',
    name: 'Fixture',
    environment,
    limits: { productores: 50, establecimientos: 50, lotes: 50 },
    maxSowingAgeDays: 366,
    advisorUserId: 'a'.repeat(24),
    permissionIndex: 0,
    enabled: true,
    expiresAt: '2099-01-01',
    requestsPerMinute: 60,
    scopes: ['estructura:leer', 'fenologia:leer'],
    keys: [
      {
        id: 'environment_key',
        sha256: hash(credential),
        expiresAt: '2099-01-01',
      },
    ],
  });
  const setup = (env: string, client: IntegrationClient) => {
    process.env.ENV = env;
    process.env.CHAMAN_INTEGRATIONS_ENABLED = 'true';
    process.env.CHAMAN_INTEGRATIONS_CLIENTS = JSON.stringify([client]);
  };
  beforeEach(() => {
    delete process.env.CHAMAN_INTEGRATIONS_PRODUCTION_ENABLED;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  test.each(['production', 'testing', 'unknown'])(
    'is off by default in %s, even with malformed registry',
    (env) => {
      process.env.ENV = env;
      delete process.env.CHAMAN_INTEGRATIONS_ENABLED;
      process.env.CHAMAN_INTEGRATIONS_CLIENTS = 'malformed';
      const registry = new IntegrationRegistry();
      expect(() => registry.authenticate(liveKey)).toThrow(
        expect.objectContaining({ status: 404 }),
      );
    },
  );
  test('requires both explicit live activation and an explicitly live registry', () => {
    setup('production', fixture('production', liveKey));
    expect(() => new IntegrationRegistry()).toThrow('explicit activation');
    process.env.CHAMAN_INTEGRATIONS_PRODUCTION_ENABLED = 'true';
    const registry = new IntegrationRegistry();
    expect(registry.authenticate(liveKey).environment).toBe('production');
    expect(() => registry.authenticate(testKey)).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    for (const environment of [undefined, 'testing'] as const) {
      setup('production', fixture(environment, liveKey));
      expect(() => new IntegrationRegistry()).toThrow(
        'Invalid integration registry',
      );
    }
  });
  test('a copied sandbox key hash cannot authenticate in Production', () => {
    setup('production', fixture('production', testKey));
    process.env.CHAMAN_INTEGRATIONS_PRODUCTION_ENABLED = 'true';
    const registry = new IntegrationRegistry();
    expect(() => registry.authenticate(testKey)).toThrow();
    expect(() => registry.authenticate(liveKey)).toThrow();
  });
  test('Production requires explicit valid editable capacity and bounded history', () => {
    process.env.CHAMAN_INTEGRATIONS_PRODUCTION_ENABLED = 'true';
    for (const override of [
      { limits: undefined },
      { limits: { productores: 50 } },
      { limits: { productores: -1, establecimientos: 50, lotes: 50 } },
      { limits: { productores: 50, establecimientos: 50, lotes: '50' } },
      { maxSowingAgeDays: undefined },
      { maxSowingAgeDays: 367 },
      { maxSowingAgeDays: 0 },
    ]) {
      setup('production', {
        ...fixture('production', liveKey),
        ...override,
      } as any);
      expect(() => new IntegrationRegistry()).toThrow(
        'Invalid integration registry',
      );
    }
    setup('production', fixture('production', liveKey));
    expect(new IntegrationRegistry().authenticate(liveKey).limits).toEqual({
      productores: 50,
      establecimientos: 50,
      lotes: 50,
    });
  });
  test('sandbox remains backward compatible but rejects live entries and live keys', () => {
    setup('test', fixture());
    const registry = new IntegrationRegistry();
    const client = registry.authenticate(testKey);
    expect(client.environment).toBe('testing');
    expect(resourceId(client, 'lotes', 'l1')).toBe(
      resourceId(fixture(), 'lotes', 'l1'),
    );
    client.enabled = false;
    expect(registry.authenticate(testKey).enabled).toBe(true);
    expect(() => registry.authenticate(liveKey)).toThrow();
    setup('testing', fixture('production', liveKey));
    expect(() => new IntegrationRegistry()).toThrow();
  });
  test.each(['staging', '', 'prod'])(
    'rejects unknown ENV %s when enabled',
    (env) => {
      setup(env, fixture());
      expect(() => new IntegrationRegistry()).toThrow(
        'Unsupported integration environment',
      );
    },
  );
  test('separates live Redis counters and write leases from sandbox during rolling updates', async () => {
    const keys: string[] = [];
    const values = new Map<string, string>();
    const redis: any = {
      eval: jest.fn(async (_script, _count, key) => {
        keys.push(key);
        return 1;
      }),
      set: jest.fn(async (key, owner) => {
        keys.push(key);
        values.set(key, owner);
        return 'OK';
      }),
      get: jest.fn(async (key) => values.get(key)),
      disconnect: jest.fn(),
    };
    for (const env of ['testing', 'production']) {
      process.env.ENV = env;
      const runtime = new IntegrationRuntime();
      (runtime as any).redis = redis;
      await runtime.rateLimit('same-id', 60);
      await runtime.exclusive('same-id', async (held) => {
        await held();
      });
      runtime.onModuleDestroy();
    }
    expect(keys).toEqual(
      expect.arrayContaining([
        'integrations:v1:rate:same-id',
        'integrations:v1:write:same-id',
        'integrations:production:v1:rate:same-id',
        'integrations:production:v1:write:same-id',
      ]),
    );
  });
  test('service discovery reports only effective operations and the real environment', () => {
    const controller = new IntegrationsController({} as any);
    const ctx: any = {
      client: fixture('production', liveKey),
      permission: { rol: 'Lectura', modulos: { EtapasFenologicas: false } },
    };
    const res: any = { locals: { integration: ctx } };
    expect(controller.services(res)).toMatchObject({
      entorno: 'production',
      servicios: [{ codigo: 'estructura', operaciones: ['consultar'] }],
    });
    ctx.client.scopes = ['fenologia:leer'];
    expect(controller.services(res).servicios).toEqual([]);
    ctx.permission.modulos.EtapasFenologicas = true;
    expect(controller.services(res).servicios).toEqual([
      { codigo: 'fenologia', operaciones: ['consultar'] },
    ]);
  });
});
