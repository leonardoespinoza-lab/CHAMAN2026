import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IFumigacion } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { FumigacionService } from '../../../../../auxiliares/http/fumigacion.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';

@Component({
  selector: 'app-drawer-listado-fumigaciones',
  imports: [CommonModule, SharedModule],
  templateUrl: './drawer-listado-fumigaciones.component.html',
  styleUrl: './drawer-listado-fumigaciones.component.scss',
})
export class DrawerListadoFumigacionesComponent implements OnInit, OnDestroy {
  public loading = false;
  @Input() public visible: boolean = true;
  @Output() public visibleChange = new EventEmitter<boolean>();

  @Input() public fumigaciones: IFumigacion[] = [];

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private translate: TranslateService,
    private confirmationService: ConfirmationService,
    private service: FumigacionService,
    private router: Router,
    private params: ParamsService
  ) {}

  public editar(dato: IFumigacion): void {
    this.params.set('editFumigacion', dato);
    this.router.navigate(['/lotes/fumigar/', dato._id]);
  }

  public async eliminar(dato: IFumigacion) {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar la fumigación?'),
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

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}
}
