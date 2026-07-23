import { LotesController } from './controller';

describe('LotesController - autorizacion de archivado', () => {
  it('permite archivar al administrador y al propietario operativo, no al asesor supervisor', () => {
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
    expect(permisos).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ nivel: 'Asesor' })]),
    );
  });
});
