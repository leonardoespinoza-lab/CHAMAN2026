import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IAlerta, IListado, IPermiso, IQueryParam, IUsuario } from 'modelos/src';
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
import { HelperService } from '../../auxiliares/servicios/helper';
import { ListadosService } from '../../auxiliares/servicios/listados';
import { PushNotificationsService } from '../../auxiliares/servicios/push-notifications';
import { WebSocketService } from '../../auxiliares/servicios/websocket';
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
        accept: () => {
          this.loginService.resetPermisos();
          this.helper.removeToken();
          this.listados.borrarCache();
          this.webSocketService.closeWS();
          this.router.navigateByUrl('auth');
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
        const permisoPrincipal = this.getPermisoPrincipal(this.permisos);
        if (permisoPrincipal) {
          this.helper.setPermiso(permisoPrincipal);
        }
      }
      this.permisoSeleccionado = this.helper.permiso || this.getPermisoPrincipal(this.permisos);
      let indice = this.permisoSeleccionado ? this.encontrarIndicePermiso(this.permisos, this.permisoSeleccionado) : -1;
      if (indice < 0) {
        this.permisoSeleccionado = this.getPermisoPrincipal(this.permisos);
        if (this.permisoSeleccionado) {
          this.helper.setPermiso(this.permisoSeleccionado);
          indice = this.encontrarIndicePermiso(this.permisos, this.permisoSeleccionado);
        }
      }
      this.helper.setNumeroPermiso(Math.max(indice, 0));
      this.checkPermisos();
      this.actualizarIndicadorAlertas();
    });
    await this.listados.getLastValue('usuarioPropio', {});
  }

  private getPermisoPrincipal(permisos: IPermiso[]): IPermiso | undefined {
    const prioridad: Record<string, number> = {
      Admin: 5,
      Quimica: 4,
      Distribuidor: 3,
      Productor: 2,
      Establecimiento: 1,
    };
    return [...permisos].sort((a, b) => (prioridad[b.nivel] || 0) - (prioridad[a.nivel] || 0))[0];
  }

  private encontrarIndicePermiso(permisos: IPermiso[], permisoABuscar: Partial<IPermiso>): number {
    return permisos.findIndex((permiso) => {
      // Comparar las propiedades relevantes
      return (
        permiso.nivel === permisoABuscar.nivel &&
        permiso.rol === permisoABuscar.rol &&
        permiso.idQuimica === permisoABuscar.idQuimica &&
        permiso.idDistribuidor === permisoABuscar.idDistribuidor &&
        permiso.idProductor === permisoABuscar.idProductor &&
        permiso.idEstablecimiento === permisoABuscar.idEstablecimiento
      );
    });
  }

  private checkPermisos() {
    this.loginService.resetPermisos();
    const permiso = this.helper.permiso;
    if (!permiso) return;
    const esEstablecimiento = permiso?.nivel === 'Establecimiento';
    const esProductor = permiso?.nivel === 'Productor';
    const esDistribuidor = permiso?.nivel === 'Distribuidor';
    const esQuimica = permiso?.nivel === 'Quimica';
    const esAdmin = permiso?.nivel === 'Admin';
    this.loginService.esEstablecimiento = esEstablecimiento || false;
    this.loginService.esProductor = esProductor || false;
    this.loginService.esDistribuidor = esDistribuidor || false;
    this.loginService.esQuimica = esQuimica || false;
    this.loginService.esAdmin = esAdmin || false;
    // console.log('Permiso:', this.permisoSeleccionado);
    // console.log('Permisos:', this.permisos);
    // console.log('Permiso STORAGE:', this.helper.permiso);
    // console.log('Permiso NUMERO STORAGE:', this.helper.numeroPermiso);
    // console.log('Es Productor:', this.loginService.esProductor);
    // console.log('Es Distribuidor:', this.loginService.esDistribuidor);
    // console.log('Es Quimica:', this.loginService.esQuimica);
    // console.log('Es Admin:', this.loginService.esAdmin);
  }

  private redirect() {
    // Si está en la ruta /
    if (this.router.url === '/') {
      if (this.loginService.esAdmin) {
        this.router.navigateByUrl('/dashboard-admin');
      } else if (this.loginService.esQuimica) {
        this.router.navigateByUrl('/dashboard-quimica');
      } else if (this.loginService.esDistribuidor) {
        this.router.navigateByUrl('/dashboard-distribuidor');
      } else if (this.loginService.esProductor) {
        this.router.navigateByUrl('/mapa');
      } else if (this.loginService.esEstablecimiento) {
        this.router.navigateByUrl('/mapa');
      } else {
        this.router.navigateByUrl('/usuarios');
      }
    }
  }

  private forcedRedirect() {
    if (this.loginService.esAdmin) {
      this.router.navigateByUrl(`/dashboard-admin?permiso=${this.helper.numeroPermiso}`);
    } else if (this.loginService.esQuimica) {
      this.router.navigateByUrl(`/dashboard-quimica?permiso=${this.helper.numeroPermiso}`);
    } else if (this.loginService.esDistribuidor) {
      this.router.navigateByUrl(`/dashboard-distribuidor?permiso=${this.helper.numeroPermiso}`);
    } else if (this.loginService.esProductor) {
      this.router.navigateByUrl(`/mapa?permiso=${this.helper.numeroPermiso}`);
    } else if (this.loginService.esEstablecimiento) {
      this.router.navigateByUrl(`/mapa?permiso=${this.helper.numeroPermiso}`);
    } else {
      this.router.navigateByUrl(`/usuarios?permiso=${this.helper.numeroPermiso}`);
    }
  }

  public onCambioPermiso(permiso: IPermiso) {
    this.permisoSeleccionado = permiso;
    this.helper.setPermiso(permiso);
    const indice = this.encontrarIndicePermiso(this.permisos, this.permisoSeleccionado);
    this.helper.setNumeroPermiso(indice);
    this.checkPermisos();
    this.reload();
    this.actualizarIndicadorAlertas();
    this.forcedRedirect();
    this.visible = false;
  }

  public mostrarMenuModal(): boolean {
    return true;
  }

  public puedeGestionarUsuarios(): boolean {
    return this.loginService.esAdmin || this.loginService.esQuimica || this.loginService.esDistribuidor;
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
    if (this.permisoSeleccionado?.nivel === 'Quimica') {
      return this.permisoSeleccionado.quimica?.nombre || 'Compañía';
    }

    if (this.permisoSeleccionado?.nivel === 'Distribuidor') {
      return this.permisoSeleccionado.distribuidor?.nombre || 'Distribuidor';
    }

    if (this.permisoSeleccionado?.nivel === 'Productor') {
      return this.permisoSeleccionado.productor?.nombre || 'Productor';
    }

    if (this.permisoSeleccionado?.nivel === 'Establecimiento') {
      return this.permisoSeleccionado.establecimiento?.nombre || 'Establecimiento';
    }

    return this.permisoSeleccionado?.nivel || 'Admin';
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
    if (this.loginService.esAdmin) {
      this.router.navigateByUrl('/dashboard-admin');
    } else if (this.loginService.esQuimica) {
      this.router.navigateByUrl('/dashboard-quimica');
    } else if (this.loginService.esDistribuidor) {
      this.router.navigateByUrl('/dashboard-distribuidor');
    } else {
      this.router.navigateByUrl('/mapa');
    }
  }

  public mostrarVolver(): boolean {
    const ruta = this.getRutaLimpia();
    return !['/', '/mapa', '/dashboard-admin', '/dashboard-quimica', '/dashboard-distribuidor'].includes(ruta);
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
    return (
      this.loginService.esQuimica ||
      this.loginService.esDistribuidor ||
      this.loginService.esProductor ||
      this.loginService.esEstablecimiento
    );
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
  }
}
