import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HelperService } from '../servicios/helper';
import { LoginService } from '../http/login.service';
import { COOKIE_AUTH } from '../../environments/environment';

export const loginGuard: CanActivateFn = async () => {
  const helper = inject(HelperService);
  const login = inject(LoginService);
  const router = inject(Router);
  const token = helper.token;
  const accessExpiry = token?.accessTokenExpiresAt ? new Date(token.accessTokenExpiresAt).getTime() : 0;
  const refreshExpiry = token?.refreshTokenExpiresAt ? new Date(token.refreshTokenExpiresAt).getTime() : 0;
  if (COOKIE_AUTH) {
    // La cookie HttpOnly no debe revivir por sí sola una identidad que el
    // usuario ya quitó del dispositivo. El marcador local se conserva tras
    // una recarga normal y se elimina al cerrar o cambiar la sesión.
    if (!token) {
      return router.createUrlTree(['/auth']);
    }
    if (helper.accessToken && accessExpiry > Date.now()) {
      return true;
    }
    if (refreshExpiry && refreshExpiry <= Date.now()) {
      helper.removeToken();
      return router.createUrlTree(['/auth']);
    }
    try {
      await login.refreshToken();
      return true;
    } catch {
      helper.removeToken();
      return router.createUrlTree(['/auth']);
    }
  }
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
