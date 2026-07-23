import { ForbiddenException } from '@nestjs/common';
import { IPermiso, ITenant } from 'modelos/src';
import { TenantsService } from './service';

describe('TenantsService', () => {
  const repository = {
    get: jest.fn(),
    getById: jest.fn(),
    getBySlug: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
  };
  const usuarios = { create: jest.fn() };
  let service: TenantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.getBySlug.mockRejectedValue({ status: 404 });
    service = new TenantsService(repository as any, usuarios as any);
  });

  it('provisiona el administrador dentro del tenant creado', async () => {
    repository.create.mockResolvedValue({ _id: 'tenant-a', nombre: 'A', modulos: { Clima: true } });
    repository.getById.mockResolvedValue({ _id: 'tenant-a', nombre: 'A', modulos: { Clima: true }, estado: 'activo' });
    usuarios.create.mockResolvedValue({ _id: 'user-a' });
    repository.update.mockImplementation(async (_id: string, data: Partial<ITenant>) => ({ _id, ...data }));

    await service.create(
      {
        nombre: 'A',
        slug: 'a',
        administrador: { nombre: 'Admin A', username: 'admin.a', password: 'ClaveA123' },
      },
      { nivel: 'Admin', rol: 'Admin' },
      { _id: 'root', username: 'root' },
    );

    expect(usuarios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        permisos: [
          expect.objectContaining({ nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' }),
        ],
      }),
      { nivel: 'Admin', rol: 'Admin' },
      expect.objectContaining({ _id: 'root' }),
    );
    expect(repository.update).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ idUsuarioAdmin: 'user-a', provisionado: true }),
    );
  });

  it('impide que un tenant lea otro tenant', async () => {
    const permiso: IPermiso = { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' };
    await expect(service.getById('tenant-b', permiso)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.getById).not.toHaveBeenCalled();
  });

  it('entrega la identidad visual del tenant a cualquier usuario descendiente', async () => {
    repository.getById.mockResolvedValue({
      _id: 'tenant-a',
      nombre: 'John Deere',
      branding: { colorPrimario: '#367c2b' },
    });
    const permiso: IPermiso = {
      nivel: 'Asesor',
      rol: 'Admin',
      idTenant: 'tenant-a',
      idAsesor: 'asesor-a',
    };

    const tenant = await service.getCurrent(permiso);

    expect(repository.getById).toHaveBeenCalledWith('tenant-a');
    expect(tenant.nombre).toBe('John Deere');
  });

  it('valida la politica de contrasena antes de persistir el tenant', async () => {
    await expect(
      service.create(
        {
          nombre: 'A',
          slug: 'a',
          administrador: {
            nombre: 'Admin A',
            username: 'admin.a',
            password: 'corta',
          },
        },
        { nivel: 'Admin', rol: 'Admin' },
        { _id: 'root', username: 'root' },
      ),
    ).rejects.toThrow('al menos 8 caracteres');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reutiliza el borrador propio al reintentar el mismo slug', async () => {
    repository.getBySlug.mockResolvedValue({
      _id: 'tenant-a',
      slug: 'a',
      nombre: 'A',
      estado: 'borrador',
      provisionado: false,
      creadoPorUsuario: 'root',
      modulos: { Clima: true },
    });
    repository.update.mockImplementation(async (_id: string, data: Partial<ITenant>) => ({
      _id,
      nombre: 'A',
      modulos: { Clima: true },
      ...data,
    }));
    repository.getById.mockResolvedValue({
      _id: 'tenant-a',
      nombre: 'A',
      estado: 'activo',
      provisionado: false,
      modulos: { Clima: true },
    });
    usuarios.create.mockResolvedValue({ _id: 'user-a' });

    const result = await service.create(
      {
        nombre: 'A',
        slug: 'a',
        administrador: {
          nombre: 'Admin A',
          username: 'admin.a',
          password: 'ClaveA123',
        },
      },
      { nivel: 'Admin', rol: 'Admin' },
      { _id: 'root', username: 'root' },
    );

    expect(repository.create).not.toHaveBeenCalled();
    expect(usuarios.create).toHaveBeenCalled();
    expect(result.provisionado).toBe(true);
  });

  it('un administrador tenant solo puede editar identidad visual y dominios', async () => {
    repository.update.mockImplementation(async (_id: string, data: Partial<ITenant>) => ({ _id, ...data }));
    const permiso: IPermiso = { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' };
    await service.update(
      'tenant-a',
      {
        branding: { nombreAplicacion: 'Marca A' },
        dominios: ['a.example.com'],
        limites: { usuarios: 999 },
        estado: 'suspendido',
      },
      permiso,
    );
    expect(repository.update).toHaveBeenCalledWith('tenant-a', {
      branding: { nombreAplicacion: 'Marca A' },
      dominios: ['a.example.com'],
    });
  });
});
