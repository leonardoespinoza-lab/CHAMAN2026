import { OauthModel } from './oauth.model';
import * as bcrypt from 'bcrypt';

describe('OauthModel - revalidacion viva de sesiones', () => {
  const users = {
    getByUsername: jest.fn(),
    getSessionEligibility: jest.fn(),
  };
  const clients = {
    getClient: jest.fn(),
  };
  const tokens = {
    getToken: jest.fn(),
    getRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    createToken: jest.fn(),
  };
  let oauthModel: OauthModel;

  const storedToken = () => ({
    accessToken: 'access-a',
    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    refreshToken: 'refresh-a',
    refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    sessionStartedAt: new Date(Date.now() - 1_000).toISOString(),
    sessionLastActivityAt: new Date().toISOString(),
    sessionAbsoluteExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    client: { id: 'client-a' },
    user: {
      _id: 'user-a',
      activo: true,
      permisos: [{ nivel: 'Tenant', idTenant: 'tenant-a' }],
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tokens.revokeToken.mockResolvedValue(true);
    oauthModel = new OauthModel(
      users as any,
      clients as any,
      tokens as any,
    );
  });

  it('reemplaza la copia del token por el usuario vivo al autenticar acceso', async () => {
    tokens.getToken.mockResolvedValue(storedToken());
    users.getSessionEligibility.mockResolvedValue({
      eligible: true,
      user: {
        _id: 'user-a',
        activo: true,
        permisos: [{ nivel: 'Tenant', idTenant: 'tenant-a', rol: 'Lectura' }],
      },
    });

    const token = await oauthModel.getModel().getAccessToken('access-a');

    expect(token).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          permisos: [
            expect.objectContaining({
              rol: 'Lectura',
            }),
          ],
        }),
      }),
    );
    expect(users.getSessionEligibility).toHaveBeenCalledWith('user-a');
  });

  it('revoca y rechaza el token de acceso si el usuario o tenant ya no es elegible', async () => {
    const stored = storedToken();
    tokens.getToken.mockResolvedValue(stored);
    users.getSessionEligibility.mockResolvedValue({
      eligible: false,
      reason: 'tenant_inactive',
    });

    await expect(
      oauthModel.getModel().getAccessToken('access-a'),
    ).resolves.toBeFalsy();
    expect(tokens.revokeToken).toHaveBeenCalledWith(stored);
  });

  it('revoca y rechaza el refresh token antes de emitir una sesion nueva', async () => {
    const stored = storedToken();
    tokens.getRefreshToken.mockResolvedValue(stored);
    users.getSessionEligibility.mockResolvedValue({
      eligible: false,
      reason: 'user_inactive',
    });

    await expect(
      oauthModel.getModel().getRefreshToken('refresh-a'),
    ).resolves.toBe(false);
    expect(tokens.revokeToken).toHaveBeenCalledWith(stored);
  });

  it('mantiene el filtro vivo tambien durante el login con contrasena', async () => {
    users.getByUsername.mockResolvedValue({
      _id: 'user-a',
      activo: true,
      hash: await bcrypt.hash('ClaveA123', 4),
      permisos: [{ nivel: 'Tenant', idTenant: 'tenant-a' }],
    });
    users.getSessionEligibility.mockResolvedValue({
      eligible: false,
      reason: 'tenant_inactive',
    });

    await expect(
      oauthModel
        .getModel()
        .getUser('usuario', 'ClaveA123', { id: 'client-a' } as any),
    ).resolves.toBeFalsy();
    expect(users.getSessionEligibility).toHaveBeenCalledWith('user-a');
  });
});
