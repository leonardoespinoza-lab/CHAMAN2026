import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  ICreateLicencia,
  ICreateProductor,
  IDistribuidor,
  IEstadoLicenciaEntidad,
  IFilter,
  ILicencia,
  IListado,
  IProductor,
  IQueryParam,
  IQuimica,
} from 'modelos/src';
import { SelectChangeEvent } from 'primeng/select';
import { Subscription } from 'rxjs';
import {
  AutocompleteDireccionComponent,
  DireccionSeleccionada,
} from '../../../../auxiliares/componentes/autocomplete-direccion/autocomplete-direccion.component';
import { LoginService } from '../../../../auxiliares/http/login.service';
import { LicenciaPorEntidadService } from '../../../../auxiliares/http/licencia-por-entidad.service';
import { ProductorsService } from '../../../../auxiliares/http/productor.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-crear-editar-productores',
  imports: [SharedModule, AutocompleteDireccionComponent],
  templateUrl: './crear-editar-productores.component.html',
  styleUrl: './crear-editar-productores.component.scss',
})
export class CrearEditarProductoresComponent implements OnInit, OnDestroy {
  public loading = false;
  public productor?: IProductor;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  // Licencia
  public mostrarLicencia = false;
  public editarLicencia = false;
  public formLicencia?: FormGroup;
  public licencias: ILicencia[] = [];
  public licencia?: ILicencia;
  public estadoLicencia?: IEstadoLicenciaEntidad;
  private licenciaInicialId?: string;
  private expiracionInicial?: string;
  public licencias$?: Subscription;
  public hoy = new Date();
  public fechaDeExpiracion = new Date(this.hoy.getFullYear(), this.hoy.getMonth() + 1, this.hoy.getDate());
  public disabled = true;

  public get modulos() {
    return this.formLicencia?.get('modulos') as FormGroup;
  }

  // LISTADOS
  public distribuidores: IDistribuidor[] = [];
  public quimicas: IQuimica[] = [];
  private distribuidores$?: Subscription;
  private quimicas$?: Subscription;
  public direccionSeleccionada?: DireccionSeleccionada;

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: ProductorsService,
    public helper: HelperService,
    private listados: ListadosService,
    public loginService: LoginService,
    private router: Router,
    private licenciaPorEntidadService: LicenciaPorEntidadService,
  ) {}

  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.productor?.nombre, Validators.required),
      razonSocial: new FormControl(this.productor?.razonSocial),
      cuit: new FormControl(this.productor?.cuit, [Validators.pattern(/^\d{11}$/)]),
      condicionIva: new FormControl(this.productor?.condicionIva),
      emailFiscal: new FormControl(this.productor?.emailFiscal, Validators.email),
      telefonoFiscal: new FormControl(this.productor?.telefonoFiscal),
      direccionFiscal: new FormControl(this.productor?.direccionFiscal),
      logo: new FormControl(this.productor?.logo),
      gratis: new FormControl(this.productor?.gratis || true),
      idQuimica: new FormControl(this.productor?.idQuimica),
      idDistribuidor: new FormControl(this.productor?.idDistribuidor),
      direccion: new FormControl(this.productor?.direccion),
      geojson: new FormControl(this.productor?.geojson),
      radioInfluenciaKm: new FormControl(this.productor?.radioInfluenciaKm || 50, [
        Validators.min(1),
        Validators.max(1000),
      ]),
    });
  }

  private createFormLicencia(): void {
    this.formLicencia = new FormGroup({
      nombre: new FormControl('Gratis', Validators.required),
      maxUsuarios: new FormControl(2, Validators.required),
      maxdDistribuidores: new FormControl(1, Validators.required),
      maxProductores: new FormControl(1, Validators.required),
      maxEstablecimientos: new FormControl(1, Validators.required),
      maxLotes: new FormControl(1, Validators.required),
      maxdHectareas: new FormControl(10000, Validators.required),
      modulos: new FormGroup({
        Enfermedades: new FormControl(true, Validators.required),
        Riego: new FormControl(false, Validators.required),
        'Huella Hídrica': new FormControl(false, Validators.required),
        NDVI: new FormControl(true, Validators.required),
        Clima: new FormControl(true, Validators.required),
        'Etapas Fenológicas': new FormControl(true, Validators.required),
      }),
    });
  }

  private async listarLicencias(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.licencias$?.unsubscribe();
    this.licencias$ = this.listados.subscribe<IListado<ILicencia>>('licencias', queryParams).subscribe(async (data) => {
      this.licencias = data.datos.filter((licencia) => licencia.estado !== 'archivado');
    });
    await this.listados.getLastValue('licencias', queryParams);
  }

  public async onMostrarLicenciaChange(event: boolean): Promise<void> {
    this.mostrarLicencia = event;
    if (this.mostrarLicencia === true) {
      this.createFormLicencia();
      if (this.productor?._id) {
        this.estadoLicencia = await this.licenciaPorEntidadService.getEstadoEntidad('Productor', this.productor._id);
        if (this.estadoLicencia.asignacion?.fechaExpiracion) {
          this.fechaDeExpiracion = new Date(this.estadoLicencia.asignacion.fechaExpiracion);
        }
      }
      await this.listarLicencias();
      this.licencia = this.licencias.find((item) => item._id === this.estadoLicencia?.licencia?._id);
      if (this.licencia) await this.onLicenciaChange(this.licencia);
      this.licenciaInicialId = this.licencia?._id;
      this.expiracionInicial = this.fechaKey(this.fechaDeExpiracion);
    } else {
      // Si no se muestra la licencia, reinicio el formulario de licencia
      this.formLicencia = undefined;
      this.licencias = [];
      this.licencia = undefined;
      this.editarLicencia = false;
      this.estadoLicencia = undefined;
      this.licenciaInicialId = undefined;
      this.expiracionInicial = undefined;
      this.fechaDeExpiracion = new Date(this.hoy.getFullYear(), this.hoy.getMonth() + 1, this.hoy.getDate());
    }
    this.checkDisabled();
  }

  public async onLicenciaChange(event: ILicencia): Promise<void> {
    this.editarLicencia = false;
    this.licencia = event;
    if (event) {
      this.formLicencia?.patchValue({
        nombre: this.licencia.nombre,
        maxUsuarios: this.licencia.maxUsuarios ?? 2,
        maxdDistribuidores: this.licencia.maxdDistribuidores ?? 1,
        maxProductores: this.licencia.maxProductores ?? 1,
        maxEstablecimientos: this.licencia.maxEstablecimientos ?? 1,
        maxLotes: this.licencia.maxLotes ?? 1,
        maxdHectareas: this.licencia.maxdHectareas ?? 10000,
        modulos: {
          Enfermedades: this.licencia.modulos?.Enfermedades ?? true,
          Riego: this.licencia.modulos?.Riego ?? false,
          'Huella Hídrica': this.licencia.modulos?.['Huella Hídrica'] ?? false,
          NDVI: this.licencia.modulos?.NDVI ?? true,
          Clima: this.licencia.modulos?.Clima ?? true,
          'Etapas Fenológicas': this.licencia.modulos?.['Etapas Fenológicas'] ?? true,
        },
      });
    }
    this.checkDisabled();
  }

  // ACCIONES
  private getData() {
    const data: ICreateProductor = {
      ...this.form?.value,
      cuit: this.normalizarCuit(this.form?.value?.cuit),
    };
    return data;
  }

  public onCuitInput(): void {
    const control = this.form?.get('cuit');
    if (!control) return;
    const normalizado = String(control.value || '').replace(/\D/g, '').slice(0, 11);
    if (normalizado !== control.value) {
      control.setValue(normalizado, { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
    this.checkDisabled();
  }

  private normalizarCuit(cuit?: string): string | undefined {
    const limpio = String(cuit || '').replace(/\D/g, '');
    return limpio || undefined;
  }

  private getDataLicencia() {
    const data: ICreateLicencia = this.formLicencia?.value;
    return data;
  }

  public async guardar(crearUsuario = false): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();      
      let productorCreado: IProductor | undefined;

      if (this.debeGuardarLicencia()) {
        data.expiracion = this.helper.dateToDias(this.fechaDeExpiracion);
        data.licencia = { _id: this.licencia!._id } as any;
      }
      if (this.productor?._id) {
        await this.service.editar(this.productor._id, data);

        // Solo actualiza el item en cache
        this.listados.patchEntityItem('productors', {
         _id: this.productor._id,
         ...data,
        });  

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {

        const created = await this.service.crear(data);
        productorCreado = created;

        // Solo actualiza el item en cache
        this.listados.createEntityItem('productors', created);

        this.helper.notifSuccess(this.translate.instant('Creado correctamente'));
      }
      if (crearUsuario && productorCreado) {
        this.paramsService.set('productorParaUsuario', productorCreado);
        await this.router.navigateByUrl('/usuarios/crear');
        return;
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
    if (this.loginService.esTenant) {
      this.router.navigateByUrl('/dashboard-tenant');
      return;
    }
    window.history.back();
  }

  private checkDisabled(): void {
    // form Valid siempre
    // si hay formLicencia, también tiene que ser válido
    // si hay mostrarLicencia y no hay editarLicencia, entonces tiene que haber una licencia seleccionada
    this.disabled = !this.form?.valid;
    if (this.mostrarLicencia) {
      this.disabled = this.disabled || !this.licencia;
    }
  }

  private subcribeFormChanges(): void {
    this.form?.valueChanges.subscribe(() => {
      this.checkDisabled();
    });
    this.formLicencia?.valueChanges.subscribe(() => {
      this.checkDisabled();
    });
  }

  // LISTADOS
  private async listarDistribuidores(idQuimica: string): Promise<void> {
    const filter: IFilter<IDistribuidor> = {
      idQuimica,
    };
    const queryParams: IQueryParam = {
      filter: JSON.stringify(filter),
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.distribuidores$?.unsubscribe();
    this.distribuidores$ = this.listados
      .subscribe<IListado<IDistribuidor>>('distribuidors', queryParams)
      .subscribe(async (data) => {
        this.distribuidores = data.datos;
        console.log(`listado de distribuidors`, data);
      });
    await this.listados.getLastValue('distribuidors', queryParams);
  }

  private async listarQuimicas(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.quimicas$?.unsubscribe();
    this.quimicas$ = this.listados.subscribe<IListado<IQuimica>>('quimicas', queryParams).subscribe(async (data) => {
      this.quimicas = data.datos;
      console.log(`listado de quimicas`, data);
    });
    await this.listados.getLastValue('quimicas', queryParams);
  }

  //

  public async onQuimicaChange(event: SelectChangeEvent) {
    await this.listarDistribuidores(event.value);
  }

  /// HOOKS

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.productor = this.paramsService.get('editProductor');
    if (this.productor) {
      console.log('edit', this.productor);
    }
    if (this.mostrarLicencia === true) {
      await this.onMostrarLicenciaChange(true);
    }
    this.titulo = this.productor
      ? () => this.translate.instant(`Editar productor`)
      : () => this.translate.instant('Crear productor');
    await Promise.all([this.loginService.esAdmin ? this.listarQuimicas() : null]);
    this.createForm();
    if (this.productor?.geojson) {
      this.direccionSeleccionada = {
        direccion: this.productor.direccion || '',
        geojson: this.productor.geojson,
      };
    }
    if (this.loginService.esAdmin) {
      this.createFormLicencia();
    }
    this.subcribeFormChanges();
    this.checkDisabled();
    this.loading = false;
  }

  private debeGuardarLicencia(): boolean {
    if (!this.mostrarLicencia || !this.licencia?._id) return false;
    if (!this.productor?._id) return true;
    return (
      this.licencia._id !== this.licenciaInicialId ||
      this.fechaKey(this.fechaDeExpiracion) !== this.expiracionInicial
    );
  }

  private fechaKey(fecha?: Date): string | undefined {
    if (!fecha || Number.isNaN(fecha.getTime())) return undefined;
    return `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`;
  }

  ngOnDestroy(): void {
    this.distribuidores$?.unsubscribe();
    this.quimicas$?.unsubscribe();
    this.licencias$?.unsubscribe();
  }

  public onDireccionChange(direccion: DireccionSeleccionada): void {
    this.direccionSeleccionada = direccion;
    this.form?.patchValue({
      direccion: direccion.direccion,
      geojson: direccion.geojson,
    });
    this.checkDisabled();
  }

  public onDireccionClear(): void {
    this.direccionSeleccionada = undefined;
    this.form?.patchValue({ direccion: null, geojson: null });
    this.checkDisabled();
  }
}
