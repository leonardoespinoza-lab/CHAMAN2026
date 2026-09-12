import { IntegrationControlService } from './service';
import { IntegrationControlGuard } from './controller';
import { IntegrationClientSchema, IntegrationUsageSchema } from './module';
import { requestBodyForLog } from '../../auxiliares/logRequest/logRequest.interceptor';

const expiresAt = '2099-01-01T00:00:00.000Z';
const settings = {
  name: 'Example',
  enabled: false,
  expiresAt,
  scopes: ['fenologia:leer'],
  limits: { productores: 50, establecimientos: 50, lotes: 50 },
  requestsPerMinute: 60,
  maxSowingAgeDays: 366,
};
const registration = {
  ...settings,
  id: 'example',
  advisorUserId: 'a'.repeat(24),
  permissionIndex: 0,
};
const fixture = () => ({
  ...registration,
  environment: 'testing',
  revision: 1,
  keys: [],
  createdAt: expiresAt,
  updatedAt: expiresAt,
  audit: [],
});
const query = (value: any) => {
  const q: any = {};
  for (const method of ['sort', 'limit', 'select', 'lean'])
    q[method] = jest.fn(() => q);
  q.exec = jest.fn(async () => value);
  return q;
};

describe('Integration storage isolation, integrity and usage', () => {
  const oldEnv = { ...process.env };
  let clients: any, usage: any, service: IntegrationControlService;
  const command = (extra: any) => ({
    environment: 'testing',
    id: 'example',
    actorId: 'b'.repeat(24),
    ...extra,
  });
  beforeEach(() => {
    process.env.ENV = 'testing';
    clients = {
      find: jest.fn(() => query([])),
      findOne: jest.fn(() => query(fixture())),
      create: jest.fn(async (data) => ({ toObject: () => data })),
      findOneAndUpdate: jest.fn(() => query({ ...fixture(), revision: 2 })),
    };
    usage = {
      updateOne: jest.fn(() => query({ modifiedCount: 1 })),
      aggregate: jest.fn(() => query([])),
      findOne: jest.fn(() => query(null)),
    };
    service = new IntegrationControlService(clients, usage);
  });
  afterEach(() => {
    process.env = { ...oldEnv };
  });
  test('does not accept a different environment or Mongo selectors', async () => {
    await expect(
      service.command(command({ action: 'list', environment: 'production' })),
    ).rejects.toThrow();
    await expect(
      service.command(command({ action: 'get', id: { $ne: '' } })),
    ).rejects.toThrow();
    expect(clients.find).not.toHaveBeenCalled();
    expect(clients.findOne).not.toHaveBeenCalled();
  });
  test('creates only disabled, strictly validated clients with one audit record', async () => {
    const r = await service.command(
      command({ action: 'create', data: registration }),
    );
    expect(r.keys).toEqual([]);
    expect(r.enabled).toBe(false);
    expect(r.revision).toBe(1);
    expect(r.audit[0].actorId).toBe('b'.repeat(24));
    for (const data of [
      { ...registration, enabled: true },
      { ...registration, keys: [] },
      { ...registration, advisorUserId: { $ne: null } },
    ])
      await expect(
        service.command(command({ action: 'create', data })),
      ).rejects.toThrow();
    expect(clients.create).toHaveBeenCalledTimes(1);
  });
  test('requires revision on updates and performs atomic compare-and-swap', async () => {
    await service.command(
      command({
        action: 'update',
        revision: 1,
        data: { ...settings, limits: { ...settings.limits, lotes: 100 } },
      }),
    );
    const [filter, update] = clients.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      id: 'example',
      environment: 'testing',
      revision: 1,
    });
    expect(update.$inc.revision).toBe(1);
    expect(update.$set.limits.lotes).toBe(100);
    expect(update.$set).not.toHaveProperty('advisorUserId');
    expect(update.$push.audit.$slice).toBe(-100);
    await expect(
      service.command(
        command({ action: 'update', revision: 0, data: settings }),
      ),
    ).rejects.toThrow();
    clients.findOneAndUpdate.mockReturnValue(query(null));
    await expect(
      service.command(
        command({ action: 'update', revision: 1, data: settings }),
      ),
    ).rejects.toThrow('cambió');
  });
  test('persists service requests without authorizing them, and preserves them for older admin clients', async () => {
    const requestedServices = [
      'malezas',
      'riego',
      'clima-historico',
      'clima-pronostico',
    ];
    const created = await service.command(
      command({
        action: 'create',
        data: { ...registration, requestedServices },
      }),
    );
    expect(created.requestedServices).toEqual(requestedServices);
    expect(created.scopes).toEqual(settings.scopes);
    await service.command(
      command({
        action: 'update',
        revision: 1,
        data: { ...settings, requestedServices: [] },
      }),
    );
    expect(
      clients.findOneAndUpdate.mock.calls[0][1].$set.requestedServices,
    ).toEqual([]);
    await service.command(
      command({ action: 'update', revision: 1, data: settings }),
    );
    expect(clients.findOneAndUpdate.mock.calls[1][1].$set).not.toHaveProperty(
      'requestedServices',
    );
    for (const requestedServices of [
      ['private'],
      ['riego', 'riego'],
      ['fenologia'],
      'riego',
      null,
    ])
      await expect(
        service.command(
          command({
            action: 'update',
            revision: 1,
            data: { ...settings, requestedServices },
          }),
        ),
      ).rejects.toThrow();
  });
  test('rejects overwrites of ownership, unsupported fields and invalid expiry', async () => {
    for (const data of [
      { ...settings, advisorUserId: 'c'.repeat(24) },
      { ...settings, environment: 'production' },
      { ...settings, expiresAt: '2026-02-30' },
      { ...settings, scopes: ['private:all'] },
    ])
      await expect(
        service.command(command({ action: 'update', revision: 1, data })),
      ).rejects.toThrow();
    expect(clients.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('key creation is bounded by client expiry and three key slots; revoke removes only selected key', async () => {
    const key = { id: 'key-one', sha256: 'c'.repeat(64), expiresAt };
    await service.command(command({ action: 'issue-key', revision: 1, key }));
    expect(clients.findOneAndUpdate.mock.calls[0][1].$set.keys).toEqual([key]);
    await expect(
      service.command(
        command({
          action: 'issue-key',
          revision: 1,
          key: { ...key, expiresAt: '2100-01-01T00:00:00.000Z' },
        }),
      ),
    ).rejects.toThrow();
    clients.findOne.mockReturnValue(
      query({ ...fixture(), keys: [key, { ...key, id: 'key-two' }] }),
    );
    await expect(
      service.command(command({ action: 'issue-key', revision: 1, key })),
    ).rejects.toThrow();
    await service.command(
      command({ action: 'revoke-key', revision: 1, keyId: key.id }),
    );
    expect(
      clients.findOneAndUpdate.mock.calls[1][1].$set.keys.map((k) => k.id),
    ).toEqual(['key-two']);
    clients.findOne.mockReturnValue(
      query({ ...fixture(), keys: [key, key, key] }),
    );
    await expect(
      service.command(command({ action: 'issue-key', revision: 1, key })),
    ).rejects.toThrow();
  });
  test('normalizes database errors without exposing private values', async () => {
    clients.create.mockRejectedValue({ code: 11000, message: 'secret-digest' });
    await expect(
      service.command(command({ action: 'create', data: registration })),
    ).rejects.toMatchObject({ status: 409 });
    clients.create.mockRejectedValue(new Error('secret-digest'));
    await expect(
      service.command(command({ action: 'create', data: registration })),
    ).rejects.toThrow('No se pudo acceder');
  });
  test('usage starts are idempotent and finishes only update an unfinished event', async () => {
    const base = {
      requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      clientId: 'example',
    };
    await service.command(
      command({
        action: 'usage-start',
        ...base,
        startedAt: new Date().toISOString(),
        operation: 'GET siembras/:externalId/fenologia',
      }),
    );
    expect(usage.updateOne.mock.calls[0][1].$setOnInsert.status).toBe(0);
    expect(usage.updateOne.mock.calls[0][2].upsert).toBe(true);
    await service.command(
      command({
        action: 'usage-finish',
        requestId: base.requestId,
        status: 304,
        durationMs: 45,
      }),
    );
    expect(usage.updateOne.mock.calls[1][0]).toEqual({
      environment: 'testing',
      requestId: base.requestId,
      status: 0,
    });
    await expect(
      service.command(
        command({
          action: 'usage-start',
          ...base,
          startedAt: new Date().toISOString(),
          operation: 'GET siembras/private-client-id/fenologia',
        }),
      ),
    ).rejects.toThrow();
  });
  test('usage reports require bounded dates, isolate clients, and do not invent missing history', async () => {
    const to = new Date().toISOString(),
      from = new Date(Date.now() - 30 * 86400000).toISOString();
    const result = await service.command(
      command({ action: 'usage', from, to }),
    );
    expect(result.rows).toEqual([]);
    expect(result.lastRequestAt).toBeNull();
    expect(usage.aggregate.mock.calls[0][0][0].$match).toMatchObject({
      environment: 'testing',
      clientId: 'example',
    });
    await expect(
      service.command(
        command({ action: 'usage', from: '2020-01-01T00:00:00.000Z', to }),
      ),
    ).rejects.toThrow();
  });
  test('schemas isolate operators, key IDs, events and keep bounded usage retention', () => {
    const indexes = IntegrationClientSchema.indexes();
    expect(
      indexes.some(
        ([keys, opts]) =>
          keys.advisorUserId === 1 && keys.environment === 1 && opts.unique,
      ),
    ).toBe(true);
    expect(
      indexes.some(([keys, opts]) => keys['keys.id'] === 1 && opts.unique),
    ).toBe(true);
    expect(
      IntegrationUsageSchema.indexes().some(
        ([keys, opts]) =>
          keys.startedAt === 1 && opts.expireAfterSeconds === 90 * 86400,
      ),
    ).toBe(true);
    expect(IntegrationUsageSchema.path('body')).toBeUndefined();
    expect(IntegrationUsageSchema.path('apiKey')).toBeUndefined();
  });
  test('internal commands redact all payloads', () => {
    expect(
      requestBodyForLog('/datos/internal/integration-control/command', {
        key: { sha256: 'secret' },
      }),
    ).toBe('[omitted-integration-control-payload]');
  });
});

describe('Internal integration control authentication', () => {
  const oldEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...oldEnv };
  });
  const ctx = (token?: any): any => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-integration-control-token': token } }),
    }),
  });
  test('is disabled by default and always requires a strong dedicated internal credential', () => {
    const guard = new IntegrationControlGuard();
    delete process.env.CHAMAN_INTEGRATIONS_ADMIN_ENABLED;
    expect(() => guard.canActivate(ctx())).toThrow();
    process.env.CHAMAN_INTEGRATIONS_ADMIN_ENABLED = 'true';
    delete process.env.CHAMAN_INTEGRATIONS_INTERNAL_TOKEN;
    expect(() => guard.canActivate(ctx())).toThrow();
    process.env.CHAMAN_INTEGRATIONS_INTERNAL_TOKEN = 'a'.repeat(40);
    expect(() => guard.canActivate(ctx('b'.repeat(40)))).toThrow();
    expect(() => guard.canActivate(ctx(['a'.repeat(40)]))).toThrow();
    expect(guard.canActivate(ctx('a'.repeat(40)))).toBe(true);
  });
});
