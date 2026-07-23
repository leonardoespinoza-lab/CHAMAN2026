import { ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { IToken } from 'modelos/src';
import { PREFIX_PATH } from '../../env';

export const COOKIE_SESSION_HEADER = 'cookie-v1';
export const REFRESH_COOKIE = '__Secure-chaman-rt';
const REMEMBER_COOKIE = '__Secure-chaman-rm';

export const COOKIE_AUTH_ENABLED =
  process.env.COOKIE_AUTH_ENABLED === 'true';

type BrowserToken = IToken & {
  csrfToken: string;
  cookieAuth: true;
};

function parseCookies(raw?: string): Record<string, string> {
  return String(raw || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return cookies;
      const name = part.slice(0, separator);
      const value = part.slice(separator + 1);
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function csrfSecret(): string {
  const secret = process.env.SESSION_CSRF_SECRET || '';
  if (COOKIE_AUTH_ENABLED && secret.length < 32) {
    throw new Error(
      'SESSION_CSRF_SECRET debe tener al menos 32 caracteres con COOKIE_AUTH_ENABLED=true',
    );
  }
  return secret;
}

function csrfFor(refreshToken: string): string {
  return createHmac('sha256', csrfSecret())
    .update(refreshToken)
    .digest('base64url');
}

function authPath(): string {
  return PREFIX_PATH ? `/${PREFIX_PATH}/auth` : '/auth';
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    path: authPath(),
    ...(maxAge && maxAge > 0 ? { maxAge } : {}),
  };
}

export function wantsCookieSession(req: Request): boolean {
  return (
    COOKIE_AUTH_ENABLED &&
    req.header('x-chaman-session') === COOKIE_SESSION_HEADER
  );
}

export function refreshCookie(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[REFRESH_COOKIE];
}

export function rememberCookie(req: Request): boolean {
  return parseCookies(req.headers.cookie)[REMEMBER_COOKIE] === '1';
}

export function assertCookieCsrf(
  req: Request,
  refreshToken: string,
): void {
  const supplied = String(req.header('x-csrf-token') || '');
  const expected = csrfFor(refreshToken);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new ForbiddenException('Token CSRF de sesion invalido');
  }
}

export function issueBrowserSession(
  res: Response,
  token: IToken,
  remember: boolean,
): BrowserToken {
  if (!token.refreshToken) {
    throw new Error('El servidor de autenticacion no emitio refresh token');
  }
  const refreshMaxAge = remember && token.refreshTokenExpiresAt
    ? Math.max(0, new Date(token.refreshTokenExpiresAt).getTime() - Date.now())
    : undefined;
  res.cookie(
    REFRESH_COOKIE,
    token.refreshToken,
    cookieOptions(refreshMaxAge),
  );
  res.cookie(
    REMEMBER_COOKIE,
    remember ? '1' : '0',
    cookieOptions(refreshMaxAge),
  );
  return {
    ...token,
    refreshToken: undefined,
    csrfToken: csrfFor(token.refreshToken),
    cookieAuth: true,
  };
}

export function clearBrowserSession(res: Response): void {
  const options = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
  res.clearCookie(REMEMBER_COOKIE, options);
}
