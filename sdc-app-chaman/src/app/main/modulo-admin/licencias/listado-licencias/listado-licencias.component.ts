import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ILicencia, IListado, IQueryParam, IQuimica } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { LicenciaService } from '../../../../auxiliares/http/licencia.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-licencias',
  imports: [SharedModule],
  templateUrl: './listado-licencias.component.html',
  styleUrl: './listado-licencias.component.scss',
})
export class ListadoLicenciasComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoLicenciasComponent.name;
  public datos: ILicencia[] = [];
  public totalCount = 0;

  public datos$?: Subscription;

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: LicenciaService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editLicencia', false);
    this.router.navigate(['licencias', 'crear']);
  }

  public async edit(data: IQuimica) {
    this.params.set('editLicencia', data);
    this.router.navigate(['licencias', 'editar', data._id]);
  }

  public async delete(dato: IQuimica): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar la licencia?'),
      closable: true,
      closeOnEscape: true,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: {
        label: this.translate.instant('Aceptar'),
      },
      accept: async () => {
        this.loading = true;
        try {
          await this.service.delete(dato._id!);

          // Solo elimina el item en cache
          this.listado.deleteEntityItem('licencias', dato._id!);

          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  // Listados

  private async listar(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.datos$?.unsubscribe();
    this.datos$ = this.listado.subscribe<IListado<IQuimica>>('licencias', queryParams).subscribe(async (data) => {
      this.totalCount = data.totalCount;
      this.datos = data.datos;
      console.log(`listado de licencias`, data);
    });
    await this.listado.getLastValue('licencias', queryParams);
  }

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }
}
