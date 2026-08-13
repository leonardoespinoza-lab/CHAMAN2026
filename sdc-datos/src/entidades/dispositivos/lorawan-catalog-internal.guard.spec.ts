jest.mock('../../env', () => ({
  ENV: 'test',
  LORAWAN_CATALOG_INTERNAL_TOKEN: 'catalog-token-test',
}));

import { UnauthorizedException } from '@nestjs/common';
import { LorawanCatalogInternalGuard } from './lorawan-catalog-internal.guard';

describe('LorawanCatalogInternalGuard', () => {
  const context = (token?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: token ? { 'x-chaman-internal-token': token } : {},
        }),
      }),
    }) as any;

  it('autoriza exclusivamente el token interno compartido', () => {
    expect(
      new LorawanCatalogInternalGuard().canActivate(
        context('catalog-token-test'),
      ),
    ).toBe(true);
  });

  it('rechaza catalogos sin credencial interna valida', () => {
    expect(() =>
      new LorawanCatalogInternalGuard().canActivate(context('incorrecto')),
    ).toThrow(UnauthorizedException);
    expect(() =>
      new LorawanCatalogInternalGuard().canActivate(context()),
    ).toThrow(UnauthorizedException);
  });
});
