import { TenantsRepository } from './repository';

describe('TenantsRepository - archivo en cascada', () => {
  const tenant = {
    findByIdAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  };
  const users = {
    distinct: jest.fn(),
    updateMany: jest.fn(),
  };
  const tokens = {
    deleteMany: jest.fn(),
  };
  let repository: TenantsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    tenant.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'tenant-a',
        estado: 'archivado',
        archivado: true,
      }),
    });
    users.distinct.mockResolvedValue(['user-a', 'user-b']);
    users.updateMany.mockResolvedValue({ modifiedCount: 2 });
    tokens.deleteMany.mockResolvedValue({ deletedCount: 3 });
    repository = new TenantsRepository(
      tenant as any,
      users as any,
      tokens as any,
    );
  });

  it('bloquea el tenant, archiva todos sus usuarios y revoca sus sesiones', async () => {
    await repository.archive('tenant-a', {
      archivadoPor: 'root',
      motivoArchivado: 'cierre',
    });

    expect(tenant.findByIdAndUpdate).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        estado: 'archivado',
        archivado: true,
        archivadoPor: 'root',
        motivoArchivado: 'cierre',
      }),
      { new: true },
    );
    expect(users.distinct).toHaveBeenCalledWith('_id', {
      'permisos.idTenant': { $in: ['tenant-a'] },
    });
    expect(users.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $in: ['user-a', 'user-b'] },
        'permisos.idTenant': { $in: ['tenant-a'] },
      }),
      {
        $set: expect.objectContaining({
          activo: false,
          archivado: true,
          archivadoPor: 'root',
          motivoArchivado: 'cierre',
        }),
      },
    );
    expect(tokens.deleteMany).toHaveBeenCalledWith({
      'user._id': {
        $in: ['user-a', 'user-b'],
      },
    });
    expect(
      tenant.findByIdAndUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(users.updateMany.mock.invocationCallOrder[0]);
  });

  it('es repetible cuando el tenant ya no tiene sesiones', async () => {
    tokens.deleteMany.mockResolvedValue({ deletedCount: 0 });

    await expect(repository.archive('tenant-a', {})).resolves.toMatchObject({
      estado: 'archivado',
    });
    await expect(repository.archive('tenant-a', {})).resolves.toMatchObject({
      estado: 'archivado',
    });

    expect(tokens.deleteMany).toHaveBeenCalledTimes(2);
  });
});
