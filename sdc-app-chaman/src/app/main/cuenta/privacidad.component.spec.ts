import { PrivacidadComponent } from './privacidad.component';

describe('Account deletion request screen', () => {
  let component: PrivacidadComponent;
  let http: any;
  const ticket = {
    _id: '1234567890abcdef12345678',
    status: 'pending',
    requestedAt: '2026-09-07',
    respondBy: '2026-10-07',
  };
  beforeEach(() => {
    http = { get: jasmine.createSpy().and.resolveTo(null), post: jasmine.createSpy().and.resolveTo(ticket) };
    component = new PrivacidadComponent(http, { permiso: { nivel: 'Productor', rol: 'Lectura' } } as any);
  });
  it('loads own status and never preselects confirmation', async () => {
    await component.load();
    expect(component.loaded).toBeTrue();
    expect(component.confirmation).toBe('');
    expect(component.isAdmin).toBeFalse();
  });
  it('requires explicit confirmation and a successful initial query', async () => {
    await component.submit();
    component.confirmation = 'ELIMINAR MI CUENTA';
    await component.submit();
    expect(http.post).not.toHaveBeenCalled();
  });
  it('shows success only after a valid persisted receipt', async () => {
    await component.load();
    component.confirmation = 'ELIMINAR MI CUENTA';
    await component.submit();
    expect(http.post).toHaveBeenCalledWith('/cuenta/privacidad/eliminacion', { confirmacion: 'ELIMINAR MI CUENTA' });
    expect(component.ticket).toEqual(ticket as any);
    await component.submit();
    expect(http.post).toHaveBeenCalledTimes(1);
  });
  it('does not show success for malformed receipts or request errors', async () => {
    await component.load();
    http.post.and.resolveTo({});
    component.confirmation = 'ELIMINAR MI CUENTA';
    await component.submit();
    expect(component.ticket).toBeNull();
    expect(component.error).not.toBe('');
    expect(component.sending).toBeFalse();
  });
  it('allows retry after a failed initial query', async () => {
    http.get.and.rejectWith(new Error('offline'));
    await component.load();
    expect(component.loaded).toBeFalse();
    http.get.and.resolveTo(ticket);
    await component.load();
    expect(component.ticket).toEqual(ticket as any);
  });
});
