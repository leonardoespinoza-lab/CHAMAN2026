import { LotesController } from './controller';

describe('LotesController - autorizacion de archivado', () => {
  it.each(['create', 'update'] as const)(
    'habilita %s para el asesor con escritura',
    (method) => {
      const permisos = Reflect.getMetadata(
        'permisos',
        LotesController.prototype[method],
      );
      expect(permisos).toContainEqual({
        nivel: 'Asesor',
        roles: ['Admin', 'Escritura'],
      });
    },
  );

  it('permite archivar al administrador, al propietario y al asesor de la cartera', () => {
    const permisos = Reflect.getMetadata(
      'permisos',
      LotesController.prototype.delete,
    );

    expect(permisos).toContainEqual({ nivel: 'Admin', roles: ['Admin'] });
    expect(permisos).toContainEqual({
      nivel: 'Productor',
      roles: ['Admin', 'Escritura'],
    });
    expect(permisos).toContainEqual({
      nivel: 'Establecimiento',
      roles: ['Admin', 'Escritura'],
    });
    expect(permisos).toContainEqual({
      nivel: 'Asesor',
      roles: ['Admin', 'Escritura'],
    });
  });
});
