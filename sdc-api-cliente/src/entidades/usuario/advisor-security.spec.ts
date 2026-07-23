import { BadRequestException } from '@nestjs/common';
import { UsuariosService } from './service';

describe('UsuariosService - alcance y perfil del asesor', () => {
  const establecimiento = (id: string, distribuidor = 'dist-1') => ({
    _id: id,
    idProductor: 'prod-1',
    idDistribuidor: distribuidor,
    idQuimica: 'quim-1',
  });

  const crearServicio = () => {
    const repository = {
      get: jest.fn(async () => ({ datos: [], total: 0 })),
      create: jest.fn(async (data) => ({ _id: 'user-new', ...data })),
      update: jest.fn(async (id, data) => ({ _id: id, ...data })),
      getById: jest.fn(),
      delete: jest.fn(async (id, audit) => ({
        _id: id,
        archivado: true,
        ...audit,
      })),
    };
    const authentication = { revokeUserSessions: jest.fn() };
    const establecimientos = {
      getById: jest.fn(async (id) => establecimiento(String(id))),
      get: jest.fn(async () => ({ datos: [], totalCount: 0 })),
      delete: jest.fn(),
    };
    const lotes = {
      getById: jest.fn(),
      get: jest.fn(async () => ({ datos: [], totalCount: 0 })),
      delete: jest.fn(),
    };
    const distribuidores = {
      getById: jest.fn(async (id) => ({
        _id: String(id),
        idQuimica: 'quim-1',
      })),
    };
    const productores = {
      getById: jest.fn(async (id) => ({
        _id: String(id),
        idAsesorPropietario: 'advisor-1',
      })),
      get: jest.fn(async () => ({ datos: [], totalCount: 0 })),
      delete: jest.fn(),
    };
    const service = new UsuariosService(
      repository as any,
      {} as any,
      authentication as any,
      establecimientos as any,
      lotes as any,
      distribuidores as any,
      productores as any,
    );
    return {
      service,
      repository,
      authentication,
      establecimientos,
      lotes,
      distribuidores,
      productores,
    };
  };

  it('crea un asesor solo con establecimientos del distribuidor y ubicacion profesional', async () => {
    const { service, repository } = crearServicio();
    await service.create(
      {
        username: 'asesor.demo',
        password: 'ClaveSegura1',
        permisos: [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idDistribuidor: 'dist-1',
            idEstablecimientos: ['est-1', 'est-2'],
          },
        ],
        ubicacionProfesional: {
          direccion: 'Ruta 1 km 10',
          geojson: { type: 'Point', coordinates: [-61, -33] },
          radioInfluenciaKm: 80,
        },
      } as any,
      { nivel: 'Distribuidor', rol: 'Admin', idDistribuidor: 'dist-1' },
      { _id: 'actor-1' } as any,
    );

    const guardado = repository.create.mock.calls[0][0];
    expect(guardado.hash).toBeTruthy();
    expect(guardado.password).toBeUndefined();
    expect(guardado.creadoPorUsuario).toBe('actor-1');
    expect(guardado.permisos[0]).toMatchObject({
      idQuimica: 'quim-1',
      idDistribuidor: 'dist-1',
      idEstablecimientos: ['est-1', 'est-2'],
    });
  });

  it('permite un asesor independiente con establecimientos de distintas redes', async () => {
    const { service, repository, establecimientos } = crearServicio();
    establecimientos.getById
      .mockResolvedValueOnce(establecimiento('est-1', 'dist-1'))
      .mockResolvedValueOnce(establecimiento('est-2', 'dist-2'));

    await service.create(
      {
        username: 'asesor.independiente',
        password: 'ClaveSegura1',
        permisos: [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idEstablecimientos: ['est-1', 'est-2'],
          },
        ],
        ubicacionProfesional: {
          direccion: 'Ruta 2 km 20',
          geojson: { type: 'Point', coordinates: [-62, -34] },
          radioInfluenciaKm: 120,
        },
      } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(repository.create.mock.calls[0][0].permisos[0]).toMatchObject({
      idEstablecimientos: ['est-1', 'est-2'],
    });
    expect(
      repository.create.mock.calls[0][0].permisos[0].idDistribuidor,
    ).toBeUndefined();
  });

  it('permite crear un asesor sin cartera inicial para que construya la propia', async () => {
    const { service, repository } = crearServicio();

    await service.create(
      {
        username: 'asesor.nuevo',
        password: 'ClaveSegura1',
        permisos: [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idEstablecimientos: [],
          },
        ],
        ubicacionProfesional: {
          direccion: 'Ruta 3 km 30',
          geojson: { type: 'Point', coordinates: [-63, -35] },
          radioInfluenciaKm: 100,
        },
      } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(repository.create.mock.calls[0][0].permisos[0]).toMatchObject({
      nivel: 'Asesor',
      idEstablecimientos: [],
      idLotes: [],
    });
  });

  it('rechaza un establecimiento fuera del alcance del asesor creador', async () => {
    const { service } = crearServicio();
    await expect(
      service.create(
        {
          username: 'operador.ajeno',
          password: 'ClaveSegura1',
          permisos: [
            {
              nivel: 'Establecimiento',
              rol: 'Lectura',
              idEstablecimiento: 'est-2',
            },
          ],
        } as any,
        {
          nivel: 'Asesor',
          rol: 'Admin',
          idDistribuidor: 'dist-1',
          idEstablecimientos: ['est-1'],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revoca todas las sesiones cuando cambia un identificador de acceso', async () => {
    const { service, repository, authentication } = crearServicio();
    repository.getById.mockResolvedValue({
      _id: 'user-1',
      username: 'anterior',
      permisos: [
        {
          nivel: 'Productor',
          rol: 'Lectura',
          idProductor: 'prod-1',
        },
      ],
    });

    await service.update(
      'user-1',
      { username: 'nuevo' },
      {
        nivel: 'Asesor',
        rol: 'Admin',
        idDistribuidor: 'dist-1',
        idAsesor: 'advisor-1',
        idProductores: ['prod-1'],
      },
      { _id: 'advisor-1' } as any,
    );

    expect(authentication.revokeUserSessions).toHaveBeenCalledWith('user-1');
  });

  it('descarta el perfil profesional cuando el usuario no es asesor', async () => {
    const { service, repository } = crearServicio();
    await service.create(
      {
        username: 'productor.sin.perfil',
        password: 'ClaveSegura1',
        permisos: [
          {
            nivel: 'Productor',
            rol: 'Admin',
            idProductor: 'prod-1',
          },
        ],
        datosProfesionales: {
          profesion: 'Dato heredado que no corresponde',
          foto: 'data:image/png;base64,SG9sYQ==',
        },
        ubicacionProfesional: {
          direccion: 'No corresponde',
          geojson: { type: 'Point', coordinates: [-61, -33] },
        },
      } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    const guardado = repository.create.mock.calls[0][0];
    expect(guardado.datosProfesionales).toBeUndefined();
    expect(guardado.ubicacionProfesional).toBeUndefined();
  });

  it('rechaza un username duplicado antes de intentar persistir', async () => {
    const { service, repository } = crearServicio();
    repository.get.mockResolvedValue({
      datos: [{ _id: 'existente', username: 'productor 1' }],
      total: 1,
    });

    await expect(
      service.create(
        {
          username: ' Productor 1 ',
          password: 'ClaveSegura1',
          permisos: [
            {
              nivel: 'Productor',
              rol: 'Admin',
              idProductor: 'prod-1',
            },
          ],
        } as any,
        { nivel: 'Admin', rol: 'Admin' },
      ),
    ).rejects.toThrow('El usuario "productor 1" ya existe');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('archiva el asesor y sus recursos directos sin borrado fisico', async () => {
    const {
      service,
      repository,
      authentication,
      productores,
      establecimientos,
      lotes,
    } = crearServicio();
    repository.getById.mockResolvedValue({
      _id: 'advisor-1',
      username: 'andres',
      permisos: [{ nivel: 'Asesor', rol: 'Admin' }],
    });
    repository.get.mockResolvedValue({
      datos: [{ _id: 'user-managed' }],
      total: 1,
    });
    productores.get.mockResolvedValue({
      datos: [{ _id: 'prod-1' }],
      totalCount: 1,
    });
    establecimientos.get.mockResolvedValue({
      datos: [{ _id: 'est-1' }],
      totalCount: 1,
    });
    lotes.get.mockResolvedValue({ datos: [{ _id: 'lote-1' }], totalCount: 1 });

    const result = await service.delete(
      'advisor-1',
      { nivel: 'Admin', rol: 'Admin' },
      { _id: 'admin-1', username: 'admin' } as any,
    );

    expect(lotes.delete).toHaveBeenCalledWith(
      'lote-1',
      expect.objectContaining({ archivadoPor: 'admin' }),
    );
    expect(establecimientos.delete).toHaveBeenCalledWith(
      'est-1',
      expect.any(Object),
    );
    expect(productores.delete).toHaveBeenCalledWith(
      'prod-1',
      expect.any(Object),
    );
    expect(repository.delete).toHaveBeenCalledWith(
      'advisor-1',
      expect.objectContaining({ archivadoPor: 'admin' }),
    );
    expect(authentication.revokeUserSessions).toHaveBeenCalledWith('advisor-1');
    expect(repository.delete).toHaveBeenCalledWith(
      'user-managed',
      expect.objectContaining({ archivadoPor: 'admin' }),
    );
    expect(authentication.revokeUserSessions).toHaveBeenCalledWith(
      'user-managed',
    );
    expect(result.archivado).toBe(true);
  });

  it('no archiva recursos externos que solo estaban asignados al asesor', async () => {
    const { service, repository, establecimientos, lotes } = crearServicio();
    repository.getById.mockResolvedValue({
      _id: 'advisor-1',
      username: 'andres',
      permisos: [
        {
          nivel: 'Asesor',
          rol: 'Admin',
          idEstablecimientos: ['est-externo'],
          idLotes: ['lote-externo'],
        },
      ],
    });

    await service.delete(
      'advisor-1',
      { nivel: 'Admin', rol: 'Admin' },
      { _id: 'admin-1', username: 'admin' } as any,
    );

    const filtroEstablecimientos = JSON.parse(
      (establecimientos.get as jest.Mock).mock.calls[0][0].filter,
    );
    const filtroLotes = JSON.parse(
      (lotes.get as jest.Mock).mock.calls[0][0].filter,
    );
    expect(JSON.stringify(filtroEstablecimientos)).not.toContain('est-externo');
    expect(JSON.stringify(filtroLotes)).not.toContain('lote-externo');
  });

  it('conserva los permisos externos de un usuario al archivar la red propia del asesor', async () => {
    const { service, repository, productores, authentication } =
      crearServicio();
    repository.getById.mockResolvedValue({
      _id: 'advisor-1',
      username: 'andres',
      permisos: [{ nivel: 'Asesor', rol: 'Admin' }],
    });
    productores.get.mockResolvedValue({
      datos: [{ _id: 'prod-1' }],
      totalCount: 1,
    });
    repository.get.mockResolvedValue({
      datos: [
        {
          _id: 'user-multi',
          permisos: [
            { nivel: 'Productor', rol: 'Admin', idProductor: 'prod-1' },
            { nivel: 'Quimica', rol: 'Lectura', idQuimica: 'quim-externa' },
          ],
        },
      ],
      total: 1,
    });

    await service.delete(
      'advisor-1',
      { nivel: 'Admin', rol: 'Admin' },
      { _id: 'admin-1', username: 'admin' } as any,
    );

    expect(repository.update).toHaveBeenCalledWith('user-multi', {
      permisos: [
        { nivel: 'Quimica', rol: 'Lectura', idQuimica: 'quim-externa' },
      ],
    });
    expect(repository.delete).not.toHaveBeenCalledWith(
      'user-multi',
      expect.anything(),
    );
    expect(authentication.revokeUserSessions).toHaveBeenCalledWith(
      'user-multi',
    );
  });

  it('impide que un usuario archive su propia cuenta activa', async () => {
    const { service, repository } = crearServicio();
    repository.getById.mockResolvedValue({
      _id: 'admin-1',
      username: 'admin',
      permisos: [{ nivel: 'Admin', rol: 'Admin' }],
    });

    await expect(
      service.delete(
        'admin-1',
        { nivel: 'Admin', rol: 'Admin' },
        { _id: 'admin-1', username: 'admin' } as any,
      ),
    ).rejects.toThrow('No puede archivar su propio usuario');
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('permite crear un asesor sin mapa para completarlo despues', async () => {
    const { service, repository } = crearServicio();
    await service.create(
      {
        username: 'asesor.sin.mapa',
        password: 'ClaveSegura1',
        permisos: [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idDistribuidor: 'dist-1',
            idEstablecimientos: ['est-1'],
          },
        ],
      } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('rechaza combinaciones de nivel Admin con roles sin acceso operativo', async () => {
    const { service, repository } = crearServicio();

    await expect(
      service.create(
        {
          username: 'admin.solo.lectura',
          password: 'ClaveSegura1',
          permisos: [{ nivel: 'Admin', rol: 'Lectura' }],
        } as any,
        { nivel: 'Admin', rol: 'Admin' },
      ),
    ).rejects.toThrow('El nivel Admin solo admite el rol Admin');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('permite al asesor acceder a su propia cuenta para cambiar su clave', async () => {
    const { service, repository } = crearServicio();
    repository.getById.mockResolvedValue({
      _id: 'advisor-1',
      username: 'andres',
      permisos: [{ nivel: 'Asesor', rol: 'Admin', idAsesor: 'advisor-1' }],
    });

    await expect(
      service.getById('advisor-1', {
        nivel: 'Asesor',
        rol: 'Admin',
        idAsesor: 'advisor-1',
      }),
    ).resolves.toMatchObject({ _id: 'advisor-1' });
  });

  it('rechaza una ubicacion parcial para evitar coordenadas ambiguas', async () => {
    const { service } = crearServicio();
    await expect(
      service.create(
        {
          username: 'asesor.mapa.incompleto',
          password: 'ClaveSegura1',
          permisos: [
            {
              nivel: 'Asesor',
              rol: 'Admin',
              idEstablecimientos: [],
            },
          ],
          ubicacionProfesional: {
            direccion: 'Ruta 1 km 10',
            radioInfluenciaKm: 50,
          },
        } as any,
        { nivel: 'Admin', rol: 'Admin' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
