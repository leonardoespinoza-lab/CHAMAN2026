import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ITenant } from 'modelos/src';
import { TenantService } from '../../../auxiliares/http/tenant.service';
import { puedeAdministrar } from '../../../auxiliares/seguridad/access-policy';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { TenantThemeService } from '../../../auxiliares/servicios/tenant-theme.service';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-dashboard-tenant',
  imports: [SharedModule],
  templateUrl: './dashboard-tenant.component.html',
  styleUrl: './dashboard-tenant.component.scss',
})
export class DashboardTenantComponent implements OnInit {
  tenant?: ITenant;
  loading = true;

  constructor(
    private readonly tenants: TenantService,
    private readonly theme: TenantThemeService,
    private readonly router: Router,
    private readonly helper: HelperService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.tenant = await this.tenants.getCurrent();
      this.theme.apply(this.tenant);
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  activeModules(): string[] {
    return Object.entries(this.tenant?.modulos || {})
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);
  }

  capacity(label: string, enabled?: boolean): { label: string; enabled: boolean } {
    return { label, enabled: Boolean(enabled) };
  }

  capacities(): { label: string; enabled: boolean }[] {
    const c = this.tenant?.capacidades;
    return [
      this.capacity('Companias', c?.administrarCompanias),
      this.capacity('Distribuidores', c?.administrarDistribuidores),
      this.capacity('Asesores', c?.administrarAsesores),
      this.capacity('Productores', c?.administrarProductores),
      this.capacity(
        'Asesores gestionan productores',
        c?.administrarAsesores && c?.administrarProductores,
      ),
    ];
  }

  puedeAdministrarTenant(): boolean {
    return puedeAdministrar(this.helper.permiso);
  }

  go(route: string): void {
    void this.router.navigateByUrl(route);
  }
}
