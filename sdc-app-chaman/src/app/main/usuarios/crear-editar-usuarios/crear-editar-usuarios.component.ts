import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  ICreateUsuario,
  IDistribuidor,
  IEstablecimiento,
  IListado,
  IPermiso,
  IProductor,
  IQueryParam,
  IQuimica,
  IUsuario,
  ModuloPermiso,
  NivelPermiso,
  Rol,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { LoginService } from '../../../auxiliares/http/login.service';
import { UsuarioService } from '../../../auxiliares/http/usuario.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-crear-editar-usuarios',
  imports: [SharedModule],
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
  public distribuidores: IDistribuidor[] = [];
  public distribuidores$?: Subscription;
  public quimicas: IQuimica[] = [];
  public quimicas$?: Subscription;
  public productorPreseleccionado?: IProductor;
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
  ];

  public get permisos() {
    return this.form?.get('permisos') as FormArray;
  }

  public nivel(i: number) {
    return this.permisos.at(i).get('nivel')?.value;
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: UsuarioService,
    private helper: HelperService,
    private listado: ListadosService,
    private loginService: LoginService,
    private router: Router
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
      (this.productorPreseleccionado
        ? 'Productor'
        : permisoActual?.nivel && permisoActual.nivel !== 'Admin'
          ? permisoActual.nivel
          : undefined);
    const rol = p?.rol || 'Admin';
    return new FormGroup({
      nivel: new FormControl(nivel, Validators.required),
      rol: new FormControl(rol, Validators.required),
      idProductor: new FormControl(p?.idProductor || this.productorPreseleccionado?._id),
      idEstablecimiento: new FormControl(p?.idEstablecimiento),
      idDistribuidor: new FormControl(p?.idDistribuidor || this.productorPreseleccionado?.idDistribuidor),
      idQuimica: new FormControl(p?.idQuimica || this.productorPreseleccionado?.idQuimica),
      modulos: this.crearModulosFormGroup(p?.modulos),
    });
  }

  private crearModulosFormGroup(modulos?: Partial<Record<ModuloPermiso, boolean>>): FormGroup {
    const controls = this.modulosPermiso.reduce(
      (acc, modulo) => ({
        ...acc,
        [modulo.key]: new FormControl(modulos?.[modulo.key] !== false),
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
  }
  private createForm(): void {
    this.form = new FormGroup({
      username: new FormControl(this.usuario?.username, Validators.required),
      password: new FormControl('', !this.usuario ? Validators.required : null),
      datosPersonales: new FormGroup({
        nombre: new FormControl(this.usuario?.datosPersonales?.nombre),
        telefono: new FormControl(this.usuario?.datosPersonales?.['telefono']),
        email: new FormControl(this.usuario?.datosPersonales?.email, Validators.email),
      }),
      permisos: new FormArray(this.initPermisos(), Validators.required),
    });
    this.permisos.controls.forEach((_, i) => this.cambioNivel(i, false));
  }

  public cambioNivel(i: number, reset = true) {
    const nivel = this.nivel(i);
    const permiso = this.permisos.at(i);
    const idProductor = permiso.get('idProductor');
    const idEstablecimiento = permiso.get('idEstablecimiento');
    const idDistribuidor = permiso.get('idDistribuidor');
    const idQuimica = permiso.get('idQuimica');

    if (reset) {
      idProductor?.reset();
      idEstablecimiento?.reset();
      idDistribuidor?.reset();
      idQuimica?.reset();
    }

    idProductor?.clearValidators();
    idEstablecimiento?.clearValidators();
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
    idDistribuidor?.updateValueAndValidity();
    idQuimica?.updateValueAndValidity();
  }

  // ACCIONES

  private getData() {
    const data: ICreateUsuario = this.form?.value;
    data.activo = true;
    data.email = data.datosPersonales?.email || data.username;
    if (data.permisos) {
      data.permisos = data.permisos.map((permiso) => this.normalizarPermiso({ ...permiso }));
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

    if (permiso.nivel === 'Productor') {
      const productor =
        this.productores.find((p) => p._id === permiso.idProductor) ||
        (this.productorPreseleccionado?._id === permiso.idProductor ? this.productorPreseleccionado : undefined);
      return {
        nivel: permiso.nivel,
        rol: permiso.rol,
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
        idEstablecimiento: establecimiento?._id || permiso.idEstablecimiento,
        idProductor: establecimiento?.idProductor || permiso.idProductor,
        idDistribuidor: establecimiento?.idDistribuidor || permiso.idDistribuidor,
        idQuimica: establecimiento?.idQuimica || permiso.idQuimica,
        modulos,
      };
    }

    return permiso;
  }

  private normalizarModulos(modulos?: Partial<Record<ModuloPermiso, boolean>>): Partial<Record<ModuloPermiso, boolean>> {
    return this.modulosPermiso.reduce(
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
      this.helper.notifError('Completá usuario, contraseña y al menos un permiso válido.');
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
    this.usuario = this.paramsService.get('editUsuario');
    this.productorPreseleccionado = this.paramsService.get('productorParaUsuario') as IProductor | undefined;
    if (this.productorPreseleccionado) {
      this.paramsService.remove('productorParaUsuario');
    }
    if (this.usuario) {
      console.log('edit', this.usuario);
    }
    this.titulo = this.usuario
      ? () => this.translate.instant(`Editar usuario`)
      : () => this.translate.instant('Crear usuario');

    if (this.loginService.esAdmin) {
      this.niveles = ['Admin', 'Quimica', 'Distribuidor', 'Productor', 'Establecimiento'];
    } else if (this.loginService.esQuimica) {
      this.niveles = ['Quimica', 'Distribuidor', 'Productor', 'Establecimiento'];
    } else if (this.loginService.esDistribuidor) {
      this.niveles = ['Distribuidor', 'Productor', 'Establecimiento'];
    } else if (this.loginService.esProductor) {
      this.niveles = ['Productor', 'Establecimiento'];
    } else {
      this.niveles = ['Establecimiento'];
    }
    this.createForm();
    await Promise.all([
      this.listarProductores(),
      this.listarEstablecimientos(),
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
    this.distribuidores$?.unsubscribe();
    this.quimicas$?.unsubscribe();
  }
}
