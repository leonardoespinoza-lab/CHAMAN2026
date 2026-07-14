jest.mock('../../env', () => ({
  ENV: 'local',
  SOIL_INTELLIGENCE_INTERNAL_TOKEN: '',
}));

import { ServiceUnavailableException } from '@nestjs/common';
import { SoilIntelligenceInternalGuard } from './internal-token.guard';

describe('SoilIntelligenceInternalGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
    }),
  } as any;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('falla cerrado si NODE_ENV indica produccion y no hay token', () => {
    process.env.NODE_ENV = 'production';

    expect(() =>
      new SoilIntelligenceInternalGuard().canActivate(context),
    ).toThrow(ServiceUnavailableException);
  });

  it('permite desarrollo local sin token', () => {
    process.env.NODE_ENV = 'development';

    expect(new SoilIntelligenceInternalGuard().canActivate(context)).toBe(true);
  });
});
