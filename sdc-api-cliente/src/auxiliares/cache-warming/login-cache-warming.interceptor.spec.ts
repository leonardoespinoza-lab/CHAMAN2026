import { lastValueFrom, of } from 'rxjs';
import { LoginCacheWarmingInterceptor } from './login-cache-warming.interceptor';

describe('LoginCacheWarmingInterceptor', () => {
  const response = {
    user: {
      _id: 'usuario-1',
      permisos: [{ nivel: 'Productor' }],
    },
  };

  const context = (url: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ url }),
      }),
    }) as any;

  it('no activa la precarga en refresh_token', async () => {
    const warming = {
      warmTilesForUserLogin: jest.fn().mockResolvedValue(undefined),
    };
    const interceptor = new LoginCacheWarmingInterceptor(warming as any);

    await lastValueFrom(
      interceptor.intercept(context('/auth/refresh_token'), {
        handle: () => of(response),
      }),
    );

    expect(warming.warmTilesForUserLogin).not.toHaveBeenCalled();
  });

  it('activa una precarga no bloqueante en un login valido', async () => {
    const warming = {
      warmTilesForUserLogin: jest.fn().mockResolvedValue(undefined),
    };
    const interceptor = new LoginCacheWarmingInterceptor(warming as any);

    await lastValueFrom(
      interceptor.intercept(context('/auth/login'), {
        handle: () => of(response),
      }),
    );

    expect(warming.warmTilesForUserLogin).toHaveBeenCalledWith(
      'usuario-1',
      response.user.permisos,
      'user-login',
    );
  });
});
