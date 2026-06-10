import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IDistribuidor, IListado, IPopulate, IQueryParam } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { DistribuidorService } from '../../../../auxiliares/http/distribuidor.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-distribuidores',
  imports: [SharedModule],
  templateUrl: './listado-distribuidores.component.html',
  styleUrl: './listado-distribuidores.component.scss',
})
export class ListadoDistribuidoresComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoDistribuidoresComponent.name;
  public datos: IDistribuidor[] = [];
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
    private service: DistribuidorService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editDistribuidor', false);
    this.router.navigate(['distribuidores', 'crear']);
  }

  public async edit(data: IDistribuidor) {
    this.params.set('editDistribuidor', data);
    this.router.navigate(['distribuidores', 'editar', data._id]);
  }

  public async delete(dato: IDistribuidor): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el distribuidor?'),
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

          this.listado.deleteEntityItem('distribuidors', dato._id!);

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
    const populate: IPopulate = {
      path: 'quimica',
      select: 'nombre',
    };
    const queryParams: IQueryParam = {
      populate: JSON.stringify(populate),
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.datos$?.unsubscribe();
    this.datos$ = this.listado
      .subscribe<IListado<IDistribuidor>>('distribuidors', queryParams)
      .subscribe(async (data) => {
        this.totalCount = data.totalCount;
        this.datos = data.datos;
        console.log(`listado de distribuidors`, data);
      });
    await this.listado.getLastValue('distribuidors', queryParams);
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
