import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IClimaEstacionMeteorologica, IListado, ILote, IQueryParam } from 'modelos/src';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

export interface ILoteTabla extends ILote {
  estacion?: IClimaEstacionMeteorologica;
}

@Component({
  selector: 'app-listado-lotes',
  imports: [SharedModule],
  templateUrl: './listado-lotes.component.html',
  styleUrl: './listado-lotes.component.scss',
})
export class ListadoLotesComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoLotesComponent.name;
  public dataSource: ILoteTabla[] = [];
  public totalCount = 0;
  public expandedRow: ILoteTabla | null = null;

  public dataSource$?: Subscription;

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private translate: TranslateService,
    private service: LoteService,
    private params: ParamsService,
    private router: Router
  ) {}

  // Acciones
  public async detalles(data: ILoteTabla) {
    this.params.set('detallesLote', data);
    this.router.navigate(['lotes', 'detalles', data._id]);
  }

  public async create() {
    this.params.set('editLote', false);
    this.router.navigate(['lotes', 'crear']);
  }

  public async edit(data: ILoteTabla) {
    this.params.set('editLote', data);
    this.router.navigate(['lotes', 'editar', data._id]);
  }

  public async delete(dato: ILoteTabla): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el lote?'),
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
          this.listado.deleteEntityItem('lotes', dato._id!);
          
          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  public async fertilizar(data: ILoteTabla): Promise<void> {
    this.params.set('fertilizarLote', data);
    this.params.set('editFertilizacion', false);
    this.router.navigate(['lotes', 'fertilizar', data._id]);
  }

  public async fumigar(data: ILoteTabla): Promise<void> {
    this.params.set('fumigarLote', data);
    this.params.set('editFumigacion', false);
    this.router.navigate(['lotes', 'fumigar', data._id]);
  }

  public async cosechar(data: ILoteTabla): Promise<void> {
    this.params.set('cosecharLote', data);
    this.router.navigate(['lotes', 'cosechar', data._id]);
  }

  public async sembrar(data: ILoteTabla): Promise<void> {
    this.params.set('sembrarLote', data);
    this.router.navigate(['lotes', 'sembrar', data._id]);
  }

  public elegirColor(n: number) {
    switch (n) {
      case 1:
        return {
          color: 'green',
        };
      case 2:
        return {
          color: 'yellow',
        };
      case 3:
        return {
          color: 'red',
        };
      default:
        return {
          color: 'grey',
        };
    }
  }

  public getText(n: number) {
    switch (n) {
      case 1:
        return this.translate.instant('Excelente');
      case 2:
        return this.translate.instant('Bueno');
      case 3:
        return this.translate.instant('Malo');
      default:
        return this.translate.instant('Sin datos');
    }
  }

  // Listados

  private async listar(): Promise<void> {
    const populate = [
      {
        path: 'establecimiento',
        select: 'nombre climaActual prediccionClimatica',
      },
      {
        path: 'departamento',
        select: 'nombre idProvincia',
        populate: {
          path: 'provincia',
          select: 'nombre',
        },
      },
      {
        path: 'sondaSuelo',
        select: 'name.custom',
      },
      {
        path: 'siembra',
        populate: [
          {
            path: 'semilla',
          },
          {
            path: 'crono',
          },
        ],
      },
      { path: 'dispositivos' },
    ];
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.dataSource$?.unsubscribe();
    this.dataSource$ = this.listado.subscribe<IListado<ILote>>('lotes', queryParams).subscribe(async (data) => {
      this.totalCount = data.totalCount;
      this.dataSource = data.datos;
    });
    await this.listado.getLastValue('lotes', queryParams);
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
