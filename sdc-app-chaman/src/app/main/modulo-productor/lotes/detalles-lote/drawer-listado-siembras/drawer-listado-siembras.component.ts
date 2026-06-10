import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { IFilter, IListado, IPopulate, IQueryParam, ISiembra } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

@Component({
  selector: 'app-drawer-listado-siembras',
  imports: [CommonModule, SharedModule],
  templateUrl: './drawer-listado-siembras.component.html',
  styleUrl: './drawer-listado-siembras.component.scss',
})
export class DrawerListadoSiembrasComponent implements OnInit, OnDestroy {
  public loading = false;
  @Input() public visible: boolean = true;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Output() public onSelectSiembra = new EventEmitter<ISiembra>();

  @Input() public lote?: IDetallesLote;

  // Listados
  public siembras?: ISiembra[];
  private siembras$?: Subscription;

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private translate: TranslateService,
    private confirmationService: ConfirmationService,
    private service: SiembraService
  ) {}

  private async listarSiembras(): Promise<void> {
    if (this.lote) {
      const filter: IFilter<ISiembra> = {
        idLote: this.lote._id,
      };
      const populate: IPopulate = {
        path: 'semilla',
      };
      const query: IQueryParam = {
        filter: JSON.stringify(filter),
        populate: JSON.stringify(populate),
        sort: '-fechaSiembra',
        limit: 0,
      };
      //
      this.siembras$?.unsubscribe();
      this.siembras$ = this.listado.subscribe<IListado<ISiembra>>('siembras', query).subscribe((data) => {
        this.siembras = data?.datos || [];
      });
      await this.listado.getLastValue('siembras', query);
    }
  }

  public async eliminar(dato: ISiembra) {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar la siembra?'),
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
          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  public selectSiembra(data: ISiembra) {
    this.onSelectSiembra.emit(data);
  }

  async ngOnInit(): Promise<void> {
    await this.listarSiembras();
  }

  ngOnDestroy(): void {}
}
