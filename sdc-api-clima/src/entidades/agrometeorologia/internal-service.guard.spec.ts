describe('AgrometeorologiaInternalServiceGuard', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  function context(token?: string): any {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: token ? { 'x-chaman-internal-token': token } : {},
        }),
      }),
    };
  }

  it('acepta solamente el secreto de servicio configurado', () => {
    jest.isolateModules(() => {
      process.env = {
        ...originalEnv,
        ENV: 'production',
        AGROMETEO_INTERNAL_TOKEN: 'testing-secret-123',
      };
      const { AgrometeorologiaInternalServiceGuard } = jest.requireActual<
        typeof import('./internal-service.guard')
      >('./internal-service.guard');
      const guard = new AgrometeorologiaInternalServiceGuard();
      expect(guard.canActivate(context('testing-secret-123'))).toBe(true);
      expect(() => guard.canActivate(context('incorrecto'))).toThrow(
        'Canal interno no autorizado',
      );
    });
  });

  it('falla cerrado en produccion si falta el secreto', () => {
    jest.isolateModules(() => {
      process.env = {
        ...originalEnv,
        ENV: 'production',
        AGROMETEO_INTERNAL_TOKEN: '',
      };
      const { AgrometeorologiaInternalServiceGuard } = jest.requireActual<
        typeof import('./internal-service.guard')
      >('./internal-service.guard');
      const guard = new AgrometeorologiaInternalServiceGuard();
      expect(() => guard.canActivate(context())).toThrow('no esta configurado');
    });
  });
});
