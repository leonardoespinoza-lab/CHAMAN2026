import { Component, OnInit } from '@angular/core';
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
export class CrearEditarUsuariosComponent implements OnInit {
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
        : this.loginService.esAdmin || permisoActual?.nivel === 'Admin'
          ? 'Admin'
          : permisoActual?.nivel);
    const rol = p?.rol || 'Admin';
    return new FormGroup({
      nivel: new FormControl(nivel, Validators.required),
      rol: new FormControl(rol, Validators.required),
      idProductor: new FormControl(p?.idProductor || this.productorPreseleccionado?._id),
      idEstablecimiento: new FormControl(p?.idEstablecimiento),
      idDistribuidor: new FormControl(p?.idDistribuidor || this.productorPreseleccionado?.idDistribuidor),
      idQuimica: new FormControl(p?.idQuimica || this.productorPreseleccionado?.idQuimica),
    });
  }
  public agregarPermiso() {
    this.permisos.push(this.agregarPermisoFormGroup());
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
      permisos: new FormArray(this.initPermisos()),
    });
    this.permisos.controls.forEach((_, i) => this.cambioNivel(i, false));
  }

  public cambioNivel(i: number, reset = true) {
    const nivel = this.nivel(i);
    const permiso = this.permisos.at(i);
    if (reset) {
      permiso.get('idProductor')?.reset();
      permiso.get('idEstablecimiento')?.reset();
      permiso.get('idDistribuidor')?.reset();
      permiso.get('idQuimica')?.reset();
    }
    if (nivel === 'Productor') {
      permiso.get('idProductor')?.setValidators(Validators.required);
      permiso.get('idEstablecimiento')?.clearValidators();
      permiso.get('idDistribuidor')?.clearValidators();
      permiso.get('idQuimica')?.clearValidators();
      if (this.productorPreseleccionado) {
        permiso.get('idProductor')?.setValue(this.productorPreseleccionado._id);
        permiso.get('idDistribuidor')?.setValue(this.productorPreseleccionado.idDistribuidor);
        permiso.get('idQuimica')?.setValue(this.productorPreseleccionado.idQuimica);
      } else if (this.productores.length === 1) {
        permiso.get('idProductor')?.setValue(this.productores[0]._id);
      }
    } else if (nivel === 'Establecimiento') {
      permiso.get('idEstablecimiento')?.setValidators(Validators.required);
      permiso.get('idProductor')?.clearValidators();
      permiso.get('idDistribuidor')?.clearValidators();
      permiso.get('idQuimica')?.clearValidators();
      if (this.establecimientos.length === 1) {
        permiso.get('idEstablecimiento')?.setValue(this.establecimientos[0]._id);
      }
    } else if (nivel === 'Distribuidor') {
      permiso.get('idDistribuidor')?.setValidators(Validators.required);
      permiso.get('idProductor')?.clearValidators();
      permiso.get('idEstablecimiento')?.clearValidators();
      if (this.distribuidores.length === 1) {
        permiso.get('idDistribuidor')?.setValue(this.distribuidores[0]._id);
      }
    } else if (nivel === 'Quimica') {
      permiso.get('idQuimica')?.setValidators(Validators.required);
      permiso.get('idProductor')?.clearValidators();
      permiso.get('idEstablecimiento')?.clearValidators();
      permiso.get('idDistribuidor')?.clearValidators();
      if (this.quimicas.length === 1) {
        permiso.get('idQuimica')?.setValue(this.quimicas[0]._id);
      }
    }
    permiso.get('idProductor')?.updateValueAndValidity();
    permiso.get('idEstablecimiento')?.updateValueAndValidity();
    permiso.get('idDistribuidor')?.updateValueAndValidity();
    permiso.get('idQuimica')?.updateValueAndValidity();
  }

  // ACCIONES

  private getData() {
    const data: ICreateUsuario = this.form?.value;
    data.activo = true;
    data.email = data.datosPersonales?.email || data.username;
    if (data.permisos) {
      for (const permiso of data.permisos) {
        if (permiso.nivel === 'Productor') {
          const productor =
            this.productores.find((p) => p._id === permiso.idProductor) ||
            (this.productorPreseleccionado?._id === permiso.idProductor ? this.productorPreseleccionado : undefined);
          permiso.idQuimica = productor?.idQuimica;
          permiso.idDistribuidor = productor?.idDistribuidor;
        }
        if (permiso.nivel === 'Establecimiento') {
          const establecimiento = this.establecimientos.find((p) => p._id === permiso.idEstablecimiento);
          permiso.idQuimica = establecimiento?.idQuimica;
          permiso.idDistribuidor = establecimiento?.idDistribuidor;
          permiso.idProductor = establecimiento?.idProductor;
        }
        // if (permiso.nivel === 'Distribuidor') {
        //   const distribuidor = this.distribuidores.find((p) => p._id === permiso.idDistribuidor);
        //   permiso.idQuimica = distribuidor?.idQuimica;
        //   permiso.idDistribuidor = distribuidor?._id;
        // }
        // if (permiso.nivel === 'Quimica') {
        //   const quimica = this.quimicas.find((p) => p._id === permiso.idQuimica);
        //   permiso.idQuimica = quimica?._id;
        // }
      }
    }
    return data;
  }

  public async guardar(): Promise<void> {
    if (!this.form?.valid) {
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

  private async listarProductores() {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.productores$?.unsubscribe();
    this.productores$ = this.listado
      .subscribe<IListado<IEstablecimiento>>('productors', queryParams)
      .subscribe(async (data) => {
        this.productores = data.datos;
        this.permisos?.controls.forEach((_, i) => {
          if (this.nivel(i) === 'Productor' && !this.permisos.at(i).get('idProductor')?.value) {
            this.cambioNivel(i, false);
          }
        });
        console.log(`listado de productores`, data);
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
        console.log(`listado de establecimientos`, data);
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
        console.log(`listado de distribuidors`, data);
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
      console.log(`listado de quimicas`, data);
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
}
