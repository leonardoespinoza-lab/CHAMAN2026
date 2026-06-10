import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IListado, IPopulate, IProductor, IQueryParam } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { ProductorsService } from '../../../../auxiliares/http/productor.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-productores',
  imports: [SharedModule],
  templateUrl: './listado-productores.component.html',
  styleUrl: './listado-productores.component.scss',
})
export class ListadoProductoresComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoProductoresComponent.name;
  public datos: IProductor[] = [];
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
    private service: ProductorsService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editProductor', false);
    this.router.navigate(['productores', 'crear']);
  }

  public async edit(data: IProductor) {
    this.params.set('editProductor', data);
    this.router.navigate(['productores', 'editar', data._id]);
  }

  public async delete(dato: IProductor): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el productor?'),
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
          this.listado.deleteEntityItem('productors', dato._id!);

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
    const populate: IPopulate[] = [
      {
        path: 'quimica',
        select: 'nombre',
      },
      {
        path: 'distribuidor',
        select: 'nombre',
      },
    ];
    const queryParams: IQueryParam = {
      populate: JSON.stringify(populate),
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.datos$?.unsubscribe();
    this.datos$ = this.listado.subscribe<IListado<IProductor>>('productors', queryParams).subscribe(async (data) => {
      this.totalCount = data.totalCount;
      this.datos = data.datos;
      console.log(`listado de productors`, data);
    });
    await this.listado.getLastValue('productors', queryParams);
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
