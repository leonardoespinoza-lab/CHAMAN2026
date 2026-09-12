import { TestBed } from '@angular/core/testing';
import { ApiClientView } from 'modelos/src';
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
  baseUrl: 'https://example.invalid/integraciones/v1',
});
describe('Integration admin panel', () => {
  let api: any;
  beforeEach(() => {
    api = {
      list: jasmine.createSpy().and.resolveTo(list()),
      usage: jasmine.createSpy().and.resolveTo({ rows: [], lastRequestAt: null, retentionDays: 90 }),
      operator: jasmine
        .createSpy()
        .and.resolveTo({
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
    expect(f.nativeElement.querySelectorAll('input[type="checkbox"]').length).toBe(5);
    expect(f.nativeElement.textContent).toContain('Instructivo del cliente');
  });
});
