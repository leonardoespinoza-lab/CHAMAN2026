import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';

import { loginGuard } from './login.guard';
import { HelperService } from '../servicios/helper';
import { LoginService } from '../http/login.service';

describe('loginGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => loginGuard(...guardParameters));

  const configure = (token: any, refreshResult?: any) => {
    const helper = { token, removeToken: jasmine.createSpy('removeToken') };
    const login = {
      refreshToken: refreshResult instanceof Error
        ? jasmine.createSpy('refreshToken').and.rejectWith(refreshResult)
        : jasmine.createSpy('refreshToken').and.resolveTo(refreshResult),
    };
    const router = { createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue('AUTH_TREE') };
    TestBed.configureTestingModule({ providers: [
      { provide: HelperService, useValue: helper },
      { provide: LoginService, useValue: login },
      { provide: Router, useValue: router },
    ] });
    return { helper, login, router };
  };

  it('acepta un access token vigente sin refrescar', async () => {
    const deps = configure({ accessToken: 'a', accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(await Promise.resolve(executeGuard({} as any, {} as any))).toBe(true);
    expect(deps.login.refreshToken).not.toHaveBeenCalled();
  });

  it('refresca una sola vez cuando access vencio y refresh sigue vigente', async () => {
    const deps = configure({
      accessToken: 'a',
      accessTokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      refreshToken: 'r',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, { accessToken: 'nuevo' });
    expect(await Promise.resolve(executeGuard({} as any, {} as any))).toBe(true);
    expect(deps.login.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('limpia y redirige si la sesion expiro', async () => {
    const deps = configure({
      accessToken: 'a',
      accessTokenExpiresAt: new Date(Date.now() - 2_000).toISOString(),
      refreshToken: 'r',
      refreshTokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(await Promise.resolve(executeGuard({} as any, {} as any))).toBe('AUTH_TREE' as any);
    expect(deps.helper.removeToken).toHaveBeenCalled();
  });
});
