import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  ICreateUsuario,
  IDistribuidor,
  IEstablecimiento,
  ILote,
  IListado,
  IPermiso,
  IProductor,
  IQueryParam,
  IQuimica,
  IUsuario,
  ITenant,
  ModuloPermiso,
  NivelPermiso,
  Rol,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { LoginService } from '../../../auxiliares/http/login.service';
import { UsuarioService } from '../../../auxiliares/http/usuario.service';
import { TenantService } from '../../../auxiliares/http/tenant.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../auxiliares/shared.module';
import {
  AutocompleteDireccionComponent,
  DireccionSeleccionada,
} from '../../../auxiliares/componentes/autocomplete-direccion/autocomplete-direccion.component';

@Component({
  selector: 'app-crear-editar-usuarios',
  imports: [SharedModule, AutocompleteDireccionComponent],
  templateUrl: './crear-editar-usuarios.component.html',
  styleUrl: './crear-editar-usuarios.component.scss',
})
export class CrearEditarUsuariosComponent implements OnInit, OnDestroy {
  public loading = false;
  public usuario?: IUsuario;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public niveles: NivelPermiso[] = [];
  public roles: Rol[] = ['Admin', 'Escritura', 'Lectura'];
  public productores: IProductor[] = [];
  public productores$?: Subscription;
  public establecimientos: IEstablecimiento[] = [];
  public establecimientos$?: Subscription;
  public lotes: ILote[] = [];
  public lotes$?: Subscription;
  public distribuidores: IDistribuidor[] = [];
  public distribuidores$?: Subscription;
  public quimicas: IQuimica[] = [];
  public quimicas$?: Subscription;
  public productorPreseleccionado?: IProductor;
  public direccionProfesional?: DireccionSeleccionada;
  public tenantActual?: ITenant;
  private nivelInicial?: NivelPermiso;
  private retorno?: string;
  public readonly passwordPolicyText =
    'Minimo 8 caracteres, una mayuscula, una minuscula y un numero. Sin espacios.';
  private readonly passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S{8,}$/;
  public modulosPermiso: { key: ModuloPermiso; label: string }[] = [
    { key: 'Enfermedades', label: 'Enfermedades' },
    { key: 'Riego', label: 'Riego' },
    { key: 'HuellaHidrica', label: 'Huella hidrica' },
    { key: 'NDVI', label: 'Indice verde / satelite' },
    { key: 'Clima', label: 'Clima' },
    { key: 'EtapasFenologicas', label: 'Fenologia' },
    { key: 'Sensores', label: 'Sensores' },
    { key: 'Camaras', label: 'Camaras' },
    { key: 'Malezas', label: 'Malezas' },
    { key: 'FrioTermica', label: 'Frio y acumulacion termica' },
    { key: 'Fertilizacion', label: 'Fertilizacion' },
    { key: 'Fumigacion', label: 'Fumigacion' },
    { key: 'Certificados', label: 'Informes agronomicos' },
    { key: 'RegistroFotografico', label: 'Registro fotografico de campo' },
    { key: 'Visitas', label: 'Calendario de visitas' },
  ];

  public get modulosPermisoVisibles(): { key: ModuloPermiso; label: string }[] {
    if (!this.loginService.esTenant) return this.modulosPermiso;
    return this.modulosPermiso.filter(
      (modulo) => this.tenantActual?.modulos?.[modulo.key] === true,
    );
  }

  public get permisos() {
    return this.form?.get('permisos') as FormArray;
  }

  public nivel(i: number) {
    return this.permisos.at(i).get('nivel')?.value;
  }

  public get esPerfilAsesor(): boolean {
    return Boolean(
      this.permisos?.controls.some(
        (control) => control.get('nivel')?.value === 'Asesor',
      ),
    );
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: UsuarioService,
    private tenantService: TenantService,
    private helper: HelperService,
    private listado: ListadosService,
    private loginService: LoginService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  // FORMULARIO
  private initPermisos() {
    const array: FormGroup[] = [];
    if (this.usuario?.permisos) {
      for (const p of this.usuario.permisos) {
        array.push(this.agregarPermisoFormGroup(p));
      }
      return array;
    } else {
      array.push(this.agregarPermisoFormGroup());
      return array;
    }
  }
  public agregarPermisoFormGroup(p?: IPermiso): FormGroup {
    const permisoActual = this.helper.permiso;
    const nivel =
      p?.nivel ||
      this.nivelInicial ||
      (this.productorPreseleccionado
        ? 'Productor'
        : this.loginService.esTenant
          ? this.niveles[0]
        : permisoActual?.nivel && permisoActual.nivel !== 'Admin'
          ? permisoActual.nivel
          : undefined);
    const rol = p?.rol || 'Admin';
    return new FormGroup({
      nivel: new FormControl(nivel, Validators.required),
      rol: new FormControl(rol, Validators.required),
      idTenant: new FormControl(p?.idTenant || permisoActual?.idTenant),
      idProductor: new FormControl(p?.idProductor || this.productorPreseleccionado?._id),
      idEstablecimiento: new FormControl(p?.idEstablecimiento),
      idEstablecimientos: new FormControl(p?.idEstablecimientos || []),
      idLotes: new FormControl(p?.idLotes || []),
      idDistribuidor: new FormControl(p?.idDistribuidor || this.productorPreseleccionado?.idDistribuidor),
      idQuimica: new FormControl(p?.idQuimica || this.productorPreseleccionado?.idQuimica),
      modulos: this.crearModulosFormGroup(p?.modulos),
    });
  }

  private crearModulosFormGroup(modulos?: Partial<Record<ModuloPermiso, boolean>>): FormGroup {
    const controls = this.modulosPermiso.reduce(
      (acc, modulo) => ({
        ...acc,
        [modulo.key]: new FormControl(
          (!this.loginService.esTenant || this.tenantActual?.modulos?.[modulo.key] === true) &&
            modulos?.[modulo.key] !== false,
        ),
      }),
      {} as Record<ModuloPermiso, FormControl<boolean | null>>
    );
    return new FormGroup(controls);
  }
  public agregarPermiso() {
    this.permisos.push(this.agregarPermisoFormGroup());
    this.cambioNivel(this.permisos.length - 1, false);
  }
  public borrarPermiso(i: number) {
    this.permisos.removeAt(i);
    this.actualizarValidadoresPerfil();
  }
  private createForm(): void {
    this.form = new FormGroup({
      username: new FormControl(this.usuario?.username, Validators.required),
      password: new FormControl('', this.passwordValidators(!this.usuario)),
      datosPersonales: new FormGroup({
        nombre: new FormControl(this.usuario?.datosPersonales?.nombre),
        telefono: new FormControl(this.usuario?.datosPersonales?.['telefono']),
        email: new FormControl(this.usuario?.datosPersonales?.email, Validators.email),
      }),
      datosProfesionales: new FormGroup({
        profesion: new FormControl(this.usuario?.datosProfesionales?.profesion),
        especialidad: new FormControl(this.usuario?.datosProfesionales?.especialidad),
        matricula: new FormControl(this.usuario?.datosProfesionales?.matricula),
        consejoProfesional: new FormControl(this.usuario?.datosProfesionales?.consejoProfesional),
        foto: new FormControl(this.usuario?.datosProfesionales?.foto),
      }),
      ubicacionProfesional: new FormGroup({
        direccion: new FormControl(this.usuario?.ubicacionProfesional?.direccion),
        geojson: new FormControl(this.usuario?.ubicacionProfesional?.geojson),
        radioInfluenciaKm: new FormControl(this.usuario?.ubicacionProfesional?.radioInfluenciaKm || 50, [
          Validators.min(1),
          Validators.max(1000),
        ]),
      }),
      permisos: new FormArray(this.initPermisos(), Validators.required),
    });
    this.permisos.controls.forEach((_, i) => this.cambioNivel(i, false));
  }

  private passwordValidators(required: boolean) {
    const validators = [
      Validators.minLength(8),
      Validators.pattern(this.passwordPattern),
    ];
    return required ? [Validators.required, ...validators] : validators;
  }

  public cambioNivel(i: number, reset = true) {
    const nivel = this.nivel(i);
    const permiso = this.permisos.at(i);
    const rol = permiso.get('rol');
    const idProductor = permiso.get('idProductor');
    const idEstablecimiento = permiso.get('idEstablecimiento');
    const idEstablecimientos = permiso.get('idEstablecimientos');
    const idLotes = permiso.get('idLotes');
    const idDistribuidor = permiso.get('idDistribuidor');
    const idQuimica = permiso.get('idQuimica');

    if (reset) {
      idProductor?.reset();
      idEstablecimiento?.reset();
      idEstablecimientos?.setValue([]);
      idLotes?.setValue([]);
      idDistribuidor?.reset();
      idQuimica?.reset();
    }

    if (nivel === 'Admin') {
      rol?.setValue('Admin');
    }

    idProductor?.clearValidators();
    idEstablecimiento?.clearValidators();
    idEstablecimientos?.clearValidators();
    idDistribuidor?.clearValidators();
    idQuimica?.clearValidators();

    if (nivel === 'Productor') {
      idProductor?.setValidators(Validators.required);
      if (this.productorPreseleccionado) {
        idProductor?.setValue(this.productorPreseleccionado._id);
        idDistribuidor?.setValue(this.productorPreseleccionado.idDistribuidor);
        idQuimica?.setValue(this.productorPreseleccionado.idQuimica);
      } else if (this.productores.length === 1) {
        idProductor?.setValue(this.productores[0]._id);
        idDistribuidor?.setValue(this.productores[0].idDistribuidor);
        idQuimica?.setValue(this.productores[0].idQuimica);
      }
    } else if (nivel === 'Establecimiento') {
      idEstablecimiento?.setValidators(Validators.required);
      if (this.establecimientos.length === 1) {
        idEstablecimiento?.setValue(this.establecimientos[0]._id);
        idProductor?.setValue(this.establecimientos[0].idProductor);
        idDistribuidor?.setValue(this.establecimientos[0].idDistribuidor);
        idQuimica?.setValue(this.establecimientos[0].idQuimica);
      }
    } else if (nivel === 'Distribuidor') {
      idDistribuidor?.setValidators(Validators.required);
      if (this.distribuidores.length === 1) {
        idDistribuidor?.setValue(this.distribuidores[0]._id);
        idQuimica?.setValue(this.distribuidores[0].idQuimica);
      }
    } else if (nivel === 'Quimica') {
      idQuimica?.setValidators(Validators.required);
      if (this.quimicas.length === 1) {
        idQuimica?.setValue(this.quimicas[0]._id);
      }
    }
    idProductor?.updateValueAndValidity();
    idEstablecimiento?.updateValueAndValidity();
    idEstablecimientos?.updateValueAndValidity();
    idDistribuidor?.updateValueAndValidity();
    idQuimica?.updateValueAndValidity();
    this.actualizarValidadoresPerfil();
    if (!this.esPerfilAsesor && this.tabValue === 3) {
      this.tabValue = 0;
    }
  }

  public rolesParaNivel(nivel?: NivelPermiso): Rol[] {
    return nivel === 'Admin' ? ['Admin'] : this.roles;
  }

  private actualizarValidadoresPerfil(): void {
    if (!this.form) return;
    const direccion = this.form.get('ubicacionProfesional.direccion');
    const geojson = this.form.get('ubicacionProfesional.geojson');
    const radio = this.form.get('ubicacionProfesional.radioInfluenciaKm');
    direccion?.clearValidators();
    geojson?.clearValidators();
    radio?.setValidators([
      Validators.min(1),
      Validators.max(1000),
    ]);
    direccion?.updateValueAndValidity({ emitEvent: false });
    geojson?.updateValueAndValidity({ emitEvent: false });
    radio?.updateValueAndValidity({ emitEvent: false });
  }

  // ACCIONES

  private getData() {
    const data: ICreateUsuario = this.form?.value;
    data.activo = true;
    data.email = data.datosPersonales?.email || data.username;
    if (data.permisos) {
      data.permisos = data.permisos.map((permiso) => this.normalizarPermiso({ ...permiso }));
    }
    if (!data.permisos?.some((permiso) => permiso.nivel === 'Asesor')) {
      delete data.datosProfesionales;
      delete data.ubicacionProfesional;
      return data;
    }
    const coordinates = data.ubicacionProfesional?.geojson?.coordinates;
    if (
      !data.ubicacionProfesional?.direccion?.trim() ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !coordinates.every(Number.isFinite)
    ) {
      delete data.ubicacionProfesional;
    }
    return data;
  }

  private normalizarPermiso(permiso: IPermiso): IPermiso {
    const modulos = this.normalizarModulos(permiso.modulos);

    if (permiso.nivel === 'Admin') {
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
        modulos,
      };
    }

    if (permiso.nivel === 'Tenant') {
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
        idTenant: permiso.idTenant || this.helper.permiso?.idTenant,
        modulos,
      };
    }

    if (permiso.nivel === 'Quimica') {
      const quimica = this.quimicas.find((q) => q._id === permiso.idQuimica);
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
        idQuimica: quimica?._id || permiso.idQuimica,
        modulos,
      };
    }

    if (permiso.nivel === 'Distribuidor') {
      const distribuidor = this.distribuidores.find((d) => d._id === permiso.idDistribuidor);
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
        idDistribuidor: distribuidor?._id || permiso.idDistribuidor,
        idQuimica: distribuidor?.idQuimica || permiso.idQuimica,
        modulos,
      };
    }

    if (permiso.nivel === 'Asesor') {
      const distribuidor = this.distribuidores.find((d) => d._id === permiso.idDistribuidor);
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
        idTenant: permiso.idTenant || this.helper.permiso?.idTenant,
        idDistribuidor: distribuidor?._id || permiso.idDistribuidor,
        idQuimica: distribuidor?.idQuimica || permiso.idQuimica,
        idEstablecimientos: (permiso.idEstablecimientos || []).map(String),
        idLotes: (permiso.idLotes || []).map(String),
        modulos,
      };
    }

    if (permiso.nivel === 'Productor') {
      const productor =
        this.productores.find((p) => p._id === permiso.idProductor) ||
        (this.productorPreseleccionado?._id === permiso.idProductor ? this.productorPreseleccionado : undefined);
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
        idTenant: productor?.idTenant || permiso.idTenant || this.helper.permiso?.idTenant,
        idProductor: productor?._id || permiso.idProductor,
        idDistribuidor: productor?.idDistribuidor || permiso.idDistribuidor,
        idQuimica: productor?.idQuimica || permiso.idQuimica,
        modulos,
      };
    }

    if (permiso.nivel === 'Establecimiento') {
      const establecimiento = this.establecimientos.find((e) => e._id === permiso.idEstablecimiento);
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
        idTenant: establecimiento?.idTenant || permiso.idTenant || this.helper.permiso?.idTenant,
        idEstablecimiento: establecimiento?._id || permiso.idEstablecimiento,
        idProductor: establecimiento?.idProductor || permiso.idProductor,
        idDistribuidor: establecimiento?.idDistribuidor || permiso.idDistribuidor,
        idQuimica: establecimiento?.idQuimica || permiso.idQuimica,
        idLotes: (permiso.idLotes || []).map(String),
        modulos,
      };
    }

    return permiso;
  }

  private normalizarModulos(modulos?: Partial<Record<ModuloPermiso, boolean>>): Partial<Record<ModuloPermiso, boolean>> {
    return this.modulosPermisoVisibles.reduce(
      (acc, modulo) => ({
        ...acc,
        [modulo.key]: modulos?.[modulo.key] !== false,
      }),
      {} as Partial<Record<ModuloPermiso, boolean>>
    );
  }

  public async guardar(): Promise<void> {
    if (!this.form?.valid || !this.permisos.length) {
      this.form?.markAllAsTouched();
      this.helper.notifError(
        'Revisá usuario, contraseña y permisos. La contraseña requiere 8 caracteres, mayúscula, minúscula y número.',
      );
      return;
    }
    this.loading = true;
    try {
      const data = this.getData();
      if (this.usuario?._id) {
        await this.service.editar(this.usuario._id, data);

         // Solo actualiza el item en cache
        this.listado.patchEntityItem('usuarios', {
          _id: this.usuario._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('usuarios', created);

        this.helper.notifSuccess(this.translate.instant('Creado correctamente'));
      }
      this.volver();
    } catch (err) {
      console.error(err);
      this.helper.notifError(err);
    }
    this.loading = false;
  }

  public volver() {
    if (this.retorno) {
      this.router.navigateByUrl(this.retorno);
      return;
    }
    if (this.loginService.esAdmin) {
      this.router.navigateByUrl('/dashboard-admin');
      return;
    }
    window.history.back();
  }

  // LISTADOS

  private refrescarPermisosPorNivel(): void {
    this.permisos?.controls.forEach((_, i) => this.cambioNivel(i, false));
  }

  private async listarProductores() {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.productores$?.unsubscribe();
    this.productores$ = this.listado
      .subscribe<IListado<IProductor>>('productors', queryParams)
      .subscribe(async (data) => {
        this.productores = data.datos;
        this.refrescarPermisosPorNivel();
      });
    await this.listado.getLastValue('productors', queryParams);
  }

  private async listarEstablecimientos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.establecimientos$?.unsubscribe();
    this.establecimientos$ = this.listado
      .subscribe<IListado<IEstablecimiento>>('establecimientos', queryParams)
      .subscribe(async (data) => {
        this.establecimientos = data.datos;
        this.refrescarPermisosPorNivel();
      });
    await this.listado.getLastValue('establecimientos', queryParams);
  }

  private async listarLotes(): Promise<void> {
    const queryParams: IQueryParam = { page: 0, limit: 0, sort: 'nombre' };
    this.lotes$?.unsubscribe();
    this.lotes$ = this.listado
      .subscribe<IListado<ILote>>('lotes', queryParams)
      .subscribe((data) => (this.lotes = data.datos));
    await this.listado.getLastValue('lotes', queryParams);
  }

  public establecimientosPorDistribuidor(i: number): IEstablecimiento[] {
    const idDistribuidor = this.permisos.at(i).get('idDistribuidor')?.value;
    return this.establecimientos.filter(
      (e) => !idDistribuidor || String(e.idDistribuidor) === String(idDistribuidor),
    );
  }

  public lotesPorPermiso(i: number): ILote[] {
    const permiso = this.permisos.at(i);
    const nivel = permiso.get('nivel')?.value;
    const establecimientos: string[] =
      nivel === 'Asesor'
        ? permiso.get('idEstablecimientos')?.value || []
        : [permiso.get('idEstablecimiento')?.value].filter(Boolean);
    return this.lotes.filter((lote) => establecimientos.includes(String(lote.idEstablecimiento)));
  }

  public cambioDistribuidorAsesor(i: number): void {
    const permiso = this.permisos.at(i);
    const idDistribuidor = permiso.get('idDistribuidor')?.value;
    const distribuidor = this.distribuidores.find(
      (item) => String(item._id) === String(idDistribuidor),
    );
    permiso.patchValue({
      idQuimica: distribuidor?.idQuimica || null,
    });
  }

  public cambioEstablecimientosAsesor(i: number): void {
    this.permisos.at(i).get('idLotes')?.setValue([]);
  }

  public cambioEstablecimientoUsuario(i: number): void {
    this.permisos.at(i).get('idLotes')?.setValue([]);
  }

  public onDireccionProfesionalChange(direccion: DireccionSeleccionada): void {
    this.direccionProfesional = direccion;
    this.form?.get('ubicacionProfesional')?.patchValue({
      direccion: direccion.direccion,
      geojson: direccion.geojson,
    });
  }

  public onDireccionProfesionalClear(): void {
    this.direccionProfesional = undefined;
    this.form?.get('ubicacionProfesional')?.patchValue({
      direccion: null,
      geojson: null,
    });
  }

  public fotoProfesional(): string | undefined {
    return this.form?.get('datosProfesionales.foto')?.value || undefined;
  }

  public async onFotoSeleccionada(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      this.helper.notifError('Usa una foto PNG, JPG o WebP de hasta 4 MB.');
      return;
    }
    try {
      this.form?.get('datosProfesionales.foto')?.setValue(await this.normalizarFoto(file));
    } catch {
      this.helper.notifError('No se pudo procesar la foto seleccionada.');
    }
  }

  public quitarFoto(): void {
    this.form?.get('datosProfesionales.foto')?.setValue(null);
  }

  private normalizarFoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 640 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('canvas'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/jpeg', 0.86);
        URL.revokeObjectURL(image.src);
        resolve(result);
      };
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });
  }

  private async listarDistribuidores(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.distribuidores$?.unsubscribe();
    this.distribuidores$ = this.listado
      .subscribe<IListado<IDistribuidor>>('distribuidors', queryParams)
      .subscribe(async (data) => {
        this.distribuidores = data.datos;
        this.refrescarPermisosPorNivel();
      });
    await this.listado.getLastValue('distribuidors', queryParams);
  }

  private async listarQuimicas(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.quimicas$?.unsubscribe();
    this.quimicas$ = this.listado.subscribe<IListado<IQuimica>>('quimicas', queryParams).subscribe(async (data) => {
      this.quimicas = data.datos;
      this.refrescarPermisosPorNivel();
    });
    await this.listado.getLastValue('quimicas', queryParams);
  }

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.nivelInicial = this.route.snapshot.data['nivelInicial'] as
      | NivelPermiso
      | undefined;
    this.retorno = this.route.snapshot.data['retorno'] as string | undefined;
    this.usuario = this.paramsService.get('editUsuario');
    const idUsuario = this.route.snapshot.paramMap.get('id');
    if (!this.usuario && idUsuario) {
      try {
        this.usuario = await this.service.listarPorId(idUsuario);
      } catch (error) {
        this.helper.notifError(error);
        this.volver();
        this.loading = false;
        return;
      }
    }
    this.productorPreseleccionado = this.paramsService.get('productorParaUsuario') as IProductor | undefined;
    if (this.productorPreseleccionado) {
      this.paramsService.remove('productorParaUsuario');
      // Este flujo siempre crea un usuario nuevo del productor recién creado.
      // Evita reutilizar por error el perfil de un asesor editado anteriormente.
      this.paramsService.remove('editUsuario');
      this.usuario = undefined;
    }
    if (this.usuario) {
      console.log('edit', this.usuario);
    }
    if (this.usuario?.ubicacionProfesional?.geojson) {
      this.direccionProfesional = {
        direccion: this.usuario.ubicacionProfesional.direccion || '',
        geojson: this.usuario.ubicacionProfesional.geojson,
      };
    }
    this.titulo = this.nivelInicial === 'Asesor'
      ? this.usuario
        ? () => 'Editar asesor'
        : () => 'Crear asesor y usuario'
      : this.usuario
        ? () => this.translate.instant(`Editar usuario`)
        : () => this.translate.instant('Crear usuario');

    if (this.loginService.esTenant) {
      try {
        this.tenantActual = await this.tenantService.getCurrent();
      } catch (error) {
        this.helper.notifError(error);
        this.volver();
        this.loading = false;
        return;
      }
    }

    if (this.loginService.esAdmin) {
      this.niveles = ['Admin', 'Tenant', 'Quimica', 'Distribuidor', 'Asesor', 'Productor', 'Establecimiento'];
    } else if (this.loginService.esTenant) {
      this.niveles = [
        ...(this.tenantActual?.capacidades?.administrarAsesores
          ? (['Asesor'] as NivelPermiso[])
          : []),
        ...(this.tenantActual?.capacidades?.administrarProductores
          ? (['Productor'] as NivelPermiso[])
          : []),
      ];
    } else if (this.loginService.esQuimica) {
      this.niveles = ['Quimica', 'Distribuidor', 'Asesor', 'Productor', 'Establecimiento'];
    } else if (this.loginService.esDistribuidor) {
      this.niveles = ['Distribuidor', 'Asesor', 'Productor', 'Establecimiento'];
    } else if (this.loginService.esAsesor) {
      this.niveles = ['Productor'];
    } else if (this.loginService.esProductor) {
      this.niveles = ['Productor', 'Establecimiento'];
    } else {
      this.niveles = ['Establecimiento'];
    }
    if (this.nivelInicial) {
      this.niveles = [this.nivelInicial];
    } else if (this.productorPreseleccionado) {
      this.niveles = ['Productor'];
    }
    this.createForm();
    await Promise.all([
      this.loginService.esAdmin ||
      this.loginService.esTenant ||
      this.loginService.esQuimica ||
      this.loginService.esDistribuidor ||
      this.loginService.esAsesor ||
      this.loginService.esProductor
        ? this.listarProductores()
        : null,
      !this.loginService.esTenant ? this.listarEstablecimientos() : null,
      !this.loginService.esTenant ? this.listarLotes() : null,
      this.loginService.esDistribuidor || this.loginService.esQuimica || this.loginService.esAdmin
        ? this.listarDistribuidores()
        : null,
      this.loginService.esQuimica || this.loginService.esAdmin ? this.listarQuimicas() : null,
    ]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.productores$?.unsubscribe();
    this.establecimientos$?.unsubscribe();
    this.lotes$?.unsubscribe();
    this.distribuidores$?.unsubscribe();
    this.quimicas$?.unsubscribe();
  }
}
