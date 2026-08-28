import { FieldClimateRepository, Token } from './repository';

describe('FieldClimateRepository - cache de credenciales', () => {
  it('fuerza un login nuevo cuando cambia la password del mismo usuario', async () => {
    const repository = new FieldClimateRepository({} as any);
    const token = (): Token => ({
      access_token: 'token',
      expires_in: 3600,
      refresh_token: 'refresh',
      scope: 'all',
      token_type: 'bearer',
      expires_at: Date.now() + 3600_000,
    });
    const login = jest
      .spyOn(repository, 'login')
      .mockImplementation(async (username: string, password: string) => {
        const nextToken = token();
        (repository as any).token[username] = {
          ...nextToken,
          credentialsFingerprint: (repository as any).credentialsFingerprint(
            username,
            password,
          ),
        };
        return nextToken;
      });

    await (repository as any).validarToken('usuario', 'password-anterior');
    await (repository as any).validarToken('usuario', 'password-anterior');
    await (repository as any).validarToken('usuario', 'password-nuevo');

    expect(login).toHaveBeenCalledTimes(2);
    expect(login).toHaveBeenNthCalledWith(1, 'usuario', 'password-anterior');
    expect(login).toHaveBeenNthCalledWith(2, 'usuario', 'password-nuevo');
  });
});
