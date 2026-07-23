import { Route } from '@angular/router';
import { routes } from './app.routes';

describe('app route access matrix', () => {
  const children = (
    routes.find((route) => route.path === '')?.children || []
  ) as Route[];
  const route = (path: string): Route => {
    const found = children.find((item) => item.path === path);
    if (!found) throw new Error(`No existe la ruta ${path}`);
    return found;
  };

  it('resuelve el acceso directo raiz con una funcion dependiente del permiso', () => {
    expect(typeof route('').redirectTo).toBe('function');
  });

  ['mapa', 'lotes', 'lotes/detalles/:id', 'alertas', 'establecimientos'].forEach(
    (path) => {
      it(`declara ${path} como ruta de lectura para los tres roles`, () => {
        expect(route(path).data?.['roles']).toEqual([
          'Admin',
          'Escritura',
          'Lectura',
        ]);
      });
    }
  );

  [
    'lotes/crear',
    'lotes/editar/:id',
    'lotes/sembrar/:id',
    'lotes/fertilizar/:id',
    'lotes/fumigar/:id',
    'lotes/cosechar/:id',
  ].forEach((path) => {
    it(`impide Lectura en la operacion ${path}`, () => {
      expect(route(path).data?.['roles']).toEqual(['Admin', 'Escritura']);
      expect(route(path).data?.['roles']).not.toContain('Lectura');
    });
  });

  [
    'productores/crear',
    'productores/editar/:id',
    'distribuidores/crear',
    'distribuidores/editar/:id',
    'usuarios',
    'usuarios/crear',
  ].forEach((path) => {
    it(`reserva ${path} para administradores del alcance`, () => {
      expect(route(path).data?.['roles']).toEqual(['Admin']);
    });
  });

  it('reserva la creación directa de Asesor al Tenant Admin', () => {
    expect(route('usuarios/crear/asesor').data?.['niveles']).toEqual([
      'Tenant',
    ]);
    expect(route('usuarios/crear/asesor').data?.['roles']).toEqual(['Admin']);
  });
});
