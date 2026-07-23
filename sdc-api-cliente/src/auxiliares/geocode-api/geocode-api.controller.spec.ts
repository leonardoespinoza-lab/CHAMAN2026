import { GeocodesController } from './geocode-api.controller';

describe('GeocodesController - permisos', () => {
  it.each(['direcciones', 'zonas', 'provincias', 'geocode', 'reverse'])(
    'habilita la herramienta %s para un asesor administrador',
    (metodo) => {
      const permisos = Reflect.getMetadata(
        'permisos',
        GeocodesController.prototype[metodo],
      );
      expect(permisos).toContainEqual({ nivel: 'Asesor', roles: ['Admin'] });
    },
  );
});
