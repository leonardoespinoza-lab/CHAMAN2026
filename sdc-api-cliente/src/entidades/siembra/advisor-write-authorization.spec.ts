import { SiembrasController } from './controller';

describe('SiembrasController - escritura del asesor', () => {
  it.each(['create', 'update', 'cosechar', 'delete'] as const)(
    'habilita %s solo con rol de escritura dentro del alcance validado por el servicio',
    (method) => {
      const permisos = Reflect.getMetadata(
        'permisos',
        SiembrasController.prototype[method],
      );
      expect(permisos).toContainEqual({
        nivel: 'Asesor',
        roles: ['Admin', 'Escritura'],
      });
    },
  );
});
