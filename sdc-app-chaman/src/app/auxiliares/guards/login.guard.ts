import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HelperService } from '../servicios/helper';
import { LoginService } from '../http/login.service';

export const loginGuard: CanActivateFn = async () => {
  const helper = inject(HelperService);
  const login = inject(LoginService);
  const router = inject(Router);
  const token = helper.token;
  const accessExpiry = token?.accessTokenExpiresAt ? new Date(token.accessTokenExpiresAt).getTime() : 0;
  const refreshExpiry = token?.refreshTokenExpiresAt ? new Date(token.refreshTokenExpiresAt).getTime() : 0;
  if (token?.accessToken && accessExpiry > Date.now()) {
    return true;
  }
  if (token?.refreshToken && refreshExpiry > Date.now()) {
    try {
      await login.refreshToken();
      return true;
    } catch {
      helper.removeToken();
    }
  } else {
    helper.removeToken();
  }
  return router.createUrlTree(['/auth']);
};
