import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IDispositivo, IListado, IQueryParam } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { UbicarComponent } from '../../../../auxiliares/componentes/ubicar/ubicar.component';
import { ProductorsService } from '../../../../auxiliares/http/productor.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { BateriaComponent } from '../bateria/bateria.component';
import { DispositivoService } from '../../../../auxiliares/http/dispositivos.service';

@Component({
  selector: 'app-listado-dispositivos',
  imports: [SharedModule, BateriaComponent, UbicarComponent],
  templateUrl: './listado-dispositivos.component.html',
  styleUrl: './listado-dispositivos.component.scss',
})
export class ListadoDispositivosComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoDispositivosComponent.name;
  public datos: IDispositivo[] = [];
  public totalCount = 0;

  public datos$?: Subscription;

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listados: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: DispositivoService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editDispositivo', false);
    this.router.navigate(['dispositivos', 'crear']);
  }

  public async edit(data: IDispositivo) {
    this.params.set('editDispositivo', data);
    this.router.navigate(['dispositivos', 'editar', data._id]);
  }

  public detalles(data: IDispositivo) {
    this.params.set('detallesDispositivo', data);
    this.router.navigate(['dispositivos', 'detalles', data?._id]);
  }

  public async delete(dato: IDispositivo): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el dispositivo?'),
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
          this.listados.deleteEntityItem('dispositivos', dato._id!);

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
    this.datos$ = this.listados
      .subscribe<IListado<IDispositivo>>('dispositivos', queryParams)
      .subscribe(async (data) => {
        this.totalCount = data.totalCount;
        this.datos = data.datos;
        console.log(`listado de dispositivos`, data);
      });
    await this.listados.getLastValue('dispositivos', queryParams);
  }

  /// Hooks

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }
}
