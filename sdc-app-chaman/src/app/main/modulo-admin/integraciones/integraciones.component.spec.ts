import { TestBed } from '@angular/core/testing';
import { ApiClientView, API_SERVICE_CATALOG, API_PENDING_SERVICES, API_SERVICES } from 'modelos/src';
import { IntegrationAdminService } from '../../../auxiliares/http/integration-admin.service';
import { IntegracionesAdminComponent } from './integraciones.component';
import { integrationInstructions } from './instructions';

const client = (): ApiClientView => ({
  id: 'example',
  name: 'Cliente ejemplo',
  environment: 'testing',
  advisorUserId: 'a'.repeat(24),
  permissionIndex: 0,
  enabled: false,
  expiresAt: '2099-01-01T00:00:00.000Z',
  requestsPerMinute: 60,
  maxSowingAgeDays: 366,
  limits: { productores: 50, establecimientos: 50, lotes: 50 },
  scopes: ['fenologia:leer', 'estructura:leer'],
  revision: 1,
  keys: [],
  audit: [],
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
});
const list = () => ({
  items: [client()],
  truncated: false,
  environment: 'testing',
  registrySource: 'database',
  apiEnabled: false,
  services: [],
  serviceCatalog: API_SERVICE_CATALOG,
  baseUrl: 'https://example.invalid/integraciones/v1',
});
describe('Integration admin panel', () => {
  let api: any;
  beforeEach(() => {
    api = {
      list: jasmine.createSpy().and.resolveTo(list()),
      usage: jasmine.createSpy().and.resolveTo({ rows: [], lastRequestAt: null, retentionDays: 90 }),
      operator: jasmine.createSpy().and.resolveTo({
        id: 'a'.repeat(24),
        username: 'example',
        permissions: [{ index: 0, nivel: 'Asesor', rol: 'Admin' }],
      }),
      create: jasmine.createSpy().and.resolveTo(client()),
      update: jasmine.createSpy().and.resolveTo(client()),
    };
    TestBed.configureTestingModule({
      imports: [IntegracionesAdminComponent],
      providers: [{ provide: IntegrationAdminService, useValue: api }],
    });
  });
  it('renders clients and a disabled-environment notice without changing state', async () => {
    const f = TestBed.createComponent(IntegracionesAdminComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Cliente ejemplo');
    expect(f.nativeElement.textContent).toContain('aún no están habilitadas');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });
  it('starts with 50/50/50, no expiry invented, no automatic credential', () => {
    const c = new IntegracionesAdminComponent(api);
    c.start();
    expect(c.form.limits).toEqual({ productores: 50, establecimientos: 50, lotes: 50 });
    expect(c.form.enabled).toBeFalse();
    expect(c.expiry).toBe('');
    expect(c.secret).toBe('');
    expect(c.form.requestedServices).toBeUndefined();
  });
  it('preserves the selected client and operator while editing and does not mutate the list', () => {
    const c = new IntegracionesAdminComponent(api);
    const saved = client();
    c.start(saved);
    c.form.limits.lotes = 100;
    c.toggle('estructura:crear', true);
    expect(saved.limits.lotes).toBe(50);
    expect(saved.scopes).not.toContain('estructura:crear');
    expect(c.form.advisorUserId).toBe(saved.advisorUserId);
  });
  it('requires expiry and verified account before saving', async () => {
    const c = new IntegracionesAdminComponent(api);
    c.start();
    await c.save();
    expect(api.create).not.toHaveBeenCalled();
    expect(c.error).toContain('vencimiento');
  });
  it('preserves exact expiry when changing only quotas or services', async () => {
    const c = new IntegracionesAdminComponent(api);
    const saved = { ...client(), expiresAt: '2099-10-12T14:47:21.169Z' };
    c.start(saved);
    c.form.limits.lotes = 75;
    await c.save();
    const settings = api.update.calls.mostRecent().args[2];
    expect(settings.expiresAt).toBe(saved.expiresAt);
    expect(settings.limits.lotes).toBe(75);
    expect(saved.expiresAt).toBe('2099-10-12T14:47:21.169Z');
  });
  it('converts an intentionally edited local expiry to UTC', async () => {
    const c = new IntegracionesAdminComponent(api);
    c.start({ ...client(), expiresAt: '2099-10-12T14:47:21.169Z' });
    c.expiry = '2099-11-02T16:30';
    await c.save();
    expect(api.update.calls.mostRecent().args[2].expiresAt).toBe(new Date('2099-11-02T16:30').toISOString());
  });
  it('sets the explicitly chosen expiry for a new registration', async () => {
    const c = new IntegracionesAdminComponent(api);
    c.start();
    Object.assign(c.form, { id: 'new-client', name: 'Nuevo cliente', advisorUserId: 'a'.repeat(24) });
    c.expiry = '2099-11-02T16:30';
    await c.save();
    expect(api.create.calls.mostRecent().args[0].expiresAt).toBe(new Date('2099-11-02T16:30').toISOString());
    expect(api.update).not.toHaveBeenCalled();
  });
  it('does not call an active configuration live when environment or keys are missing', () => {
    const c = new IntegracionesAdminComponent(api);
    c.data = list() as any;
    const saved = { ...client(), enabled: true };
    expect(c.status(saved)).toBe('Sin clave vigente');
    saved.keys = [{ id: 'key', expiresAt: saved.expiresAt }];
    expect(c.status(saved)).toBe('Pendiente de habilitación técnica');
  });
  it('removes one-time secrets on selection change and component destruction', () => {
    const c = new IntegracionesAdminComponent(api);
    c.secret = 'fixture';
    c.start(client());
    expect(c.secret).toBe('');
    c.secret = 'fixture';
    c.ngOnDestroy();
    expect(c.secret).toBe('');
  });
  it('produces scoped instructions without secret hashes, unsupported services or enabled claims', () => {
    const saved: any = {
      ...client(),
      secret: 'do-not-print',
      keys: [{ id: 'key', expiresAt: client().expiresAt, sha256: 'private-hash' }],
    };
    const text = integrationInstructions(saved, list().baseUrl, false);
    expect(text).toContain('GET /siembras/{idExterno}/fenologia');
    expect(text).not.toContain('PUT /productores');
    expect(text).not.toContain('do-not-print');
    expect(text).not.toContain('private-hash');
    expect(text).toContain('pendiente, suspendido');
    expect(text).toContain('NO envía webhooks');
  });
  it('opens the edit form without duplicate controls or unbound inputs', async () => {
    const f = TestBed.createComponent(IntegracionesAdminComponent);
    f.detectChanges();
    await f.whenStable();
    f.componentInstance.start(client());
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('input[name="id"]').disabled).toBeTrue();
    expect(f.nativeElement.querySelectorAll('input[type="checkbox"]').length).toBe(
      API_SERVICES.length + API_PENDING_SERVICES.length + 1
    );
    expect(f.nativeElement.textContent).toContain('Instructivo del cliente');
  });
  it('renders every service, including meteorological history and forecast as separate choices', async () => {
    const f = TestBed.createComponent(IntegracionesAdminComponent);
    f.detectChanges();
    await f.whenStable();
    f.componentInstance.start(client());
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelectorAll('.service-card').length).toBe(API_SERVICE_CATALOG.length);
    expect(f.nativeElement.querySelector('[data-service="clima-historico"] input[type="checkbox"]')).not.toBeNull();
    expect(f.nativeElement.querySelector('[data-service="clima-pronostico"] input[type="checkbox"]')).not.toBeNull();
    expect(f.nativeElement.textContent).toContain('Pendiente de conexión API');
  });
  it('requests services independently, preserves saved clients and never grants runtime scopes', async () => {
    const c = new IntegracionesAdminComponent(api);
    c.data = list() as any;
    const saved = { ...client(), requestedServices: ['malezas'] as const };
    c.start(saved as any);
    c.requestService('clima-historico', true);
    c.requestService('clima-historico', true);
    c.requestService('clima-pronostico', true);
    c.requestService('private', true);
    expect(c.form.requestedServices).toEqual(['malezas', 'clima-historico', 'clima-pronostico']);
    expect(saved.requestedServices).toEqual(['malezas']);
    expect(c.form.scopes).toEqual(saved.scopes);
    c.serviceSearch = 'meteorológico';
    expect(c.serviceGroups.flatMap((g) => g.items).some((s) => s.codigo === 'clima-historico')).toBeTrue();
    expect(c.form.requestedServices).toContain('malezas');
    await c.save();
    expect(api.update.calls.mostRecent().args[2].requestedServices).toEqual([
      'malezas',
      'clima-historico',
      'clima-pronostico',
    ]);
  });
  it('does not promise pending services in client instructions or silently grant them on upgrade', () => {
    const saved = { ...client(), requestedServices: ['malezas', 'riego'] as any };
    const text = integrationInstructions(saved, list().baseUrl, false);
    expect(text).not.toContain('/malezas');
    expect(text).not.toContain('/riego');
    expect(text).not.toContain('Predicción de nacimiento');
    const c = new IntegracionesAdminComponent(api);
    c.start(client());
    c.requestService('malezas', true);
    expect(c.form.requestedServices).toBeUndefined();
    expect(c.form.scopes).toEqual(client().scopes);
  });
});
