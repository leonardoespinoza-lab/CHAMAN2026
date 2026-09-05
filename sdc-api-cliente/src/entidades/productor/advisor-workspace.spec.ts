import { BadRequestException } from '@nestjs/common';
import { ProductorsService } from './service';

describe('ProductorsService - red comercial del asesor', () => {
  function createService() {
    const repository = {
      get: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(async (data) => ({ _id: 'prod-nuevo', ...data })),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const advisorScope = {
      registerOwnedProducer: jest.fn(),
      removeOwnedProducer: jest.fn(),
    };
    const service = new ProductorsService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      advisorScope as any,
    );
    return { service, repository, advisorScope };
  }

  it('crea productores propios sin fabricar un establecimiento o lote', async () => {
    const { service, repository, advisorScope } = createService();
    const permiso: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'asesor-1',
      idDistribuidor: 'dist-1',
      idQuimica: 'quim-1',
      idProductores: [],
    };

    const result = await service.create(
      {
        nombre: 'Productor gestionado',
        idDistribuidor: 'dist-ajeno',
        idQuimica: 'quim-ajena',
      } as any,
      permiso,
      { _id: 'licencia-efectiva' } as any,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Productor gestionado',
        idAsesorPropietario: 'asesor-1',
        idDistribuidor: 'dist-1',
        idQuimica: 'quim-1',
      }),
    );
    expect(advisorScope.registerOwnedProducer).toHaveBeenCalledWith(
      permiso,
      'prod-nuevo',
    );
    expect(result._id).toBe('prod-nuevo');
  });

  it('no permite crear productores si la red no tiene licencia efectiva', async () => {
    const { service, repository } = createService();

    await expect(
      service.create(
        { nombre: 'Productor sin plan' } as any,
        {
          nivel: 'Asesor',
          rol: 'Admin',
          idAsesor: 'asesor-1',
        } as any,
        undefined as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('normaliza los datos fiscales opcionales del productor', async () => {
    const { service, repository } = createService();

    await service.create(
      {
        nombre: 'Productor fiscal',
        razonSocial: '  Productor Fiscal SA  ',
        cuit: '20-32964233-0',
        condicionIva: ' Responsable inscripto ',
        emailFiscal: ' FACTURACION@EJEMPLO.COM ',
      } as any,
      {
        nivel: 'Asesor',
        rol: 'Admin',
        idAsesor: 'asesor-1',
      } as any,
      { _id: 'licencia-efectiva' } as any,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        razonSocial: 'Productor Fiscal SA',
        cuit: '20329642330',
        condicionIva: 'Responsable inscripto',
        emailFiscal: 'facturacion@ejemplo.com',
      }),
    );
  });

  it('rechaza un CUIT fiscal con dígito verificador inválido', async () => {
    const { service, repository } = createService();

    await expect(
      service.create(
        { nombre: 'Productor fiscal', cuit: '30716898724' } as any,
        {
          nivel: 'Asesor',
          rol: 'Admin',
          idAsesor: 'asesor-1',
        } as any,
        { _id: 'licencia-efectiva' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('crea un productor aislado dentro del tenant habilitado', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [], totalCount: 0 }),
      create: jest.fn(async (data) => ({ _id: 'prod-tenant', ...data })),
    };
    const tenantRepository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'tenant-a',
        estado: 'activo',
        capacidades: { administrarProductores: true },
        limites: { productores: 5 },
      }),
    };
    const service = new ProductorsService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      tenantRepository as any,
    );

    const result = await service.create(
      { nombre: 'Productor tenant', idQuimica: 'no-confiable' } as any,
      { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' } as any,
      undefined as any,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Productor tenant',
        idTenant: 'tenant-a',
      }),
    );
    const persistido = repository.create.mock.calls[0][0];
    expect(persistido).not.toHaveProperty('idQuimica');
    expect(persistido).not.toHaveProperty('idDistribuidor');
    expect(result._id).toBe('prod-tenant');
  });

  it('permite al asesor del tenant crear productores cuando el tenant administra productores', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [], totalCount: 0 }),
      create: jest.fn(async (data) => ({ _id: 'prod-asesor-tenant', ...data })),
    };
    const advisorScope = {
      registerOwnedProducer: jest.fn(),
    };
    const tenantRepository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'tenant-a',
        estado: 'activo',
        capacidades: {
          administrarAsesores: true,
          administrarProductores: true,
          gestionTerritorialAsesor: false,
        },
        limites: { productores: 5 },
      }),
    };
    const service = new ProductorsService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      advisorScope as any,
      undefined,
      undefined,
      tenantRepository as any,
    );

    const permiso = {
      nivel: 'Asesor',
      rol: 'Admin',
      idTenant: 'tenant-a',
      idAsesor: 'asesor-a',
    } as any;
    const result = await service.create(
      { nombre: 'Productor del asesor' } as any,
      permiso,
      undefined as any,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Productor del asesor',
        idTenant: 'tenant-a',
        idAsesorPropietario: 'asesor-a',
      }),
    );
    expect(advisorScope.registerOwnedProducer).toHaveBeenCalledWith(
      permiso,
      'prod-asesor-tenant',
    );
    expect(result._id).toBe('prod-asesor-tenant');
  });

  it('un alta de Admin sin plan explicito hereda y no fabrica una asignacion', async () => {
    const repository = {
      create: jest.fn(async (data) => ({ _id: 'prod-admin', ...data })),
    };
    const licencias = { getById: jest.fn() };
    const asignaciones = { create: jest.fn() };
    const service = new ProductorsService(
      repository as any,
      {} as any,
      licencias as any,
      asignaciones as any,
      {} as any,
    );

    const result = await service.create(
      { nombre: 'Productor heredado' } as any,
      { nivel: 'Admin', rol: 'Admin' } as any,
      undefined as any,
    );

    expect(result._id).toBe('prod-admin');
    expect(licencias.getById).not.toHaveBeenCalled();
    expect(asignaciones.create).not.toHaveBeenCalled();
  });

  it('mantiene compatible el alta legacy cuando envia un plan explicito', async () => {
    const repository = {
      create: jest.fn(async (data) => ({ _id: 'prod-admin', ...data })),
    };
    const licencias = {
      getById: jest.fn(async () => ({ _id: 'plan-1', nombre: 'Plan 1' })),
    };
    const asignaciones = { create: jest.fn(async (data) => data) };
    const service = new ProductorsService(
      repository as any,
      {} as any,
      licencias as any,
      asignaciones as any,
      {} as any,
    );

    await service.create(
      {
        nombre: 'Productor directo',
        licencia: { _id: 'plan-1' },
        expiracion: 45,
      } as any,
      { nivel: 'Admin', rol: 'Admin' } as any,
      undefined as any,
    );

    expect(repository.create.mock.calls[0][0]).not.toHaveProperty('licencia');
    expect(repository.create.mock.calls[0][0]).not.toHaveProperty('expiracion');
    expect(asignaciones.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idEntidad: 'prod-admin',
        idLicencia: 'plan-1',
        tipoEntidad: 'Productor',
      }),
    );
  });
});
