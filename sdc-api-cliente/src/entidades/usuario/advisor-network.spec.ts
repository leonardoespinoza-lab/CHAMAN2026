import { UsuariosService } from './service';

describe('UsuariosService - red administrativa de asesores', () => {
  it('consolida cartera propia, asignaciones, lotes, hectareas y usuarios sin duplicar', async () => {
    const usuariosRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'asesor-1',
            username: 'asesor.uno',
            activo: true,
            datosPersonales: {
              nombre: 'Asesor Uno',
              email: 'uno@chaman.test',
            },
            datosProfesionales: {
              profesion: 'Ingeniero agronomo',
              matricula: 'MAT-1',
            },
            ubicacionProfesional: {
              direccion: 'Ruta 1',
              geojson: { type: 'Point', coordinates: [-64, -32] },
              radioInfluenciaKm: 100,
            },
            permisos: [
              {
                nivel: 'Asesor',
                rol: 'Admin',
                idEstablecimientos: ['est-asignado'],
              },
            ],
          },
          {
            _id: 'asesor-2',
            username: 'asesor.dos',
            activo: false,
            permisos: [{ nivel: 'Asesor', rol: 'Admin' }],
          },
          {
            _id: 'usuario-prod-1',
            permisos: [
              {
                nivel: 'Productor',
                rol: 'Lectura',
                idProductor: 'prod-1',
              },
            ],
          },
          {
            _id: 'usuario-prod-2',
            permisos: [
              {
                nivel: 'Productor',
                rol: 'Lectura',
                idProductor: 'prod-2',
              },
            ],
          },
        ],
      }),
    };
    const establecimientosRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          { _id: 'est-propio', idProductor: 'prod-1' },
          { _id: 'est-asignado' },
          { _id: 'est-asesor-2', idProductor: 'prod-2' },
        ],
      }),
    };
    const productoresRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'prod-1',
            nombre: 'Productor Uno',
            idAsesorPropietario: 'asesor-1',
          },
          {
            _id: 'prod-2',
            nombre: 'Productor Dos',
            idAsesorPropietario: 'asesor-2',
          },
        ],
      }),
    };
    const lotesRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'lote-1',
            idEstablecimiento: 'est-propio',
            ubicacion: { superficie: 10.25 },
          },
          {
            _id: 'lote-2',
            idEstablecimiento: 'est-asignado',
            ubicacion: { superficie: 20 },
          },
          {
            _id: 'lote-3',
            idEstablecimiento: 'est-asesor-2',
            ubicacion: { superficie: 5.5 },
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
      {} as any,
      productoresRepository as any,
    );

    const resumen = await service.getResumenRedAsesores();

    expect(resumen.totales).toEqual({
      asesores: 2,
      activos: 1,
      archivados: 0,
      perfilesCompletos: 1,
      geolocalizados: 1,
      productores: 2,
      establecimientos: 3,
      lotes: 3,
      hectareas: 35.75,
      usuariosGestionados: 2,
    });
    expect(resumen.asesores[0]).toMatchObject({
      id: 'asesor-1',
      nombre: 'Asesor Uno',
      perfilCompleto: true,
      metricas: {
        productores: 1,
        establecimientos: 2,
        lotes: 2,
        hectareas: 30.25,
        usuariosGestionados: 1,
      },
    });
    expect(resumen.asesores[1]).toMatchObject({
      id: 'asesor-2',
      activo: false,
      perfilCompleto: false,
      metricas: {
        productores: 1,
        establecimientos: 1,
        lotes: 1,
        hectareas: 5.5,
        usuariosGestionados: 1,
      },
    });
    expect(usuariosRepository.get).toHaveBeenCalledWith(
      expect.objectContaining({
        select: '-hash -datosProfesionales.foto',
      }),
    );
  });

  it('expone una ficha auditable con establecimientos, lotes y accesos delegados', async () => {
    const usuariosRepository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'asesor-1',
        username: 'asesor.uno',
        activo: true,
        datosPersonales: {
          nombre: 'Asesor Uno',
          email: 'uno@chaman.test',
        },
        datosProfesionales: {
          profesion: 'Ingeniero agronomo',
          matricula: 'MAT-1',
          foto: 'data:image/png;base64,AA==',
        },
        ubicacionProfesional: {
          direccion: 'Ruta 1',
          geojson: { type: 'Point', coordinates: [-64, -32] },
        },
        permisos: [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idEstablecimientos: ['est-asignado'],
          },
        ],
      }),
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'usuario-1',
            username: 'encargado',
            activo: true,
            permisos: [
              {
                nivel: 'Productor',
                rol: 'Escritura',
                idProductor: 'productor-1',
              },
            ],
          },
        ],
      }),
    };
    const establecimientosRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'est-propio',
            nombre: 'Campo propio',
            idProductor: 'productor-1',
            idAsesorPropietario: 'asesor-1',
          },
          {
            _id: 'est-asignado',
            nombre: 'Campo asignado',
            idProductor: 'productor-1',
          },
        ],
      }),
    };
    const lotesRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'lote-1',
            nombre: 'Lote 1',
            idEstablecimiento: 'est-propio',
            ubicacion: { superficie: 10.25 },
          },
          {
            _id: 'lote-2',
            nombre: 'Lote 2',
            idEstablecimiento: 'est-asignado',
            ubicacion: { superficie: 20 },
          },
        ],
      }),
    };
    const productoresRepository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'productor-1',
            nombre: 'Empresa Uno',
            idAsesorPropietario: 'asesor-1',
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
      {} as any,
      productoresRepository as any,
    );

    const detalle = await service.getDetalleAuditoriaAsesor('asesor-1');

    expect(detalle.asesor).toMatchObject({
      id: 'asesor-1',
      nombre: 'Asesor Uno',
      foto: 'data:image/png;base64,AA==',
      perfilCompleto: true,
      metricas: {
        productores: 1,
        establecimientos: 2,
        lotes: 2,
        hectareas: 30.25,
        usuariosGestionados: 1,
      },
    });
    expect(detalle.establecimientos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'est-propio',
          productor: 'Empresa Uno',
          origen: 'Propio',
          lotes: 1,
          hectareas: 10.25,
          usuariosGestionados: 0,
        }),
        expect.objectContaining({
          id: 'est-asignado',
          origen: 'Asignado',
          lotes: 1,
          hectareas: 20,
          usuariosGestionados: 0,
        }),
      ]),
    );
    expect(detalle.lotes).toHaveLength(2);
    expect(detalle.productores).toEqual([
      expect.objectContaining({
        id: 'productor-1',
        nombre: 'Empresa Uno',
        establecimientos: 2,
        lotes: 2,
        hectareas: 30.25,
        usuariosGestionados: 1,
      }),
    ]);
    expect(detalle.usuarios).toHaveLength(1);
  });
});
