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
