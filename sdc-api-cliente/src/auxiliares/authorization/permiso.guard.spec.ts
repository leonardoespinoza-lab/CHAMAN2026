import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermisoGuard } from './permiso.guard';

describe('PermisoGuard', () => {
  it('deniega por defecto un handler sin declaracion RBAC', () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new PermisoGuard(reflector);
    expect(guard.canActivate({ getHandler: () => undefined } as ExecutionContext)).toBe(false);
  });

  it('permite solo cuando el permiso activo coincide', () => {
    const reflector = {
      get: jest.fn().mockReturnValue([{ nivel: 'Productor', roles: ['Lectura'] }]),
    } as unknown as Reflector;
    const guard = new PermisoGuard(reflector);
    const context = {
      getHandler: () => undefined,
      switchToHttp: () => ({
        getResponse: () => ({ locals: { permiso: { nivel: 'Productor', rol: 'Lectura' } } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(true);
  });
});
