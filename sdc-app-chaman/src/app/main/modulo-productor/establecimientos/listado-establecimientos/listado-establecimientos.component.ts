import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IEstablecimiento, IListado, IQueryParam } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { EstablecimientoService } from '../../../../auxiliares/http/establecimiento.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
@Component({
  selector: 'app-listado-establecimientos',
  imports: [SharedModule],
  templateUrl: './listado-establecimientos.component.html',
  styleUrl: './listado-establecimientos.component.scss',
})
export class ListadoEstablecimientosComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoEstablecimientosComponent.name;
  public dataSource: IEstablecimiento[] = [];
  public totalCount = 0;

  public dataSource$?: Subscription;

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: EstablecimientoService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editEstablecimiento', false);
    this.router.navigate(['establecimientos', 'crear']);
  }

  public async edit(data: IEstablecimiento) {
    this.params.set('editEstablecimiento', data);
    this.router.navigate(['establecimientos', 'editar', data._id]);
  }

  public async delete(dato: IEstablecimiento): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el establecimiento?'),
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
          await this.service.eliminar(dato._id!);

          // Solo elimina el item en cache
          this.listado.deleteEntityItem('establecimientos', dato._id!);
          
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

    this.dataSource$?.unsubscribe();
    this.dataSource$ = this.listado
      .subscribe<IListado<IEstablecimiento>>('establecimientos', queryParams)
      .subscribe(async (data) => {
        this.totalCount = data.totalCount;
        this.dataSource = data.datos;
        console.log(`listado de establecimientos`, data);
      });
    await this.listado.getLastValue('establecimientos', queryParams);
  }

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.dataSource$?.unsubscribe();
  }
}
