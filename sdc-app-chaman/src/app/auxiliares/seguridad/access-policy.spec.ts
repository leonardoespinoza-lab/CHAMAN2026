import { IPermiso, NivelPermiso } from 'modelos/src';
import {
  indicePermiso,
  mismoPermiso,
  permisoPrincipal,
  puedeAdministrar,
  puedeEscribir,
  resolverPermisoActivo,
  rutaInicioPermiso,
} from './access-policy';

describe('access-policy', () => {
  const rutas: Record<NivelPermiso, string> = {
    Admin: '/dashboard-admin',
    Tenant: '/dashboard-tenant',
    Quimica: '/dashboard-quimica',
    Distribuidor: '/dashboard-distribuidor',
    Asesor: '/dashboard-distribuidor',
    Productor: '/mapa',
    Establecimiento: '/mapa',
  };

  Object.entries(rutas).forEach(([nivel, ruta]) => {
    it(`define un inicio seguro para ${nivel}`, () => {
      expect(
        rutaInicioPermiso({ nivel: nivel as NivelPermiso, rol: 'Admin' })
      ).toBe(ruta);
    });
  });

  it('envía un Admin de solo lectura al mapa y evita un ciclo con dashboard-admin', () => {
    expect(rutaInicioPermiso({ nivel: 'Admin', rol: 'Lectura' })).toBe(
      '/mapa'
    );
  });

  it('prioriza el alcance más alto de forma estable', () => {
    const permisos: IPermiso[] = [
      { nivel: 'Productor', rol: 'Admin', idProductor: 'p-1' },
      { nivel: 'Asesor', rol: 'Admin', idAsesor: 'a-1' },
      { nivel: 'Tenant', rol: 'Admin', idTenant: 't-1' },
    ];

    expect(permisoPrincipal(permisos)).toBe(permisos[2]);
  });

  it('inicia en el alcance operativo cuando tambien existe Admin global', () => {
    const permisos: IPermiso[] = [
      { nivel: 'Admin', rol: 'Admin' },
      { nivel: 'Productor', rol: 'Admin', idProductor: 'p-1' },
    ];

    expect(permisoPrincipal(permisos)).toBe(permisos[1]);
  });

  it('mantiene Admin como inicio cuando no existe un alcance operativo', () => {
    const admin: IPermiso = { nivel: 'Admin', rol: 'Admin' };

    expect(permisoPrincipal([admin])).toBe(admin);
  });

  it('conserva una seleccion explicita de Admin aunque haya un alcance operativo', () => {
    const permisos: IPermiso[] = [
      { nivel: 'Admin', rol: 'Admin' },
      { nivel: 'Productor', rol: 'Admin', idProductor: 'p-1' },
    ];

    expect(resolverPermisoActivo(permisos, permisos[0], 1)).toEqual({
      permiso: permisos[0],
      index: 0,
    });
  });

  it('distingue permisos idénticos de tenants diferentes', () => {
    const tenantA: IPermiso = {
      nivel: 'Asesor',
      rol: 'Admin',
      idTenant: 'tenant-a',
      idAsesor: 'asesor-1',
    };
    const tenantB: IPermiso = {
      ...tenantA,
      idTenant: 'tenant-b',
    };

    expect(mismoPermiso(tenantA, tenantB)).toBeFalse();
    expect(indicePermiso([tenantA, tenantB], tenantB)).toBe(1);
    expect(
      resolverPermisoActivo([tenantA, tenantB], tenantB, 0)
    ).toEqual({ permiso: tenantB, index: 1 });
  });

  it('compara las carteras sin depender del orden', () => {
    const primero: IPermiso = {
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'a-1',
      idProductores: ['p-2', 'p-1'],
      idLotes: ['l-2', 'l-1'],
    };
    const segundo: IPermiso = {
      ...primero,
      idProductores: ['p-1', 'p-2'],
      idLotes: ['l-1', 'l-2'],
    };

    expect(mismoPermiso(primero, segundo)).toBeTrue();
  });

  it('separa lectura, escritura y administración', () => {
    const lectura: IPermiso = { nivel: 'Productor', rol: 'Lectura' };
    const escritura: IPermiso = { nivel: 'Productor', rol: 'Escritura' };
    const admin: IPermiso = { nivel: 'Productor', rol: 'Admin' };

    expect(puedeEscribir(lectura)).toBeFalse();
    expect(puedeAdministrar(lectura)).toBeFalse();
    expect(puedeEscribir(escritura)).toBeTrue();
    expect(puedeAdministrar(escritura)).toBeFalse();
    expect(puedeEscribir(admin)).toBeTrue();
    expect(puedeAdministrar(admin)).toBeTrue();
  });
});
