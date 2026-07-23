import { UsuariosController } from './controller';

describe('UsuariosController - autorizacion de red comercial', () => {
  it('habilita niveles supervisores y excluye al productor operativo', () => {
    const permisos = Reflect.getMetadata(
      'permisos',
      UsuariosController.prototype.getResumenRedComercial,
    );

    expect(permisos).toContainEqual({ nivel: 'Admin', roles: ['Admin'] });
    expect(permisos).toContainEqual({
      nivel: 'Asesor',
      roles: ['Admin', 'Lectura', 'Escritura'],
    });
    expect(permisos).toContainEqual({
      nivel: 'Distribuidor',
      roles: ['Admin', 'Lectura', 'Escritura'],
    });
    expect(permisos).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ nivel: 'Productor' })]),
    );
  });
});
