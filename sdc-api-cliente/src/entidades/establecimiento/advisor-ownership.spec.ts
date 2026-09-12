import { EstablecimientosService } from './service';

describe('EstablecimientosService - gestion operativa del asesor', () => {
  function createService() {
    const repository = {
      create: jest.fn(async (data) => ({ _id: 'est-nuevo', ...data })),
      get: jest.fn().mockResolvedValue({ totalCount: 0, datos: [] }),
      getById: jest.fn().mockResolvedValue({
        _id: 'est-1',
        nombre: 'Campo actual',
        idProductor: 'prod-1',
        idDistribuidor: 'dist-1',
        idQuimica: 'quim-1',
        idAsesorPropietario: 'asesor-1',
      }),
      delete: jest.fn(async (id) => ({ _id: id })),
      update: jest.fn(async (id, data) => ({ _id: id, ...data })),
    };
    const advisorScope = {
      registerOwnedEstablishment: jest.fn(),
      removeOwnedEstablishment: jest.fn(),
    };
    const productores = {
      getById: jest.fn().mockResolvedValue({
        _id: 'prod-1',
        idDistribuidor: 'dist-1',
        idQuimica: 'quim-1',
        idAsesorPropietario: 'asesor-1',
      }),
    };
    const service = new EstablecimientosService(
      repository as any,
      {} as any,
      productores as any,
      {} as any,
      undefined,
      undefined,
      advisorScope as any,
    );
    return { service, repository, productores, advisorScope };
  }

  it('permite al asesor crear un establecimiento dentro de un productor propio', async () => {
    const { service, repository, advisorScope } = createService();

    await service.create(
      { nombre: 'Campo directo', idProductor: 'prod-1' } as any,
      { nivel: 'Asesor', rol: 'Admin', idAsesor: 'asesor-1' } as any,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idProductor: 'prod-1',
        idAsesorPropietario: 'asesor-1',
        idDistribuidor: 'dist-1',
        idQuimica: 'quim-1',
      }),
    );
    expect(advisorScope.registerOwnedEstablishment).toHaveBeenCalledWith(
      expect.objectContaining({ idAsesor: 'asesor-1' }),
      'est-nuevo',
    );
  });
  it('crea cartera propia explícita sin consultar ni inventar productor y deriva el propietario de la sesión', async () => {
    const { service, repository, productores, advisorScope } = createService();
    const permiso: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'a'.repeat(24),
      idTenant: 't',
      idQuimica: 'q',
      idDistribuidor: 'd',
    };
    await service.create(
      {
        nombre: 'Campo propio',
        carteraPropiaAsesor: true,
        idTenant: 'ajeno',
        idAsesorPropietario: 'ajeno',
        idQuimica: 'ajena',
      } as any,
      permiso,
    );
    expect(productores.getById).not.toHaveBeenCalled();
    const saved = repository.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      carteraPropiaAsesor: true,
      idAsesorPropietario: permiso.idAsesor,
      idTenant: 't',
    });
    expect(saved.idProductor).toBeUndefined();
    expect(saved.idDistribuidor).toBeUndefined();
    expect(saved.idQuimica).toBeUndefined();
    expect(advisorScope.registerOwnedEstablishment).toHaveBeenCalled();
  });
  it.each([
    [{ nivel: 'Asesor', rol: 'Lectura', idAsesor: 'a'.repeat(24) }, {}],
    [{ nivel: 'Admin', rol: 'Admin' }, {}],
    [{ nivel: 'Asesor', rol: 'Admin' }, {}],
    [
      { nivel: 'Asesor', rol: 'Admin', idAsesor: 'a'.repeat(24) },
      { idProductor: 'p' },
    ],
    [
      { nivel: 'Asesor', rol: 'Admin', idAsesor: 'a'.repeat(24) },
      { carteraPropiaAsesor: 'true' },
    ],
  ])(
    'rechaza cartera propia ambigua o sin identidad/autorización',
    async (permiso, extra) => {
      const { service, repository } = createService();
      await expect(
        service.create(
          { nombre: 'Campo', carteraPropiaAsesor: true, ...extra } as any,
          permiso as any,
        ),
      ).rejects.toThrow();
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
  it('la ausencia de productor no se interpreta automáticamente como cartera propia', async () => {
    const { service, repository } = createService();
    await expect(
      service.create({ nombre: 'Campo' }, {
        nivel: 'Asesor',
        rol: 'Admin',
        idAsesor: 'a'.repeat(24),
      } as any),
    ).rejects.toThrow('explícitamente');
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each([
    { nivel: 'Productor', rol: 'Admin', idProductor: 'otro' },
    { nivel: 'Productor', rol: 'Admin' },
    { nivel: 'Distribuidor', rol: 'Admin', idDistribuidor: 'otro' },
    { nivel: 'Quimica', rol: 'Admin', idQuimica: 'otra' },
    { nivel: 'Asesor', rol: 'Admin', idAsesor: 'otro' },
    { nivel: 'Asesor', rol: 'Admin', idAsesor: 'asesor-1', idTenant: 'otro' },
  ])(
    'no expone un establecimiento propio a otra cartera por tener relaciones ausentes',
    async (permiso) => {
      const { service, repository } = createService();
      repository.getById.mockResolvedValue({
        _id: 'est-1',
        nombre: 'Campo propio',
        carteraPropiaAsesor: true,
        idAsesorPropietario: 'asesor-1',
      } as any);
      await expect(service.getById('est-1', permiso as any)).rejects.toThrow(
        'No tiene permiso',
      );
    },
  );
  it('el asesor propietario puede leer su establecimiento sin productor', async () => {
    const { service, repository } = createService();
    repository.getById.mockResolvedValue({
      _id: 'est-1',
      nombre: 'Campo propio',
      carteraPropiaAsesor: true,
      idAsesorPropietario: 'asesor-1',
    } as any);
    await expect(
      service.getById('est-1', {
        nivel: 'Asesor',
        rol: 'Admin',
        idAsesor: 'asesor-1',
      } as any),
    ).resolves.toMatchObject({ carteraPropiaAsesor: true });
  });
  it('ni una edición administrativa convierte una cartera propia en campo de productor', async () => {
    const { service, repository } = createService();
    repository.getById.mockResolvedValue({
      _id: 'est-1',
      nombre: 'Campo propio',
      carteraPropiaAsesor: true,
      idAsesorPropietario: 'asesor-1',
    } as any);
    await expect(
      service.update('est-1', { idProductor: 'prod-1' }, {
        nivel: 'Admin',
        rol: 'Admin',
      } as any),
    ).rejects.toThrow('no se puede trasladar');
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('no permite cambiar el marcador de propiedad en una edición', async () => {
    const { service, repository } = createService();
    await service.update(
      'est-1',
      { carteraPropiaAsesor: true } as any,
      { nivel: 'Asesor', rol: 'Admin', idAsesor: 'asesor-1' } as any,
    );
    expect(
      repository.update.mock.calls[0][1].carteraPropiaAsesor,
    ).toBeUndefined();
    expect(repository.update.mock.calls[0][1].idProductor).toBe('prod-1');
  });

  it('permite editar y archivar dentro de su red sin transferir el productor', async () => {
    const { service, repository, advisorScope } = createService();
    const permiso: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'asesor-1',
      idEstablecimientos: ['est-1'],
    };

    await service.update(
      'est-1',
      { nombre: 'Cambio', idProductor: 'prod-ajeno' } as any,
      permiso,
    );
    await service.delete('est-1', permiso);
    expect(repository.update).toHaveBeenCalledWith(
      'est-1',
      expect.objectContaining({ nombre: 'Cambio', idProductor: 'prod-1' }),
    );
    expect(repository.delete).toHaveBeenCalled();
    expect(advisorScope.removeOwnedEstablishment).toHaveBeenCalledWith(
      permiso,
      'est-1',
    );
  });

  it('hereda el asesor propietario cuando el usuario productor crea el establecimiento', async () => {
    const { service, repository } = createService();

    const result = await service.create(
      { nombre: 'Campo del productor', idProductor: 'prod-1' } as any,
      {
        nivel: 'Productor',
        rol: 'Admin',
        idProductor: 'prod-1',
      } as any,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idProductor: 'prod-1',
        idAsesorPropietario: 'asesor-1',
        idDistribuidor: 'dist-1',
        idQuimica: 'quim-1',
      }),
    );
    expect(result._id).toBe('est-nuevo');
  });
});
