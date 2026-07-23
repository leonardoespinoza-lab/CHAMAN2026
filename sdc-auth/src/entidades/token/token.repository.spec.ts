import { TokenRepository } from './token.repository';

describe('TokenRepository - revocacion', () => {
  it('envia solo los identificadores del token al cerrar sesion', async () => {
    const axios = { PUT: jest.fn().mockResolvedValue(true) };
    const repository = new TokenRepository(axios as any);

    await repository.revokeToken({
      _id: 'mongo-id',
      __v: 0,
      accessToken: 'access',
      refreshToken: 'refresh',
      client: { id: 'web' },
      user: { _id: 'user-1' },
    } as any);

    expect(axios.PUT).toHaveBeenCalledWith(expect.any(String), {
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });
});
