import { HttpException } from '@nestjs/common';
import { OauthService } from './oauth.service';

describe('OauthService session security', () => {
  const build = () => {
    const tokens = {
      getToken: jest.fn(),
      getRefreshToken: jest.fn(),
      revokeToken: jest.fn().mockResolvedValue(true),
      revokeUserSessions: jest.fn().mockResolvedValue(true),
    };
    const model = { getModel: jest.fn().mockReturnValue({}) };
    const service = new OauthService(
      model as any,
      {} as any,
      {} as any,
      tokens as any,
    );
    return { service, tokens };
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
});
