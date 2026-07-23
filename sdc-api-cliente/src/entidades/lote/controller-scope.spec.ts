import { LotesController } from './controller';

describe('LotesController - lectura del tenant', () => {
  const niveles = (metodo: keyof LotesController): string[] => {
    const permisos =
      Reflect.getMetadata(
        'permisos',
        LotesController.prototype[metodo] as (...args: unknown[]) => unknown,
      ) || [];
    return permisos.map((item: { nivel: string }) => item.nivel);
  };

  it('permite al tenant y al admin listar lotes', () => {
    expect(niveles('get')).toEqual(
      expect.arrayContaining(['Admin', 'Tenant']),
    );
  });

  it('permite al tenant y al admin leer un lote puntual', () => {
    expect(niveles('getById')).toEqual(
      expect.arrayContaining(['Admin', 'Tenant']),
    );
  });
});
