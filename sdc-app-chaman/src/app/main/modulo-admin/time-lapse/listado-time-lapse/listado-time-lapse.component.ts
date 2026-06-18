import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IListado, ILote, IQueryParam } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { AsignarCamaraLoteComponent } from '../asignar-camara-lote/asignar-camara-lote.component';

@Component({
  selector: 'app-listado-time-lapse',
  imports: [SharedModule, AsignarCamaraLoteComponent],
  templateUrl: './listado-time-lapse.component.html',
  styleUrl: './listado-time-lapse.component.scss',
})
export class ListadoTimeLapseComponent implements OnInit, OnDestroy {
  public loading = false;
  public editarLote: ILote | null = null;

  public name = ListadoTimeLapseComponent.name;
  public datos: ILote[] = [];
  public totalCount = 0;
  public visible = false;

  public datos$?: Subscription;

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: LoteService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    // this.params.set('editQuimica', false);
    // this.router.navigate(['time-lapse', 'asignar-camara']);
    this.editarLote = null;
    this.visible = true;
  }

  public async edit(data: ILote) {
    this.editarLote = data;
    // this.router.navigate(['time-lapse', 'asignar-camara']);
    this.visible = true;
  }

  public async fotos(data: ILote) {
    // this.editarLote = data;
    this.params.set('Lote', data);
    this.router.navigate(['time-lapse', 'fotos', data._id]);
    // this.visible = true;
  }

  public async delete(dato: ILote): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea desvincular la camara?'),
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
          await this.service.editar(dato._id!, { serialCamara: '' });

          // Solo elimina el item en cache
          this.listado.deleteEntityItem('lotes', dato._id!);

          this.helper.notifSuccess(this.translate.instant('Desvinculado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  // Listados

  private async listar(): Promise<void> {
    const filtro = { serialCamara: { $exists: true, $ne: '' } };
    const queryParams: IQueryParam = {
      page: 0,
      filter: JSON.stringify(filtro),
      limit: 0,
      sort: 'nombre',
    };

    this.datos$?.unsubscribe();
    this.datos$ = this.listado.subscribe<IListado<ILote>>('lotes', queryParams).subscribe(async (data) => {
      this.totalCount = data.totalCount;
      this.datos = data.datos;
      console.log(`listado de lotes`, data);
    });
    await this.listado.getLastValue('lotes', queryParams);
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
