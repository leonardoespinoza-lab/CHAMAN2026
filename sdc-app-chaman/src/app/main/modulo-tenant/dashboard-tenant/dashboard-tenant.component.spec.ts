import { DashboardTenantComponent } from './dashboard-tenant.component';

describe('DashboardTenantComponent permissions', () => {
  const crear = (rol: 'Admin' | 'Escritura' | 'Lectura') =>
    new DashboardTenantComponent(
      {} as any,
      {} as any,
      {} as any,
      {
        permiso: {
          nivel: 'Tenant',
          rol,
          idTenant: 'tenant-1',
        },
      } as any
    );

  it('habilita acciones administrativas solamente al Tenant Admin', () => {
    expect(crear('Admin').puedeAdministrarTenant()).toBeTrue();
    expect(crear('Escritura').puedeAdministrarTenant()).toBeFalse();
    expect(crear('Lectura').puedeAdministrarTenant()).toBeFalse();
  });
});
