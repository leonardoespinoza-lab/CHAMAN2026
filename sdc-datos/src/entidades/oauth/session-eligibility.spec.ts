import { OauthService } from './oauth.service';

describe('OauthService - elegibilidad viva de sesion', () => {
  const users = {
    getById: jest.fn(),
  };
  const tenants = {
    areAllActive: jest.fn(),
  };
  let service: OauthService;

  beforeEach(() => {
    jest.clearAllMocks();
    tenants.areAllActive.mockResolvedValue(true);
    service = new OauthService(
      {} as any,
      {} as any,
      users as any,
      tenants as any,
    );
  });

  it('mantiene elegible a un usuario activo sin tenant', async () => {
    users.getById.mockResolvedValue({
      _id: 'user-a',
      activo: true,
      permisos: [{ nivel: 'Admin', rol: 'Admin' }],
    });

    await expect(service.getSessionEligibility('user-a')).resolves.toEqual({
      eligible: true,
      user: expect.objectContaining({ _id: 'user-a' }),
    });
    expect(tenants.areAllActive).not.toHaveBeenCalled();
  });

  it('rechaza un usuario archivado aunque el token conserve una copia activa', async () => {
    users.getById.mockResolvedValue({
      _id: 'user-a',
      activo: false,
      archivado: true,
      permisos: [{ nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' }],
    });

    await expect(service.getSessionEligibility('user-a')).resolves.toEqual({
      eligible: false,
      reason: 'user_inactive',
    });
  });

  it('rechaza cualquier sesion asociada a un tenant no activo', async () => {
    users.getById.mockResolvedValue({
      _id: 'user-a',
      activo: true,
      permisos: [{ nivel: 'Asesor', rol: 'Admin', idTenant: 'tenant-a' }],
    });
    tenants.areAllActive.mockResolvedValue(false);

    await expect(service.getSessionEligibility('user-a')).resolves.toEqual({
      eligible: false,
      reason: 'tenant_inactive',
    });
    expect(tenants.areAllActive).toHaveBeenCalledWith(['tenant-a']);
  });

  it('no confunde una falla de datos con un usuario invalido', async () => {
    users.getById.mockRejectedValue(new Error('base no disponible'));

    await expect(
      service.getSessionEligibility('user-a'),
    ).rejects.toThrow('base no disponible');
  });
});
