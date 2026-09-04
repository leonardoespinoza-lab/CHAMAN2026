import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  ICreateDistribuidor,
  ICreateLicencia,
  IDistribuidor,
  IEstadoLicenciaEntidad,
  ILicencia,
  IListado,
  IQueryParam,
  IQuimica,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import {
  AutocompleteDireccionComponent,
  DireccionSeleccionada,
} from '../../../../auxiliares/componentes/autocomplete-direccion/autocomplete-direccion.component';
import { DistribuidorService } from '../../../../auxiliares/http/distribuidor.service';
import { LoginService } from '../../../../auxiliares/http/login.service';
import { LicenciaPorEntidadService } from '../../../../auxiliares/http/licencia-por-entidad.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';


@Component({
  selector: 'app-crear-editar-distribuidores',
  imports: [SharedModule, AutocompleteDireccionComponent],
  templateUrl: './crear-editar-distribuidores.component.html',
  styleUrl: './crear-editar-distribuidores.component.scss',
})
export class CrearEditarDistribuidoresComponent implements OnInit, OnDestroy {
  public loading = false;
  public distribuidor?: IDistribuidor;
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
  public quimicas: IQuimica[] = [];
  private quimicas$?: Subscription;

  // DIRECCIÓN
  public direccionSeleccionada?: DireccionSeleccionada;

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: DistribuidorService,
    public helper: HelperService,
    private listados: ListadosService,
    public loginService: LoginService,
    private licenciaPorEntidadService: LicenciaPorEntidadService,
  ) {}

  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.distribuidor?.nombre, Validators.required),
      logo: new FormControl(this.distribuidor?.logo),
      idQuimica: new FormControl(this.distribuidor?.idQuimica),
      direccion: new FormControl(this.distribuidor?.direccion),
      geojson: new FormControl(this.distribuidor?.geojson),
      radioInfluenciaKm: new FormControl(this.distribuidor?.radioInfluenciaKm || 100, [
        Validators.min(1),
        Validators.max(1000),
      ]),
    });
  }

  private createFormLicencia(): void {
    this.formLicencia = new FormGroup({
      nombre: new FormControl('Licencia manual', Validators.required),
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

  // ACCIONES

  private getData() {
    const data: ICreateDistribuidor = this.form?.value;
    return data;
  }

  private getDataLicencia() {
    const data: ICreateLicencia = this.formLicencia?.value;
    return data;
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
      if (this.estadoLicencia?.licencia?._id) {
        this.licencia = this.licencias.find((item) => item._id === this.estadoLicencia?.licencia?._id);
        if (this.licencia) await this.onLicenciaChange(this.licencia);
      }
    });
    await this.listados.getLastValue('licencias', queryParams);
  }

  public async onMostrarLicenciaChange(event: boolean): Promise<void> {
    this.mostrarLicencia = event;
    if (this.mostrarLicencia === true) {
      this.createFormLicencia();
      if (this.distribuidor?._id) {
        this.estadoLicencia = await this.licenciaPorEntidadService.getEstadoEntidad(
          'Distribuidor',
          this.distribuidor._id,
        );
        if (this.estadoLicencia.asignacion?.fechaExpiracion) {
          this.fechaDeExpiracion = new Date(this.estadoLicencia.asignacion.fechaExpiracion);
        }
      }
      await this.listarLicencias();
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

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.debeGuardarLicencia()) {
        data.expiracion = this.helper.dateToDias(this.fechaDeExpiracion);
        data.licencia = { _id: this.licencia!._id } as any;
      }
      if (this.distribuidor?._id) {
        await this.service.editar(this.distribuidor._id, data);
        
        this.listados.patchEntityItem('distribuidors', {
         _id: this.distribuidor._id,
         ...data,
        });  

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);
        
        // Solo actualiza el item en cache
        this.listados.createEntityItem('distribuidors', created);       

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
      console.log('form changes', this.form?.value);
      this.checkDisabled();
    });
    this.formLicencia?.valueChanges.subscribe(() => {
      console.log('formLicencia changes', this.formLicencia?.value);
      this.checkDisabled();
    });
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

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.distribuidor = this.paramsService.get('editDistribuidor');
    if (this.distribuidor) {
      console.log('edit', this.distribuidor);
    }
    if (this.mostrarLicencia === true) {
      await this.onMostrarLicenciaChange(true);
    }
    this.titulo = this.distribuidor
      ? () => this.translate.instant(`Editar distribuidor`)
      : () => this.translate.instant(`Crear distribuidor`);
    if (this.loginService.esAdmin) {
      await this.listarQuimicas();
    }
    this.createForm();
    // Cargar geojson si existe
    if (this.distribuidor?.geojson) {
      this.direccionSeleccionada = {
        direccion: this.distribuidor.direccion || '',
        geojson: this.distribuidor.geojson,
      };
      // Actualizar el formulario con los datos existentes
      this.form?.patchValue({
        direccion: this.distribuidor.direccion,
        geojson: this.distribuidor.geojson,
      });
    }
    // Suscribirse a los cambios después de cargar todos los datos
    this.subcribeFormChanges();
    // Evaluar el estado del formulario después de cargar todos los datos
    this.checkDisabled();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.quimicas$?.unsubscribe();
    this.licencias$?.unsubscribe();
  }

  // MÉTODOS PARA DIRECCIÓN
  public onDireccionChange(direccion: DireccionSeleccionada): void {
    this.direccionSeleccionada = direccion;
    this.form?.patchValue({
      direccion: direccion.direccion,
      geojson: direccion.geojson,
    });
    // Forzar validación del formulario
    this.checkDisabled();
  }

  private debeGuardarLicencia(): boolean {
    if (!this.mostrarLicencia || !this.licencia?._id) return false;
    if (!this.distribuidor?._id) return true;
    return (
      this.licencia._id !== this.licenciaInicialId ||
      this.fechaKey(this.fechaDeExpiracion) !== this.expiracionInicial
    );
  }

  private fechaKey(fecha?: Date): string | undefined {
    if (!fecha || Number.isNaN(fecha.getTime())) return undefined;
    return `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`;
  }

  public onDireccionClear(): void {
    this.direccionSeleccionada = undefined;
    this.form?.patchValue({ direccion: null, geojson: null });
    this.checkDisabled();
  }
}
