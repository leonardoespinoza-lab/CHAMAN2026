import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ICreateLicencia, ICreateQuimica, IEstadoLicenciaEntidad, ILicencia, IListado, IQueryParam, IQuimica } from 'modelos/src';
import { Subscription } from 'rxjs';
import { QuimicaService } from '../../../../auxiliares/http/quimica.service';
import { LicenciaPorEntidadService } from '../../../../auxiliares/http/licencia-por-entidad.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-crear-editar-quimicas',
  imports: [SharedModule],
  templateUrl: './crear-editar-quimicas.component.html',
  styleUrl: './crear-editar-quimicas.component.scss',
})
export class CrearEditarQuimicasComponent implements OnInit, OnDestroy {
  private readonly maxLogoBytes = 450 * 1024;

  public loading = false;
  public quimica?: IQuimica;
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

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: QuimicaService,
    public helper: HelperService,
    private listados: ListadosService,
    private licenciaPorEntidadService: LicenciaPorEntidadService,
  ) {}

  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.quimica?.nombre, Validators.required),
      razonSocial: new FormControl(this.quimica?.razonSocial),
      cuit: new FormControl(this.quimica?.cuit),
      logo: new FormControl(this.quimica?.logo),
      email: new FormControl(this.quimica?.email, Validators.email),
      telefono: new FormControl(this.quimica?.telefono),
      web: new FormControl(this.quimica?.web),
      direccionFiscal: new FormControl(this.quimica?.direccionFiscal),
      observaciones: new FormControl(this.quimica?.observaciones),
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
    const data: ICreateQuimica = {
      ...this.form?.value,
      cuit: this.normalizarCuit(this.form?.value?.cuit),
    };
    return data;
  }

  public logoPreview(): string | undefined {
    const logo = this.form?.get('logo')?.value || this.quimica?.logo;
    return typeof logo === 'string' && logo.trim() ? logo : undefined;
  }

  public iniciales(): string {
    const nombre = (this.form?.get('nombre')?.value || this.quimica?.nombre || 'C').trim();
    return nombre
      .split(/\s+/)
      .slice(0, 2)
      .map((parte: string) => parte.charAt(0).toUpperCase())
      .join('');
  }

  public async onLogoFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.helper.notifWarn('El logo debe ser una imagen.');
      return;
    }

    if (file.size > this.maxLogoBytes) {
      this.helper.notifWarn('El logo debe pesar menos de 450 KB.');
      return;
    }

    const dataUrl = await this.fileToDataUrl(file);
    this.form?.get('logo')?.setValue(dataUrl);
    this.form?.get('logo')?.markAsDirty();
    this.checkDisabled();
  }

  public limpiarLogo(): void {
    this.form?.get('logo')?.setValue('');
    this.form?.get('logo')?.markAsDirty();
    this.checkDisabled();
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private normalizarCuit(cuit?: string): string | undefined {
    const limpio = String(cuit || '').replace(/\D/g, '');
    return limpio || undefined;
  }

  private getDataLicencia() {
    const data: ICreateLicencia = this.formLicencia?.value;
    return data;
  }

  private async listar(): Promise<void> {
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
      if (this.quimica?._id) {
        this.estadoLicencia = await this.licenciaPorEntidadService.getEstadoEntidad('Quimica', this.quimica._id);
        if (this.estadoLicencia.asignacion?.fechaExpiracion) {
          this.fechaDeExpiracion = new Date(this.estadoLicencia.asignacion.fechaExpiracion);
        }
      }
      await this.listar();
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

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.debeGuardarLicencia()) {
        data.expiracion = this.helper.dateToDias(this.fechaDeExpiracion);
        data.licencia = { _id: this.licencia!._id } as any;
      }
      if (this.quimica?._id) {
        await this.service.editar(this.quimica._id, data);
        
        // Solo actualiza el item en cache
        this.listados.patchEntityItem('quimicas', {
          _id: this.quimica._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {        
          
        const created = await this.service.crear(data);
        
        // Solo actualiza el item en cache
        this.listados.createEntityItem('quimicas', created);

        this.helper.notifSuccess(this.translate.instant('Creado correctamente'));
      }
      //this.listados.borrarCache();
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

  private debeGuardarLicencia(): boolean {
    if (!this.mostrarLicencia || !this.licencia?._id) return false;
    if (!this.quimica?._id) return true;
    return (
      this.licencia._id !== this.licenciaInicialId ||
      this.fechaKey(this.fechaDeExpiracion) !== this.expiracionInicial
    );
  }

  private fechaKey(fecha?: Date): string | undefined {
    if (!fecha || Number.isNaN(fecha.getTime())) return undefined;
    return `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`;
  }

  private subcribeFormChanges(): void {
    this.form?.valueChanges.subscribe(() => {
      this.checkDisabled();
    });
    this.formLicencia?.valueChanges.subscribe(() => {
      this.checkDisabled();
    });
  }

  // Hooks
  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.quimica = this.paramsService.get('editQuimica');
    if (this.quimica) {
      console.log('edit', this.quimica);
    } else {
      this.mostrarLicencia = true; // Pongo el coso de las licencias por defecto en el create
    }
    if (this.mostrarLicencia === true) {
      await this.onMostrarLicenciaChange(true);
    }
    this.titulo = this.quimica
      ? () => this.translate.instant(`Editar compañía`)
      : () => this.translate.instant(`Crear compañía`);
    this.createForm();
    this.subcribeFormChanges();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.licencias$?.unsubscribe();
  }
}
