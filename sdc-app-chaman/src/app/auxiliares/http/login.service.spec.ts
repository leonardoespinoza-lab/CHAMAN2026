import { of, throwError } from 'rxjs';
import { LoginService } from './login.service';

describe('LoginService', () => {
  const createService = (loginResult: 'success' | 'error') => {
    const token = {
      accessToken: 'nuevo-access',
      refreshToken: 'nuevo-refresh',
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const http = {
      post: jasmine.createSpy('post').and.callFake((url: string) => {
        if (url.endsWith('/auth/logout')) {
          return of({ revoked: true });
        }
        return loginResult === 'success'
          ? of(token)
          : throwError(() => ({ status: 401, error: { message: 'Credenciales invalidas' } }));
      }),
    };
    const helper = {
      token: { accessToken: 'admin-anterior' },
      permiso: { nivel: 'Admin', rol: 'Admin' },
      numeroPermiso: 0,
      refreshToken: 'refresh-anterior',
      setToken: jasmine.createSpy('setToken'),
      removeToken: jasmine.createSpy('removeToken'),
      removePermiso: jasmine.createSpy('removePermiso'),
      removeNumeroPermiso: jasmine.createSpy('removeNumeroPermiso'),
    };

    return {
      service: new LoginService(http as any, helper as any),
      http,
      helper,
      token,
    };
  };

  it('elimina la identidad anterior aunque el nuevo login falle', async () => {
    const { service, http, helper } = createService('error');

    await expectAsync(service.login('productor', 'incorrecta')).toBeRejected();

    expect(http.post.calls.argsFor(0)[0]).toContain('/auth/logout');
    expect(http.post.calls.argsFor(1)[0]).toContain('/auth/login');
    expect(helper.removeToken).toHaveBeenCalled();
    expect(helper.removePermiso).toHaveBeenCalled();
    expect(helper.removeNumeroPermiso).toHaveBeenCalled();
    expect(helper.setToken).not.toHaveBeenCalled();
  });

  it('revoca la sesion anterior antes de guardar la nueva identidad', async () => {
    const { service, http, helper, token } = createService('success');

    await expectAsync(service.login('productor', 'correcta', true)).toBeResolvedTo(token as any);

    expect(http.post.calls.argsFor(0)[0]).toContain('/auth/logout');
    expect(http.post.calls.argsFor(1)[0]).toContain('/auth/login');
    expect(helper.setToken).toHaveBeenCalledWith(token, true);
  });
});
