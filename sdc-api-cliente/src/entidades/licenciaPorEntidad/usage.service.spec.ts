import { LicenseUsageService } from './usage.service';

describe('LicenseUsageService', () => {
  const build = () => {
    const usuarios = {
      get: jest.fn(async () => ({
        totalCount: 2,
        datos: [
          { permisos: [{ nivel: 'Distribuidor', idDistribuidor: 'dist-1' }] },
          { permisos: [{ nivel: 'Distribuidor', idDistribuidor: 'dist-2' }] },
        ],
      })),
    };
    const distribuidores = { get: jest.fn() };
    const productores = {
      get: jest.fn(async () => ({ totalCount: 3, datos: [{ _id: 'prod-1' }] })),
    };
    const establecimientos = {
      get: jest.fn(async () => ({ totalCount: 4, datos: [{ _id: 'est-1' }] })),
    };
    const lotes = {
      get: jest.fn(async () => ({
        totalCount: 2,
        datos: [
          { ubicacion: { superficie: 12.25 } },
          { ubicacion: { superficie: 7.75 } },
        ],
      })),
    };
    return {
      service: new LicenseUsageService(
        usuarios as any,
        distribuidores as any,
        productores as any,
        establecimientos as any,
        lotes as any,
      ),
      distribuidores,
      productores,
      establecimientos,
      lotes,
    };
  };

  it('mide la red del distribuidor sin consultar un idDistribuidor inexistente sobre si mismo', async () => {
    const { service, distribuidores, productores, establecimientos, lotes } =
      build();
    const uso = await service.medir('Distribuidor', 'dist-1', {
      maxUsuarios: 2,
      maxProductores: 2,
      maxEstablecimientos: 10,
      maxLotes: 2,
      maxdHectareas: 100,
    } as any);

    expect(distribuidores.get).not.toHaveBeenCalled();
    expect(productores.get).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: JSON.stringify({ idDistribuidor: 'dist-1' }),
      }),
    );
    expect(establecimientos.get).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: JSON.stringify({ idDistribuidor: 'dist-1' }),
      }),
    );
    expect(lotes.get).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: JSON.stringify({ idDistribuidor: 'dist-1' }),
      }),
    );
    expect(uso.usuarios).toEqual(
      expect.objectContaining({ actual: 1, porcentaje: 50 }),
    );
    expect(uso.productores).toEqual(
      expect.objectContaining({ actual: 3, excedido: true }),
    );
    expect(uso.hectareas).toEqual(
      expect.objectContaining({ actual: 20, porcentaje: 20 }),
    );
  });
});
