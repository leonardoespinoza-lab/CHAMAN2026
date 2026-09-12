import { Test } from '@nestjs/testing';
import {
  API_SERVICES,
  API_SERVICE_CATALOG,
  API_PENDING_SERVICES,
  API_SERVICE_GROUPS,
  ApiClientRecord,
  apiClientView,
  validApiSettings,
} from 'modelos/src';
import { EventEmitter } from 'events';
import request from 'supertest';
import { IntegrationAdminService } from './admin.service';
import { IntegrationAdminController } from './admin.controller';
import { IntegrationControlStore } from './control-store';
import { IntegrationRegistry } from './registry';
import { hash, SCOPES } from './contract';
import { requestBodyForLog } from '../auxiliares/logRequest/logRequest.interceptor';

const expiresAt = '2099-01-01T00:00:00.000Z';
const settings = {
  name: 'Example',
  enabled: false,
  expiresAt,
  scopes: ['estructura:leer', 'fenologia:leer'] as any,
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
const fixture = (): ApiClientRecord => ({
  ...registration,
  environment: 'testing',
  revision: 1,
  keys: [],
  audit: [],
  createdAt: expiresAt,
  updatedAt: expiresAt,
});

describe('Admin integration control plane', () => {
  const oldEnv = { ...process.env };
  let store: any, users: any, service: IntegrationAdminService;
  beforeEach(() => {
    process.env.ENV = 'testing';
    store = { command: jest.fn(async () => fixture()) };
    users = {
      getById: jest.fn(async () => ({
        activo: true,
        permisos: [{ nivel: 'Asesor', rol: 'Admin' }],
      })),
      getByUsername: jest.fn(async () => ({
        _id: 'a'.repeat(24),
        username: 'example',
        password: 'must-not-leak',
        activo: true,
        permisos: [{ nivel: 'Asesor', rol: 'Admin' }],
      })),
    };
    service = new IntegrationAdminService(store, users);
  });
  afterEach(() => {
    process.env = { ...oldEnv };
  });
  test.each([
    {},
    { nivel: 'Admin', rol: 'Lectura' },
    { nivel: 'Asesor', rol: 'Admin' },
    { nivel: 'Tenant', rol: 'Admin' },
  ])('denies non-global administrator %j', (permission) => {
    expect(() =>
      service.assertAdmin(permission as any, { _id: 'a'.repeat(24) } as any),
    ).toThrow();
  });
  test('permits only a global administrator with identified actor', () => {
    expect(() =>
      service.assertAdmin(
        { nivel: 'Admin', rol: 'Admin' } as any,
        { _id: 'a'.repeat(24) } as any,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertAdmin({ nivel: 'Admin', rol: 'Admin' } as any, {} as any),
    ).toThrow();
  });
  test('registration validates exact shape, quotas, dates and scopes', () => {
    expect(API_SERVICES.map((s) => s.scope)).toEqual([...SCOPES]);
    expect(validApiSettings(registration, true)).toBe(true);
    for (const patch of [
      { advisorUserId: { $ne: null } },
      { permissionIndex: -1 },
      { limits: { ...settings.limits, lotes: '50' } },
      { enabled: 'true' },
      { scopes: ['clima:leer'] },
      { scopes: ['fenologia:leer', 'fenologia:leer'] },
      { expiresAt: '2026-02-30T00:00:00.000Z' },
      { expiresAt: 'tomorrow' },
      { requestsPerMinute: 0 },
      { $set: {} },
      { keys: [] },
    ])
      expect(validApiSettings({ ...registration, ...patch }, true)).toBe(false);
  });
  test('the full catalogue is unique and does not silently add runtime permissions', () => {
    expect(new Set(API_SERVICE_CATALOG.map((s) => s.codigo)).size).toBe(
      API_SERVICE_CATALOG.length,
    );
    expect(
      API_SERVICE_CATALOG.every((s) => API_SERVICE_GROUPS.includes(s.grupo)),
    ).toBe(true);
    for (const code of [
      'malezas',
      'enfermedades',
      'riego',
      'clima-historico',
      'clima-pronostico',
      'satelite',
      'sensores',
      'suelo-perfil',
      'huella-hidrica',
    ])
      expect(API_SERVICE_CATALOG.some((s) => s.codigo === code)).toBe(true);
    expect(
      API_SERVICE_CATALOG.filter((s) => s.estado === 'conectado')
        .map((s) => s.codigo)
        .sort(),
    ).toEqual([...new Set(SCOPES.map((s) => s.split(':')[0]))].sort());
    expect(
      API_PENDING_SERVICES.every(
        (s) => !SCOPES.some((scope) => scope.startsWith(s.codigo + ':')),
      ),
    ).toBe(true);
  });
  test('accepts optional service requests but rejects using them as permissions', () => {
    const requestedServices = API_PENDING_SERVICES.map((s) => s.codigo);
    expect(validApiSettings({ ...registration, requestedServices }, true)).toBe(
      true,
    );
    expect(
      validApiSettings({ ...registration, requestedServices: [] }, true),
    ).toBe(true);
    expect(validApiSettings(registration, true)).toBe(true);
    for (const value of [
      null,
      undefined,
      'malezas',
      ['malezas', 'malezas'],
      ['private'],
      ['fenologia'],
      [{ $ne: null }],
    ])
      expect(
        validApiSettings({ ...registration, requestedServices: value }, true),
      ).toBe(false);
    expect(
      validApiSettings(
        { ...registration, scopes: ['malezas:leer'], requestedServices },
        true,
      ),
    ).toBe(false);
    const projected = apiClientView({ ...fixture(), requestedServices });
    projected.requestedServices!.pop();
    expect(requestedServices.length).toBe(API_PENDING_SERVICES.length);
  });
  test('returns the full catalogue separately from effective permissions and forwards requests to storage', async () => {
    store.command.mockResolvedValueOnce({
      items: [fixture()],
      truncated: false,
    });
    const data = await service.list();
    expect(data.serviceCatalog).toEqual(API_SERVICE_CATALOG);
    expect(data.services.map((s) => s.scope)).toEqual([...SCOPES]);
    await service.create(
      { ...registration, requestedServices: ['malezas', 'clima-historico'] },
      'b'.repeat(24),
    );
    expect(store.command.mock.calls[1][0].data.requestedServices).toEqual([
      'malezas',
      'clima-historico',
    ]);
    expect(store.command.mock.calls[1][0].data.scopes).toEqual(
      registration.scopes,
    );
  });
  test('the operator projection never contains the human password or whole permissions', async () => {
    const result = await service.operator('example');
    expect(Object.keys(result).sort()).toEqual([
      'id',
      'permissions',
      'username',
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    await expect(service.operator({ $ne: '' })).rejects.toThrow();
  });
  test('new registrations are disabled and require an active advisor', async () => {
    await expect(
      service.create({ ...registration, enabled: true }, 'b'.repeat(24)),
    ).rejects.toThrow();
    users.getById.mockResolvedValue({
      activo: true,
      permisos: [{ nivel: 'Productor', rol: 'Admin' }],
    });
    await expect(
      service.create(registration, 'b'.repeat(24)),
    ).rejects.toThrow();
    expect(store.command).not.toHaveBeenCalled();
  });
  test('update cannot replace the operator, keys or immutable client id', async () => {
    for (const field of ['advisorUserId', 'keys', 'id', 'environment'])
      await expect(
        service.update(
          'example',
          { revision: 1, settings: { ...settings, [field]: 'other' } },
          'b'.repeat(24),
        ),
      ).rejects.toThrow();
    expect(store.command).not.toHaveBeenCalled();
  });
  test('one-time credential response stores only a digest and correct environment prefix', async () => {
    store.command.mockImplementation(async (command) =>
      command.action === 'issue-key'
        ? { ...fixture(), keys: [command.key] }
        : fixture(),
    );
    const result = await service.issueKey('example', 1, 'b'.repeat(24));
    const command = store.command.mock.calls[1][0];
    expect(result.credential).toMatch(
      /^chm_test_[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(command.key.sha256).toBe(hash(result.credential));
    expect(JSON.stringify(command)).not.toContain(result.credential);
    expect(JSON.stringify(result.client)).not.toContain(command.key.sha256);
  });
  test('list and printed-data projections cannot leak hashes or internal fields', async () => {
    const record = {
      ...fixture(),
      keys: [{ id: 'testkey', sha256: 'd'.repeat(64), expiresAt }],
      unexpectedPrivate: 'hidden',
    };
    store.command.mockResolvedValue({ items: [record], truncated: false });
    const result = await service.list();
    expect(JSON.stringify(result)).not.toContain('d'.repeat(64));
    expect(JSON.stringify(apiClientView(record))).not.toContain('hidden');
  });
  test('admin bodies are omitted from request logs', () => {
    expect(
      requestBodyForLog('/sdc-quimica/admin/integraciones/example/claves', {
        credential: 'never-log',
        keys: [{ sha256: 'never-log' }],
      }),
    ).toBe('[omitted-integration-admin-payload]');
  });
});

describe('Persisted registry and operational usage', () => {
  const oldEnv = { ...process.env };
  beforeEach(() => {
    process.env.ENV = 'testing';
    process.env.CHAMAN_INTEGRATIONS_ENABLED = 'true';
    process.env.CHAMAN_INTEGRATIONS_ADMIN_ENABLED = 'true';
    process.env.CHAMAN_INTEGRATIONS_REGISTRY_SOURCE = 'database';
  });
  afterEach(() => {
    process.env = { ...oldEnv };
  });
  test('uses current settings on each call, without reviving suspended or revoked keys', async () => {
    const credential = 'chm_test_testkey.' + 'a'.repeat(43);
    let current: any = {
      ...fixture(),
      enabled: true,
      keys: [{ id: 'testkey', sha256: hash(credential), expiresAt }],
    };
    const store: any = {
      command: jest.fn(async () => structuredClone(current)),
    };
    const registry = new IntegrationRegistry(store);
    expect((await registry.authenticateRequest(credential)).limits?.lotes).toBe(
      50,
    );
    current.limits.lotes = 100;
    current.requestedServices = [
      'malezas',
      'clima-historico',
      'clima-pronostico',
    ];
    const authenticated = await registry.authenticateRequest(credential);
    expect(authenticated.scopes).toEqual(settings.scopes);
    expect(authenticated).not.toHaveProperty('requestedServices');
    expect((await registry.authenticateRequest(credential)).limits?.lotes).toBe(
      100,
    );
    current.enabled = false;
    await expect(registry.authenticateRequest(credential)).rejects.toThrow();
    current.enabled = true;
    current.keys = [];
    await expect(registry.authenticateRequest(credential)).rejects.toThrow();
    current = null;
    await expect(registry.authenticateRequest(credential)).rejects.toThrow();
  });
  test('database outage, wrong environment and missing control plane fail closed', async () => {
    const registry = new IntegrationRegistry({
      command: async () => {
        throw new Error('unavailable');
      },
    } as any);
    await expect(
      registry.authenticateRequest('chm_test_testkey.' + 'a'.repeat(43)),
    ).rejects.toThrow();
    await expect(
      registry.authenticateRequest('chm_live_testkey.' + 'a'.repeat(43)),
    ).rejects.toThrow();
    process.env.CHAMAN_INTEGRATIONS_ENABLED = 'false';
    await expect(
      registry.authenticateRequest('chm_test_testkey.' + 'a'.repeat(43)),
    ).rejects.toThrow();
  });
  test('usage is registered before work, finishes once, and has no private payload', async () => {
    const store = new IntegrationControlStore({} as any);
    const spy = jest
      .spyOn(store, 'command')
      .mockResolvedValue({ recorded: true });
    const res: any = new EventEmitter();
    res.statusCode = 429;
    await store.track(
      'example',
      {
        route: { path: '/sdc-quimica-test/integraciones/v1/lotes/:externalId' },
        method: 'PUT',
        body: { private: true },
        headers: { 'x-api-key': 'hidden' },
      },
      res,
    );
    res.emit('finish');
    res.emit('close');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0].operation).toBe('PUT lotes/:externalId');
    expect(spy.mock.calls[1][0].status).toBe(429);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(
      /private|hidden|headers/,
    );
  });
});

describe('Admin HTTP privilege boundary', () => {
  let app: any;
  let service: any;
  beforeAll(async () => {
    service = {
      assertAdmin: IntegrationAdminService.prototype.assertAdmin,
      list: jest.fn(async () => ({ items: [] })),
      operator: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      issueKey: jest.fn(),
      revokeKey: jest.fn(),
      usage: jest.fn(),
    };
    const m = await Test.createTestingModule({
      controllers: [IntegrationAdminController],
      providers: [{ provide: IntegrationAdminService, useValue: service }],
    }).compile();
    app = m.createNestApplication();
    app.use((req: any, res: any, next: any) => {
      if (req.headers.authorization === 'Bearer fixture') {
        res.locals.permiso = {
          nivel: req.headers['x-fixture-level'],
          rol: req.headers['x-fixture-role'],
        };
        res.locals.token = { user: { _id: 'a'.repeat(24) } };
      }
      next();
    });
    await app.init();
  });
  afterAll(async () => app.close());
  test.each(['Asesor', 'Tenant', 'Productor', 'Quimica'])(
    'rejects %s Admin on every administrative route',
    async (level) => {
      for (const [method, url] of [
        ['get', '/admin/integraciones'],
        ['get', '/admin/integraciones/operador'],
        ['post', '/admin/integraciones'],
        ['put', '/admin/integraciones/example'],
        ['post', '/admin/integraciones/example/claves'],
        ['post', '/admin/integraciones/example/claves/key/revocar'],
        ['get', '/admin/integraciones/example/consumo'],
      ])
        await request(app.getHttpServer())
          [method](url)
          .set('Authorization', 'Bearer fixture')
          .set('x-fixture-level', level)
          .set('x-fixture-role', 'Admin')
          .expect(403);
    },
  );
  test('API keys cannot access admin; global admin response is not cacheable', async () => {
    await request(app.getHttpServer())
      .get('/admin/integraciones')
      .set('x-api-key', 'not-a-human-session')
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/integraciones')
      .set('Authorization', 'Bearer fixture')
      .set('x-fixture-level', 'Admin')
      .set('x-fixture-role', 'Lectura')
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/integraciones')
      .set('Authorization', 'Bearer fixture')
      .set('x-fixture-level', 'Admin')
      .set('x-fixture-role', 'Admin')
      .expect('Cache-Control', 'no-store')
      .expect(200);
  });
});
