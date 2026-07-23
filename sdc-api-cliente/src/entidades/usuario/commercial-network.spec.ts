import { UsuariosService } from './service';

describe('UsuariosService - red comercial territorial', () => {
  const buildService = () => {
    const usuariosRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'usuario-red',
            permisos: [
              { nivel: 'Distribuidor', idDistribuidor: 'dist-1' },
              { nivel: 'Establecimiento', idEstablecimiento: 'est-1' },
            ],
          },
        ],
      }),
    };
    const distribuidoresRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [{ _id: 'dist-1', nombre: 'Distribuidor Norte' }],
      }),
    };
    const productoresRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'prod-1',
            nombre: 'Productor Uno',
            idDistribuidor: 'dist-1',
          },
        ],
      }),
    };
    const establecimientosRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'est-1',
            nombre: 'Campo Norte',
            idDistribuidor: 'dist-1',
            idProductor: 'prod-1',
            ubicacion: [{ centro: { lng: -64.25, lat: -32.5 } }],
          },
        ],
      }),
    };
    const lotesRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'lote-1',
            idDistribuidor: 'dist-1',
            idProductor: 'prod-1',
            idEstablecimiento: 'est-1',
            ubicacion: { superficie: 12.345 },
          },
        ],
      }),
    };
    const service = new UsuariosService(
      usuariosRepository as any,
      {} as any,
      {} as any,
      establecimientosRepository as any,
      lotesRepository as any,
      distribuidoresRepository as any,
      productoresRepository as any,
    );
    return { service, distribuidoresRepository, productoresRepository };
  };

  it('consolida la jerarquia y deriva ubicaciones sin presentarlas como domicilios cargados', async () => {
    const { service } = buildService();
    const red = await service.getResumenRedComercial({ nivel: 'Admin' } as any);

    expect(red.totales).toEqual({
      distribuidores: 1,
      productores: 1,
      establecimientos: 1,
      lotes: 1,
      hectareas: 12.35,
      usuarios: 1,
    });
    expect(red.productores[0]).toMatchObject({
      id: 'prod-1',
      fuenteUbicacion: 'Derivada',
      geojson: { type: 'Point', coordinates: [-64.25, -32.5] },
      metricas: {
        establecimientos: 1,
        lotes: 1,
        hectareas: 12.35,
        usuarios: 1,
      },
    });
    expect(red.distribuidores[0]).toMatchObject({
      id: 'dist-1',
      fuenteUbicacion: 'Derivada',
      metricas: {
        productores: 1,
        establecimientos: 1,
        lotes: 1,
        hectareas: 12.35,
        usuarios: 1,
      },
    });
  });

  it('aplica el alcance del distribuidor en todas las consultas internas', async () => {
    const { service, distribuidoresRepository, productoresRepository } =
      buildService();
    await service.getResumenRedComercial({
      nivel: 'Distribuidor',
      idDistribuidor: 'dist-1',
    } as any);

    expect(distribuidoresRepository.get).toHaveBeenCalledWith(
      expect.objectContaining({ filter: JSON.stringify({ _id: 'dist-1' }) }),
    );
    expect(productoresRepository.get).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: JSON.stringify({ idDistribuidor: 'dist-1' }),
      }),
    );
  });
});
