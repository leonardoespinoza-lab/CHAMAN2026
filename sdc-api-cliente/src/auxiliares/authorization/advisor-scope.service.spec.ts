import { AdvisorScopeService } from './advisor-scope.service';

describe('AdvisorScopeService', () => {
  it('deriva productores propios y toda la red de establecimientos aguas abajo', async () => {
    const establecimientos = {
      get: jest.fn().mockResolvedValue({
        datos: [{ _id: 'est-productor' }, { _id: 'est-legacy' }],
      }),
    };
    const productores = {
      get: jest.fn().mockResolvedValue({
        datos: [{ _id: 'prod-1' }, { _id: 'prod-2' }],
      }),
    };
    const service = new AdvisorScopeService(
      establecimientos as any,
      productores as any,
    );
    const permiso: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idEstablecimientos: ['est-asignado'],
      idLotes: ['lote-antiguo'],
    };

    await service.enrichPermission(permiso, 'asesor-1');

    expect(permiso).toMatchObject({
      idAsesor: 'asesor-1',
      idProductores: ['prod-1', 'prod-2'],
      idLotes: [],
      idEstablecimientos: ['est-asignado', 'est-productor', 'est-legacy'],
    });
    expect(productores.get).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: JSON.stringify({ idAsesorPropietario: 'asesor-1' }),
      }),
    );
    expect(establecimientos.get).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: JSON.stringify({
          $or: [
            { idAsesorPropietario: 'asesor-1' },
            { idProductor: { $in: ['prod-1', 'prod-2'] } },
          ],
        }),
      }),
    );
  });

  it('incorpora inmediatamente un productor creado por el asesor', async () => {
    const establecimientos = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
    };
    const productores = { get: jest.fn().mockResolvedValue({ datos: [] }) };
    const service = new AdvisorScopeService(
      establecimientos as any,
      productores as any,
    );
    const permiso: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'asesor-1',
      idProductores: [],
      idEstablecimientos: [],
    };

    service.registerOwnedProducer(permiso, 'prod-nuevo');
    await service.enrichPermission(permiso, 'asesor-1');

    expect(permiso.idProductores).toEqual(['prod-nuevo']);
    expect(productores.get).not.toHaveBeenCalled();
    expect(establecimientos.get).not.toHaveBeenCalled();
  });

  it('separa cache y consultas para el mismo asesor en tenants distintos', async () => {
    const establecimientos = {
      get: jest.fn(async ({ filter }) => {
        const alcance = JSON.parse(filter);
        return {
          datos:
            alcance.idTenant === 'tenant-a'
              ? [{ _id: 'est-a' }]
              : [{ _id: 'est-b' }],
        };
      }),
    };
    const productores = {
      get: jest.fn(async ({ filter }) => {
        const alcance = JSON.parse(filter);
        return {
          datos:
            alcance.idTenant === 'tenant-a'
              ? [{ _id: 'prod-a' }]
              : [{ _id: 'prod-b' }],
        };
      }),
    };
    const service = new AdvisorScopeService(
      establecimientos as any,
      productores as any,
    );
    const permisoTenantA: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idTenant: 'tenant-a',
    };
    const permisoTenantB: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idTenant: 'tenant-b',
    };

    await service.enrichPermission(permisoTenantA, 'asesor-compartido');
    await service.enrichPermission(permisoTenantB, 'asesor-compartido');

    expect(permisoTenantA).toMatchObject({
      idProductores: ['prod-a'],
      idEstablecimientos: ['est-a'],
    });
    expect(permisoTenantB).toMatchObject({
      idProductores: ['prod-b'],
      idEstablecimientos: ['est-b'],
    });
    expect(productores.get).toHaveBeenCalledTimes(2);
    expect(productores.get).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        filter: JSON.stringify({
          idAsesorPropietario: 'asesor-compartido',
          idTenant: 'tenant-a',
        }),
      }),
    );
    expect(productores.get).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        filter: JSON.stringify({
          idAsesorPropietario: 'asesor-compartido',
          idTenant: 'tenant-b',
        }),
      }),
    );
  });

  it('descarta asignaciones persistidas que pertenecen a otro tenant', async () => {
    const establecimientos = {
      get: jest.fn(async ({ filter }) => {
        const alcance = JSON.parse(filter);
        if (alcance._id) {
          expect(alcance).toEqual({
            _id: { $in: ['est-a', 'est-b'] },
            idTenant: 'tenant-a',
          });
          return { datos: [{ _id: 'est-a' }] };
        }
        return { datos: [{ _id: 'est-propio-a' }] };
      }),
    };
    const productores = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
    };
    const service = new AdvisorScopeService(
      establecimientos as any,
      productores as any,
    );
    const permiso: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idTenant: 'tenant-a',
      idEstablecimientos: ['est-a', 'est-b'],
    };

    await service.enrichPermission(permiso, 'asesor-1');

    expect(permiso.idEstablecimientos).toEqual(['est-a', 'est-propio-a']);
    expect(permiso.idEstablecimientos).not.toContain('est-b');
  });
});
