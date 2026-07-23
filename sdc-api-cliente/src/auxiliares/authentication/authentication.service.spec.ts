import { AuthenticationService } from './authentication.service';

describe('AuthenticationService login', () => {
  it('conserva el origen al delegar la autenticacion', async () => {
    const repository = {
      login: jest.fn().mockResolvedValue({
        user: {
          activo: true,
          permisos: [{ nivel: 'Productor' }],
        },
      }),
    };
    const service = new AuthenticationService(
      repository as any,
      {} as any,
    );

    await service.login(
      'usuario',
      'clave',
      false,
      '198.51.100.20',
    );

    expect(repository.login).toHaveBeenCalledWith(
      'usuario',
      'clave',
      false,
      '198.51.100.20',
    );
  });

  it('revalida el access token mediante auth en vez de confiar en la copia de datos', async () => {
    const repository = {
      authorization: jest.fn().mockResolvedValue({
        user: {
          activo: true,
          permisos: [{ nivel: 'Productor' }],
        },
      }),
    };
    const tokenService = {
      getByAccessToken: jest.fn(),
    };
    const service = new AuthenticationService(
      repository as any,
      tokenService as any,
    );

    await service.accessToken('access-a');

    expect(repository.authorization).toHaveBeenCalledWith('Bearer access-a');
    expect(tokenService.getByAccessToken).not.toHaveBeenCalled();
  });
});
