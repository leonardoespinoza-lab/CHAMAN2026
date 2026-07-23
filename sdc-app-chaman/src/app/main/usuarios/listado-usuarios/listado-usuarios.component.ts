import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IListado, IPermiso, IPopulate, IQueryParam, IUsuario } from 'modelos/src';
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
  public estado: 'operativos' | 'activos' | 'inactivos' | 'archivados' | 'todos' = 'operativos';
  public readonly estados = [
    { label: 'Operativos', value: 'operativos' },
    { label: 'Activos', value: 'activos' },
    { label: 'Inactivos', value: 'inactivos' },
    { label: 'Archivados', value: 'archivados' },
    { label: 'Todos', value: 'todos' },
  ];

  public dataSource$?: Subscription;

  // Opciones de paginación personalizadas para usuarios (filas más altas)
  public pageSizeOptions = [10, 20, 30, 50, 100];

  get user() {
    return this.helper.user;
  }

  get usuariosVisibles(): IUsuario[] {
    return this.dataSource.filter((usuario) => {
      if (this.estado === 'todos') return true;
      if (this.estado === 'archivados') return usuario.archivado === true;
      if (this.estado === 'inactivos') return usuario.activo === false && usuario.archivado !== true;
      if (this.estado === 'activos') return usuario.activo !== false && usuario.archivado !== true;
      return usuario.archivado !== true;
    });
  }

  get totalArchivados(): number {
    return this.dataSource.filter((usuario) => usuario.archivado === true).length;
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
    this.loading = true;
    try {
      const completo = await this.service.listarPorId(data._id!);
      this.params.set('editUsuario', completo);
      await this.router.navigate(['usuarios', 'editar', data._id]);
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  public resumenPermiso(permiso: IPermiso): string {
    if (permiso.nivel === 'Asesor') {
      return 'Gestiona productores y visualiza toda su red aguas abajo';
    }
    if (permiso.nivel === 'Establecimiento') {
      const nombre = permiso.establecimiento?.nombre || 'Establecimiento asignado';
      return permiso.idLotes?.length
        ? `${nombre} · ${permiso.idLotes.length} lotes`
        : `${nombre} · todos sus lotes`;
    }
    if (permiso.nivel === 'Productor') {
      return permiso.productor?.nombre || 'Productor asignado';
    }
    if (permiso.nivel === 'Distribuidor') {
      return permiso.distribuidor?.nombre || 'Distribuidor asignado';
    }
    if (permiso.nivel === 'Quimica') {
      return permiso.quimica?.nombre || 'Compania asignada';
    }
    return 'Acceso general de administracion';
  }

  public esAsesor(usuario: IUsuario): boolean {
    return Boolean(
      usuario.permisos?.some((permiso) => permiso.nivel === 'Asesor'),
    );
  }

  public async delete(dato: IUsuario): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea archivar el usuario? Se conservará para auditoría y perderá el acceso.'),
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

          this.helper.notifSuccess(this.translate.instant('Usuario archivado correctamente'));
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
      includeArchived: true,
      populate: JSON.stringify(populate),
      select: '-hash -datosProfesionales.foto',
    };
    this.dataSource$?.unsubscribe();
    this.dataSource$ = this.listado.subscribe<IListado<IUsuario>>('usuarios', queryParams).subscribe(async (data) => {
      this.totalCount = data.totalCount;
      this.dataSource = data.datos;
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
