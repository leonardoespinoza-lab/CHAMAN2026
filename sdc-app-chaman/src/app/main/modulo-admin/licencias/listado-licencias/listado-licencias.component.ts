import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ILicencia, ILicenciaPorEntidad, IListado, IQueryParam } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { LicenciaPorEntidadService } from '../../../../auxiliares/http/licencia-por-entidad.service';
import { LicenciaService } from '../../../../auxiliares/http/licencia.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-licencias',
  imports: [SharedModule],
  templateUrl: './listado-licencias.component.html',
  styleUrl: './listado-licencias.component.scss',
})
export class ListadoLicenciasComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoLicenciasComponent.name;
  public datos: ILicencia[] = [];
  public asociaciones: ILicenciaPorEntidad[] = [];
  public totalCount = 0;
  private asociacionesPorLicencia = new Map<string, ILicenciaPorEntidad[]>();

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: LicenciaService,
    private licenciaPorEntidadService: LicenciaPorEntidadService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editLicencia', false);
    this.router.navigate(['licencias', 'crear']);
  }

  public async edit(data: ILicencia) {
    this.params.set('editLicencia', data);
    this.router.navigate(['licencias', 'editar', data._id]);
  }

  public async delete(dato: ILicencia): Promise<void> {
    if (dato.default || this.getAsociaciones(dato).length > 0) {
      this.helper.notifError('No se puede eliminar una licencia asociada. Reasigne primero la entidad.');
      return;
    }

    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar la licencia?'),
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
          this.listado.deleteEntityItem('licencias', dato._id!);
          this.datos = this.datos.filter((item) => item._id !== dato._id);

          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  public getAsociaciones(licencia: ILicencia): ILicenciaPorEntidad[] {
    if (!licencia._id) return [];
    return this.asociacionesPorLicencia.get(licencia._id) || [];
  }

  public getOrigen(licencia: ILicencia): string {
    if (licencia.default) return 'Default del sistema';
    if (licencia.origen === 'automatico') return 'Automatica';
    if (licencia.origen === 'manual') return 'Manual';
    if (licencia.origen === 'sistema') return 'Sistema';
    return this.getAsociaciones(licencia).length > 0 ? 'Sin origen registrado' : 'Manual / sin uso';
  }

  public getOrigenClass(licencia: ILicencia): string {
    if (licencia.default) return 'license-origin system';
    if (licencia.origen === 'automatico') return 'license-origin automatic';
    if (licencia.origen === 'manual') return 'license-origin manual';
    return 'license-origin unknown';
  }

  public getEntidadLabel(asociacion: ILicenciaPorEntidad): string {
    const quimica = asociacion.quimica?.nombre;
    const distribuidor = asociacion.distribuidor?.nombre;
    const productor = asociacion.productor?.nombre;
    if (quimica) return `Quimica: ${quimica}`;
    if (distribuidor) return `Distribuidor: ${distribuidor}`;
    if (productor) return `Productor: ${productor}`;
    return asociacion.idEntidad ? `Entidad ${asociacion.idEntidad}` : 'Sin entidad';
  }

  public getEntidadesResumen(licencia: ILicencia): string {
    const asociaciones = this.getAsociaciones(licencia);
    if (!asociaciones.length) return 'Sin entidad asociada';
    const primeras = asociaciones.slice(0, 2).map((asociacion) => this.getEntidadLabel(asociacion));
    const extra = asociaciones.length > primeras.length ? ` +${asociaciones.length - primeras.length}` : '';
    return `${primeras.join(' | ')}${extra}`;
  }

  public getVigenciaResumen(licencia: ILicencia): string {
    const asociaciones = this.getAsociaciones(licencia);
    if (!asociaciones.length) return 'Sin asignacion activa';
    const vigentes = asociaciones
      .filter((asociacion) => this.estaVigente(asociacion))
      .sort((a, b) => new Date(a.fechaExpiracion || 0).getTime() - new Date(b.fechaExpiracion || 0).getTime());
    if (vigentes.length) {
      return `Vigente hasta ${this.formatDate(vigentes[0].fechaExpiracion)}`;
    }
    return `Vencida ${this.formatDate(asociaciones[0].fechaExpiracion)}`;
  }

  public getModulosActivos(licencia: ILicencia): string[] {
    return Object.entries(licencia.modulos || {})
      .filter(([, activo]) => !!activo)
      .map(([modulo]) => modulo.replace('HÃ­drica', 'Hidrica').replace('FenolÃ³gicas', 'Fenologicas'));
  }

  public getCapacidad(licencia: ILicencia): string {
    const usuarios = licencia.maxUsuarios ?? 0;
    const lotes = licencia.maxLotes ?? 0;
    const hectareas = licencia.maxdHectareas ?? 0;
    return `${usuarios} usuarios | ${lotes} lotes | ${hectareas} ha`;
  }

  public formatDate(fecha?: string): string {
    if (!fecha) return 'sin fecha';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return 'sin fecha';
    return date.toLocaleDateString('es-AR');
  }

  public estaVigente(asociacion: ILicenciaPorEntidad): boolean {
    if (!asociacion.fechaExpiracion) return false;
    return new Date(asociacion.fechaExpiracion).getTime() >= Date.now();
  }

  public puedeEliminar(licencia: ILicencia): boolean {
    return !licencia.default && this.getAsociaciones(licencia).length === 0;
  }

  private indexarAsociaciones(): void {
    const map = new Map<string, ILicenciaPorEntidad[]>();
    for (const asociacion of this.asociaciones) {
      if (!asociacion.idLicencia) continue;
      if (!map.has(asociacion.idLicencia)) {
        map.set(asociacion.idLicencia, []);
      }
      map.get(asociacion.idLicencia)?.push(asociacion);
    }
    this.asociacionesPorLicencia = map;
  }

  // Listados

  private async listar(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    const asociacionesQuery: IQueryParam = {
      page: 0,
      limit: 0,
      sort: '-fechaCreacion',
      populate: 'licencia productor distribuidor quimica',
    };
    const [licencias, asociaciones]: [IListado<ILicencia>, IListado<ILicenciaPorEntidad>] = await Promise.all([
      this.service.getFiltered(queryParams),
      this.licenciaPorEntidadService.getFiltered(asociacionesQuery),
    ]);
    this.totalCount = licencias.totalCount;
    this.datos = licencias.datos;
    this.asociaciones = asociaciones.datos;
    this.indexarAsociaciones();
  }

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.asociacionesPorLicencia.clear();
  }
}
