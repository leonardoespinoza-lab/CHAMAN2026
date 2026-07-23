import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';
import { HelperService } from '../servicios/helper';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => roleGuard(...guardParameters));

  const configure = (permisos: any[], permisoActivo: any) => {
    const helper = {
      user: { permisos },
      permiso: permisoActivo,
      numeroPermiso: null,
      setPermiso: jasmine.createSpy('setPermiso'),
      setNumeroPermiso: jasmine.createSpy('setNumeroPermiso'),
    };
    const router = {
      createUrlTree: jasmine.createSpy('createUrlTree').and.callFake((ruta) => ruta.join('')),
    };
    TestBed.configureTestingModule({ providers: [
      { provide: HelperService, useValue: helper },
      { provide: Router, useValue: router },
    ] });
    return { helper, router };
  };

  it('permite administrar usuarios solo al rol Admin del nivel habilitado', () => {
    const permiso = { nivel: 'Asesor', rol: 'Admin', idAsesor: 'asesor-1' };
    configure([permiso], permiso);

    expect(executeGuard({ data: { niveles: ['Asesor'], roles: ['Admin'] } } as any, {} as any)).toBe(true);
  });

  it('redirige un Asesor de Lectura fuera de una ruta administrativa', () => {
    const permiso = { nivel: 'Asesor', rol: 'Lectura', idAsesor: 'asesor-1' };
    configure([permiso], permiso);

    expect(executeGuard({ data: { niveles: ['Asesor'], roles: ['Admin'] } } as any, {} as any))
      .toBe('/dashboard-distribuidor' as any);
  });

  it('evita ciclos al denegar una ruta Admin a un perfil de solo lectura', () => {
    const permiso = { nivel: 'Admin', rol: 'Lectura' };
    configure([permiso], permiso);

    expect(executeGuard({ data: { niveles: ['Admin'], roles: ['Admin'] } } as any, {} as any))
      .toBe('/mapa' as any);
  });

  it('distingue permisos Asesor por identidad y cartera', () => {
    const primero = { nivel: 'Asesor', rol: 'Admin', idAsesor: 'asesor-1', idProductores: ['p-1'] };
    const segundo = { nivel: 'Asesor', rol: 'Admin', idAsesor: 'asesor-2', idProductores: ['p-2'] };
    const { helper } = configure([primero, segundo], segundo);

    expect(executeGuard({ data: { niveles: ['Asesor'] } } as any, {} as any)).toBe(true);
    expect(helper.setNumeroPermiso).toHaveBeenCalledWith(1);
  });

  it('distingue el mismo Asesor cuando pertenece a tenants diferentes', () => {
    const primero = {
      nivel: 'Asesor',
      rol: 'Admin',
      idTenant: 'tenant-1',
      idAsesor: 'asesor-1',
    };
    const segundo = {
      ...primero,
      idTenant: 'tenant-2',
    };
    const { helper } = configure([primero, segundo], segundo);

    expect(
      executeGuard(
        { data: { niveles: ['Asesor'], roles: ['Admin'] } } as any,
        {} as any
      )
    ).toBe(true);
    expect(helper.setNumeroPermiso).toHaveBeenCalledWith(1);
  });

  it('impide que Lectura abra una ruta de escritura y vuelve a su home sin ciclo', () => {
    const permiso = {
      nivel: 'Productor',
      rol: 'Lectura',
      idProductor: 'productor-1',
    };
    configure([permiso], permiso);

    expect(
      executeGuard(
        {
          data: {
            niveles: ['Productor', 'Establecimiento'],
            roles: ['Admin', 'Escritura'],
          },
        } as any,
        {} as any
      )
    ).toBe('/mapa' as any);
  });

  it('redirige un Tenant a dashboard-tenant cuando intenta abrir otro alcance', () => {
    const permiso = {
      nivel: 'Tenant',
      rol: 'Lectura',
      idTenant: 'tenant-1',
    };
    configure([permiso], permiso);

    expect(
      executeGuard(
        { data: { niveles: ['Admin'], roles: ['Admin'] } } as any,
        {} as any
      )
    ).toBe('/dashboard-tenant' as any);
  });
});
