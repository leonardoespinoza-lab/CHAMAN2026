import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IListado, IPopulate, IQueryParam, IUsuario } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { UsuarioService } from '../../../auxiliares/http/usuario.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-usuarios',
  imports: [SharedModule],
  templateUrl: './listado-usuarios.component.html',
  styleUrl: './listado-usuarios.component.scss',
})
export class ListadoUsuariosComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoUsuariosComponent.name;
  public dataSource: IUsuario[] = [];
  public totalCount = 0;

  public dataSource$?: Subscription;

  // Opciones de paginación personalizadas para usuarios (filas más altas)
  public pageSizeOptions = [10, 20, 30, 50, 100];

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: UsuarioService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editUsuario', false);
    this.router.navigate(['usuarios', 'crear']);
  }

  public async edit(data: IUsuario) {
    this.params.set('editUsuario', data);
    this.router.navigate(['usuarios', 'editar', data._id]);
  }

  public async delete(dato: IUsuario): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el usuario?'),
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
          this.listado.deleteEntityItem('usuarios', dato._id!);

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
        path: 'permisos.quimica',
        select: 'nombre',
      },
      {
        path: 'permisos.distribuidor',
        select: 'nombre',
      },
      {
        path: 'permisos.productor',
        select: 'nombre',
      },
      {
        path: 'permisos.establecimiento',
        select: 'nombre',
      },
    ];
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };
    this.dataSource$?.unsubscribe();
    this.dataSource$ = this.listado.subscribe<IListado<IUsuario>>('usuarios', queryParams).subscribe(async (data) => {
      this.totalCount = data.totalCount;
      this.dataSource = data.datos;
      console.log(`listado de usuarios`, data);
    });
    await this.listado.getLastValue('usuarios', queryParams);
  }

  /// Hooks

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.dataSource$?.unsubscribe();
  }
}
