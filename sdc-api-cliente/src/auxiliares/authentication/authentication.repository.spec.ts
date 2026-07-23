import { AuthenticationRepository } from './authentication.repository';
import { LOGIN_ORIGIN_HEADER } from './login-origin';

describe('AuthenticationRepository login', () => {
  it('reenvia el origen normalizado al servicio Auth', async () => {
    const axios = {
      POST: jest.fn().mockResolvedValue({ accessToken: 'token' }),
    };
    const repository = new AuthenticationRepository(axios as any);

    await repository.login(
      'usuario',
      'clave',
      false,
      '198.51.100.20',
    );

    expect(axios.POST).toHaveBeenCalledWith(
      expect.stringContaining('/oauth/login'),
      expect.stringContaining('grant_type=password'),
      expect.objectContaining({
        headers: expect.objectContaining({
          [LOGIN_ORIGIN_HEADER]: '198.51.100.20',
        }),
      }),
    );
  });
});
