import { HttpException, UnauthorizedException } from '@nestjs/common';
import { OAuthError } from '@node-oauth/oauth2-server';
import { OauthService } from './oauth.service';

describe('OauthService session security', () => {
  const build = () => {
    const tokens = {
      getToken: jest.fn(),
      getRefreshToken: jest.fn(),
      revokeToken: jest.fn().mockResolvedValue(true),
      revokeUserSessions: jest.fn().mockResolvedValue(true),
    };
    const model = {
      getModel: jest.fn().mockReturnValue({}),
      setDynamicTTL: jest.fn(),
      clearDynamicTTL: jest.fn(),
    };
    const users = {
      getSessionEligibility: jest.fn().mockResolvedValue({
        eligible: true,
        user: { _id: 'user-a' },
      }),
    };
    const service = new OauthService(
      model as any,
      users as any,
      {} as any,
      tokens as any,
    );
    return { service, tokens, users };
  };

  it('usa TTL uniforme de una hora y refresh de siete dias', () => {
    const { service } = build();
    expect((service as any).getClientWithTTL(false).accessTokenLifetime).toBe(3600);
    expect((service as any).getClientWithTTL(true).refreshTokenLifetime).toBe(604800);
  });

  it('revoca el token de acceso al cerrar sesion', async () => {
    const { service, tokens } = build();
    const token = { accessToken: 'access' };
    tokens.getToken.mockResolvedValue(token);
    await expect(service.logout('access')).resolves.toBe(true);
    expect(tokens.revokeToken).toHaveBeenCalledWith(token);
  });

  it('bloquea una cuenta despues del maximo de intentos fallidos', () => {
    const { service } = build();
    for (let i = 0; i < 5; i += 1) {
      (service as any).recordFailedLogin('usuario');
    }
    expect(() => (service as any).assertLoginAllowed('usuario')).toThrow(HttpException);
  });

  it('limita por cuenta y origen sin bloquear el mismo usuario en otra red', () => {
    const { service } = build();
    const first = (service as any).loginAttemptKey('usuario', {
      headers: { 'x-forwarded-for': '192.0.2.10' },
    });
    const second = (service as any).loginAttemptKey('usuario', {
      headers: { 'x-forwarded-for': '192.0.2.11' },
    });

    for (let i = 0; i < 5; i += 1) {
      (service as any).recordFailedLogin(first);
    }

    expect(() => (service as any).assertLoginAllowed(first)).toThrow(
      HttpException,
    );
    expect(() =>
      (service as any).assertLoginAllowed(second),
    ).not.toThrow();
  });

  it('prioriza el origen interno reenviado por el gateway', () => {
    const { service } = build();
    const key = (service as any).loginAttemptKey('usuario', {
      headers: {
        'x-chaman-login-origin': '198.51.100.20',
        'x-forwarded-for': '10.0.0.5',
      },
      ip: '10.0.0.6',
    });

    expect(key).toBe('usuario|198.51.100.20');
  });

  it('mantiene acotado el registro en memoria de intentos', () => {
    const { service } = build();
    (service as any).loginAttemptsMaxEntries = 100;

    for (let i = 0; i < 101; i += 1) {
      (service as any).recordFailedLogin(`usuario-${i}|192.0.2.1`);
    }

    expect((service as any).loginAttempts.size).toBe(100);
    expect(
      (service as any).loginAttempts.has('usuario-0|192.0.2.1'),
    ).toBe(false);
  });

  it('cuenta una sola vez un login OAuth fallido', async () => {
    const { service } = build();
    const invalidGrant = new OAuthError('credenciales invalidas', {
      name: 'invalid_grant',
      code: 400,
    });
    (service as any).oauth.token = jest
      .fn()
      .mockRejectedValue(invalidGrant);
    const record = jest.spyOn(service as any, 'recordFailedLogin');
    const validate = jest.spyOn(service, 'validate_password');

    await expect(
      service.login(
        {
          headers: {
            'x-chaman-login-origin': '198.51.100.20',
          },
          body: {},
          query: {},
          method: 'POST',
        } as any,
        {} as any,
        {
          grant_type: 'password',
          username: 'usuario',
          password: 'incorrecta',
        },
      ),
    ).rejects.toBe(invalidGrant);

    expect(record).toHaveBeenCalledTimes(1);
    expect(validate).not.toHaveBeenCalled();
  });

  it('rechaza el acceso social de un usuario desactivado o archivado', async () => {
    const { service } = build();
    await expect(
      (service as any).assertSocialUserEligible({ activo: false }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      (service as any).assertSocialUserEligible({ archivado: true }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza el acceso social cuando el tenant vivo ya no esta activo', async () => {
    const { service, users } = build();
    users.getSessionEligibility.mockResolvedValue({
      eligible: false,
      reason: 'tenant_inactive',
    });

    await expect(
      (service as any).assertSocialUserEligible({
        _id: 'user-a',
        activo: true,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
