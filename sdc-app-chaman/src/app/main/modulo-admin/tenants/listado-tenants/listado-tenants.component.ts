import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ITenant } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { TenantService } from '../../../../auxiliares/http/tenant.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-tenants',
  imports: [SharedModule],
  templateUrl: './listado-tenants.component.html',
  styleUrl: './listado-tenants.component.scss',
})
export class ListadoTenantsComponent implements OnInit {
  tenants: ITenant[] = [];
  loading = false;

  constructor(
    private readonly service: TenantService,
    private readonly router: Router,
    private readonly confirmation: ConfirmationService,
    private readonly helper: HelperService,
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const result = await this.service.getFiltered({
        page: 0,
        limit: 0,
        sort: 'nombre',
        filter: JSON.stringify({ archivado: { $ne: true } }),
      });
      this.tenants = result.datos || [];
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  create(): void {
    this.router.navigateByUrl('/tenants/crear');
  }

  edit(tenant: ITenant): void {
    this.router.navigate(['/tenants/editar', tenant._id]);
  }

  activeModules(tenant: ITenant): string[] {
    return Object.entries(tenant.modulos || {})
      .filter(([, active]) => active)
      .map(([name]) => name);
  }

  archive(tenant: ITenant): void {
    this.confirmation.confirm({
      header: 'Archivar tenant',
      message: `Se archivara ${tenant.nombre}. Sus datos no se eliminan.`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Archivar', severity: 'danger' },
      accept: async () => {
        try {
          await this.service.archive(tenant._id!);
          this.tenants = this.tenants.filter((item) => item._id !== tenant._id);
          this.helper.notifSuccess('Tenant archivado correctamente');
        } catch (error) {
          this.helper.notifError(error);
        }
      },
    });
  }
}
