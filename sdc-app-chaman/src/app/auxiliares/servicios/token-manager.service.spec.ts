import { TokenManagerService } from './token-manager.service';

describe('TokenManagerService', () => {
  let service: TokenManagerService;
  let helper: any;
  let login: any;
  let router: any;

  beforeEach(() => {
    helper = {
      token: {
        accessToken: 'access',
        refreshToken: 'refresh',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      removeToken: jasmine.createSpy('removeToken'),
      notifWarn: jasmine.createSpy('notifWarn'),
    };
    login = {
      logout: jasmine.createSpy('logout').and.resolveTo(),
      refreshToken: jasmine.createSpy('refreshToken').and.resolveTo({}),
    };
    router = {
      navigate: jasmine.createSpy('navigate').and.resolveTo(true),
    };
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    service = new TokenManagerService(helper, login, router);
  });

  afterEach(() => service.cleanup());

  it('cierra y limpia una sesion despues de 30 minutos sin actividad', async () => {
    (service as any).lastActivityAt = Date.now() - 31 * 60_000;

    await (service as any).checkTokenExpiry();

    expect(login.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/auth']);
    expect(helper.notifWarn).toHaveBeenCalled();
    expect(login.refreshToken).not.toHaveBeenCalled();
  });

  it('renueva cerca del vencimiento solo cuando la sesion sigue activa', async () => {
    (service as any).lastActivityAt = Date.now();

    await (service as any).checkTokenExpiry();

    expect(login.refreshToken).toHaveBeenCalledTimes(1);
    expect(login.logout).not.toHaveBeenCalled();
  });

  it('mantiene la renovacion proactiva cuando el refresh vive en cookie HttpOnly', async () => {
    helper.token = {
      accessToken: '',
      cookieAuth: true,
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    (service as any).lastActivityAt = Date.now();

    await (service as any).checkTokenExpiry();

    expect(login.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('sincroniza actividad con el servidor antes del vencimiento por inactividad', async () => {
    helper.token.accessTokenExpiresAt = new Date(
      Date.now() + 45 * 60_000
    ).toISOString();
    (service as any).lastActivityAt = Date.now();
    (service as any).lastServerActivitySyncAt = Date.now() - 16 * 60_000;

    await (service as any).checkTokenExpiry();

    expect(login.refreshToken).toHaveBeenCalledTimes(1);
    expect((service as any).lastServerActivitySyncAt).toBeGreaterThan(0);
  });
});
