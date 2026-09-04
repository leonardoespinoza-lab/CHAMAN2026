import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  IAlerta,
  IListado,
  IPermiso,
  IQueryParam,
  ITenant,
  IUsuario,
  NivelPermiso,
} from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { PrimeNG } from 'primeng/config';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { PRIMENG_BR } from '../../../../public/i18n/primeng-br';
import { PRIMENG_EN } from '../../../../public/i18n/primeng-en';
import { PRIMENG_ES } from '../../../../public/i18n/primeng-es';
import { AlertaService } from '../../auxiliares/http/alerta.service';
import { LoginService } from '../../auxiliares/http/login.service';
import { TenantService } from '../../auxiliares/http/tenant.service';
import {
  esNivelPermiso,
  etiquetaNivel,
  indicePermiso,
  permisoPrincipal,
  puedeAdministrar,
  puedeEscribir,
  rutaInicioPermiso,
} from '../../auxiliares/seguridad/access-policy';
import { HelperService } from '../../auxiliares/servicios/helper';
import { ListadosService } from '../../auxiliares/servicios/listados';
import { PushNotificationsService } from '../../auxiliares/servicios/push-notifications';
import { WebSocketService } from '../../auxiliares/servicios/websocket';
import { TenantThemeService } from '../../auxiliares/servicios/tenant-theme.service';
import { SharedModule } from '../../auxiliares/shared.module';
import { ENV, VERSION } from '../../environments/environment';
import { CambiarPasswordComponent } from '../usuarios/cambiar-password/cambiar-password.component';

@Component({
  selector: 'app-nav',
  imports: [SharedModule],
  providers: [DialogService],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.scss',
})
export class NavComponent implements OnInit, OnDestroy {
  public version = VERSION;
  public env = ENV;
  public visible = false;
  public user?: IUsuario;
  public user$?: Subscription;
  public permisos: IPermiso[] = [];
  public permisoSeleccionado?: IPermiso;
  public tenant?: ITenant;
  public rutaActual = '';
  public routerEvents$?: Subscription;
  public alertasActivasCount = 0;
  public alertasCriticasCount = 0;
  public cargandoIndicadorAlertas = false;
  private alertasWs$?: Subscription;

  public languageOptions = [
    { code: 'es', label: 'Español', short: 'ES', icon: 'images/flags/es.jpg' },
    { code: 'en', label: 'English', short: 'EN', icon: 'images/flags/en.jpg' },
    { code: 'br', label: 'Português', short: 'PT', icon: 'images/flags/br.jpg' },
  ];

  ref: DynamicDialogRef<any> | null = null;

  constructor(
    public ws: WebSocketService,
    public helper: HelperService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private primeng: PrimeNG,
    private alertasService: AlertaService,
    private router: Router,
    private listados: ListadosService,
    private webSocketService: WebSocketService,
    public pushNotificationsService: PushNotificationsService,
    public loginService: LoginService,
    private tenantService: TenantService,
    private tenantTheme: TenantThemeService,
    public route: ActivatedRoute,
    private dialogService: DialogService
  ) {}

  public logout(event: Event) {
    try {
      this.confirmationService.confirm({
        target: event.target as EventTarget,
        header: this.translate.instant('Por favor, confirme la acción'),
        message: this.translate.instant('¿Desea cerrar la sesión?'),
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
          try {
            await this.loginService.logout();
          } finally {
            this.listados.borrarCache();
            this.webSocketService.closeWS();
            await this.router.navigateByUrl('auth');
          }
        },
      });
    } catch (e) {
      console.log(e);
    }
  }

  public async cambiarPassword() {
    this.visible = false; // Cerrar el drawer si está abierto
    this.ref = this.dialogService.open(CambiarPasswordComponent, {
      data: {
        nombre: this.user?.datosPersonales?.nombre || this.user?.username,
      },
      header: this.translate.instant('Cambiar contraseña'),
    });
  }

  private async subscribeUsuarioPropio() {
    this.user$?.unsubscribe();
    this.user$ = this.listados.subscribe<IUsuario>('usuarioPropio', {}).subscribe(async (data) => {
      this.user = data;
      this.permisos = this.user?.permisos || [];
      if (!this.helper.permiso) {
        const principal = permisoPrincipal(this.permisos);
        if (principal) {
          this.helper.setPermiso(principal);
        }
      }
      this.permisoSeleccionado =
        this.helper.permiso || permisoPrincipal(this.permisos);
      let indice = indicePermiso(this.permisos, this.permisoSeleccionado);
      if (indice < 0) {
        this.permisoSeleccionado = permisoPrincipal(this.permisos);
        if (this.permisoSeleccionado) {
          this.helper.setPermiso(this.permisoSeleccionado);
          indice = indicePermiso(this.permisos, this.permisoSeleccionado);
        }
      }
      this.helper.setNumeroPermiso(Math.max(indice, 0));
      this.checkPermisos();
      await this.actualizarTenantContexto();
      this.actualizarIndicadorAlertas();
    });
    await this.listados.getLastValue('usuarioPropio', {});
  }

  private checkPermisos() {
    this.loginService.resetPermisos();
    const permiso = this.helper.permiso;
    if (!permiso) return;
    this.loginService.esEstablecimiento = esNivelPermiso(
      permiso,
      'Establecimiento'
    );
    this.loginService.esTenant = esNivelPermiso(permiso, 'Tenant');
    this.loginService.esProductor = esNivelPermiso(permiso, 'Productor');
    this.loginService.esDistribuidor = esNivelPermiso(permiso, 'Distribuidor');
    this.loginService.esAsesor = esNivelPermiso(permiso, 'Asesor');
    this.loginService.esQuimica = esNivelPermiso(permiso, 'Quimica');
    this.loginService.esAdmin = esNivelPermiso(permiso, 'Admin');
  }

  private redirect() {
    if (this.router.url === '/') {
      this.router.navigateByUrl(rutaInicioPermiso(this.permisoActivo()));
    }
  }

  private forcedRedirect() {
    const inicio = rutaInicioPermiso(this.permisoActivo());
    this.router.navigateByUrl(
      `${inicio}?permiso=${this.helper.numeroPermiso ?? 0}`
    );
  }

  public async onCambioPermiso(permiso: IPermiso): Promise<void> {
    this.permisoSeleccionado = permiso;
    this.helper.setPermiso(permiso);
    const indice = indicePermiso(this.permisos, this.permisoSeleccionado);
    this.helper.setNumeroPermiso(indice);
    this.checkPermisos();
    await this.actualizarTenantContexto();
    this.reload();
    this.actualizarIndicadorAlertas();
    this.forcedRedirect();
    this.visible = false;
  }

  public mostrarMenuModal(): boolean {
    return true;
  }

  public puedeGestionarUsuarios(): boolean {
    return puedeAdministrar(this.permisoActivo());
  }

  public puedeGestionarCarteraAgronomica(): boolean {
    return this.esNivel('Asesor') && puedeEscribir(this.permisoActivo());
  }

  public esNivel(...niveles: NivelPermiso[]): boolean {
    return esNivelPermiso(this.permisoActivo(), ...niveles);
  }

  public permisoActivo(): IPermiso | null {
    return this.permisoSeleccionado || this.helper.permiso;
  }

  public mostrarMenuFlotante(): boolean {
    const ruta = this.getRutaLimpia();
    return !ruta.startsWith('/login') && !ruta.startsWith('/auth');
  }

  public mostrarIndicadorAlertas(): boolean {
    return this.puedeVerAlertas() && this.alertasActivasCount > 0;
  }

  public alertasActivasLabel(): string {
    if (this.alertasActivasCount > 99) {
      return '99+';
    }
    return String(this.alertasActivasCount);
  }

  public alertaTooltip(): string {
    if (!this.alertasActivasCount) {
      return 'Sin alarmas activas';
    }
    const altas = this.alertasCriticasCount ? `, ${this.alertasCriticasCount} de alta prioridad` : '';
    return `${this.alertasActivasCount} alarma${this.alertasActivasCount === 1 ? '' : 's'} activa${
      this.alertasActivasCount === 1 ? '' : 's'
    }${altas}`;
  }

  public abrirMenu(event?: Event): void {
    event?.stopPropagation();
    this.visible = true;
  }

  public cerrarMenu(event?: Event): void {
    event?.stopPropagation();
    this.visible = false;
  }

  public logoAlcance(): string | undefined {
    if (this.tenant?.branding?.logo) {
      return this.tenant?.branding?.logo;
    }
    if (this.permisoSeleccionado?.nivel === 'Quimica') {
      return this.permisoSeleccionado.quimica?.logo;
    }

    if (this.permisoSeleccionado?.nivel === 'Distribuidor') {
      return this.permisoSeleccionado.distribuidor?.logo;
    }

    if (this.permisoSeleccionado?.nivel === 'Productor') {
      return this.permisoSeleccionado.productor?.logo;
    }

    return undefined;
  }

  public nombreAlcance(): string {
    if (this.esNivel('Tenant')) {
      return this.tenant?.branding?.nombreAplicacion || this.tenant?.nombre || 'Tenant';
    }
    if (this.esNivel('Quimica')) {
      return this.permisoActivo()?.quimica?.nombre || 'Compañía';
    }

    if (this.esNivel('Distribuidor')) {
      return this.permisoActivo()?.distribuidor?.nombre || 'Distribuidor';
    }

    if (this.esNivel('Asesor')) {
      return this.helper.user?.datosPersonales?.nombre || 'Asesor';
    }

    if (this.esNivel('Productor')) {
      return this.permisoActivo()?.productor?.nombre || 'Productor';
    }

    if (this.esNivel('Establecimiento')) {
      return (
        this.permisoActivo()?.establecimiento?.nombre || 'Establecimiento'
      );
    }

    return etiquetaNivel(this.permisoActivo()?.nivel || 'Admin');
  }

  public nombrePermiso(permiso?: IPermiso): string {
    if (!permiso) return 'Sin alcance';
    if (permiso.nivel === 'Tenant') {
      return (
        this.tenant?.branding?.nombreAplicacion ||
        this.tenant?.nombre ||
        'Tenant'
      );
      }
      if (permiso.nivel === 'Asesor') {
        return (
          this.user?.datosPersonales?.nombre ||
          this.user?.username ||
          this.helper.user?.datosPersonales?.nombre ||
          this.helper.user?.username ||
          'Asesor'
        );
      }
    if (permiso.nivel === 'Quimica') {
      return permiso.quimica?.nombre || 'Compañía';
    }
    if (permiso.nivel === 'Distribuidor') {
      return permiso.distribuidor?.nombre || 'Distribuidor';
    }
    if (permiso.nivel === 'Productor') {
      return permiso.productor?.nombre || 'Productor';
    }
    if (permiso.nivel === 'Establecimiento') {
      return permiso.establecimiento?.nombre || 'Establecimiento';
    }
    return 'Administración Chaman';
  }

  public descripcionAlcance(): string {
    const nivel = this.permisoSeleccionado?.nivel || 'Admin';
    const rol = this.permisoSeleccionado?.rol || 'Admin';
    return `${nivel} - ${rol}`;
  }

  public accionLogo(event?: Event): void {
    this.abrirMenu(event);
  }

  public volver(): void {
    if (!this.mostrarVolver()) {
      this.irInicio();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    this.irInicio();
  }

  public irInicio(): void {
    this.router.navigateByUrl(rutaInicioPermiso(this.permisoActivo()));
  }

  public mostrarVolver(): boolean {
    const ruta = this.getRutaLimpia();
    return !['/', '/mapa', '/dashboard-admin', '/dashboard-tenant', '/dashboard-quimica', '/dashboard-distribuidor'].includes(ruta);
  }

  private getRutaLimpia(): string {
    return (this.rutaActual || this.router.url || '').split('?')[0].split('#')[0] || '/';
  }

  public changeLang(lang: string) {
    localStorage.setItem('lang', lang);
    this.translate.use(lang);
    switch (lang) {
      case 'es':
        this.primeng.setTranslation(PRIMENG_ES);
        break;
      case 'en':
        this.primeng.setTranslation(PRIMENG_EN);
        break;
      case 'br':
        this.primeng.setTranslation(PRIMENG_BR);
        break;
    }
  }

  public idiomaActivo(lang: string): boolean {
    const actual = this.translate.currentLang || localStorage.getItem('lang') || this.translate.defaultLang || 'es';
    return actual === lang;
  }

  private reload() {
    // borrar el caché de los listados
    this.listados.borrarCache();
    // window.location.reload();
  }

  private async actualizarIndicadorAlertas(): Promise<void> {
    if (!this.puedeVerAlertas()) {
      this.alertasActivasCount = 0;
      this.alertasCriticasCount = 0;
      return;
    }

    this.cargandoIndicadorAlertas = true;
    try {
      const query: IQueryParam = {
        filter: JSON.stringify({ activa: true }),
        limit: 1,
      };
      const altasQuery: IQueryParam = {
        filter: JSON.stringify({
          activa: true,
          severidad: { $in: ['alta', 'critica'] },
        }),
        limit: 1,
      };
      const [activas, altas] = await Promise.all([
        this.alertasService.listar(query),
        this.alertasService.listar(altasQuery),
      ]);
      this.alertasActivasCount = this.totalListado(activas);
      this.alertasCriticasCount = this.totalListado(altas);
    } catch (error) {
      console.warn('No se pudo actualizar el indicador de alertas', error);
      this.alertasActivasCount = 0;
      this.alertasCriticasCount = 0;
    } finally {
      this.cargandoIndicadorAlertas = false;
    }
  }

  private puedeVerAlertas(): boolean {
    return this.esNivel(
      'Quimica',
      'Distribuidor',
      'Asesor',
      'Productor',
      'Establecimiento'
    );
  }

  private async actualizarTenantContexto(): Promise<void> {
    const idTenant = this.helper.permiso?.idTenant || this.permisoSeleccionado?.idTenant;
    if (!idTenant) {
      this.tenant = undefined;
      this.tenantTheme.clear();
      return;
    }
    try {
      this.tenant = await this.tenantService.getCurrent();
      this.tenantTheme.apply(this.tenant);
    } catch (error) {
      this.tenant = undefined;
      this.tenantTheme.clear();
      console.warn('No se pudo cargar la identidad del tenant', error);
    }
  }

  private totalListado(listado?: IListado<IAlerta>): number {
    return listado?.totalCount ?? listado?.datos?.length ?? 0;
  }

  private subscribeIndicadorAlertasWs(): void {
    this.alertasWs$?.unsubscribe();
    this.alertasWs$ = this.webSocketService.getMessage().subscribe((message) => {
      if (message.paths?.includes('alertas')) {
        this.actualizarIndicadorAlertas();
      }
    });
  }

  /// HOOKS
  public async ngOnInit(): Promise<void> {
    this.webSocketService.initWs();
    this.rutaActual = this.router.url;
    this.routerEvents$ = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.rutaActual = (event as NavigationEnd).urlAfterRedirects;
      });
    this.checkPermisos();
    await this.subscribeUsuarioPropio();
    this.subscribeIndicadorAlertasWs();
    await this.actualizarIndicadorAlertas();
    this.redirect();
  }

  public async ngOnDestroy(): Promise<void> {
    this.user$?.unsubscribe();
    this.routerEvents$?.unsubscribe();
    this.alertasWs$?.unsubscribe();
    this.tenantTheme.clear();
  }
}
