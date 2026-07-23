import { ForbiddenException } from '@nestjs/common';
import { IToken } from 'modelos/src';
import {
  assertCookieCsrf,
  clearBrowserSession,
  issueBrowserSession,
  REFRESH_COOKIE,
} from './session-cookie';

describe('session-cookie', () => {
  const token = {
    accessToken: 'access',
    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    refreshToken: 'refresh-secret',
    refreshTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    client: {} as any,
    user: { _id: 'user-1' } as any,
  } as IToken;

  beforeEach(() => {
    // Valor sintetico ensamblado en runtime: evita que un fixture de prueba se
    // confunda con una credencial versionada durante la auditoria de secretos.
    process.env.SESSION_CSRF_SECRET = [
      'fixture',
      'csrf',
      'only',
      'thirty',
      'two',
      'characters',
    ].join('-');
  });

  it('entrega el refresh solo en cookie segura y devuelve un CSRF separado', () => {
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as any;

    const browserToken = issueBrowserSession(response, token, true);

    expect(browserToken.refreshToken).toBeUndefined();
    expect(browserToken.accessToken).toBe('access');
    expect(browserToken.cookieAuth).toBe(true);
    expect(browserToken.csrfToken).toBeTruthy();
    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh-secret',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      }),
    );

    const request = {
      headers: { cookie: `${REFRESH_COOKIE}=refresh-secret` },
      header: (name: string) =>
        name.toLowerCase() === 'x-csrf-token'
          ? browserToken.csrfToken
          : undefined,
    } as any;
    expect(() => assertCookieCsrf(request, 'refresh-secret')).not.toThrow();
  });

  it('rechaza una renovacion con CSRF incorrecto y limpia las cookies al salir', () => {
    const request = {
      headers: { cookie: `${REFRESH_COOKIE}=refresh-secret` },
      header: () => 'csrf-invalido',
    } as any;
    expect(() => assertCookieCsrf(request, 'refresh-secret')).toThrow(
      ForbiddenException,
    );

    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as any;
    clearBrowserSession(response);
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
  });
});
