import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateToken } from './token.inputs';

describe('CreateToken', () => {
  it('acepta la metadata temporal de una sesion emitida por autenticacion', async () => {
    const now = new Date();
    const dto = plainToInstance(CreateToken, {
      accessToken: 'access-token',
      accessTokenExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date(now.getTime() + 120_000).toISOString(),
      sessionStartedAt: now.toISOString(),
      sessionLastActivityAt: now.toISOString(),
      sessionAbsoluteExpiresAt: new Date(
        now.getTime() + 180_000,
      ).toISOString(),
      client: { id: 'client' },
      user: { _id: 'user' },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });
});
