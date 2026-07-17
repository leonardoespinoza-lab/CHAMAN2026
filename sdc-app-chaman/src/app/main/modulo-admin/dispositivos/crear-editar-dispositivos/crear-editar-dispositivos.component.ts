import { Component, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  ICreateDispositivo,
  IDispositivo,
  IEstablecimiento,
  IListado,
  ILote,
  IPopulate,
  IProductor,
  IQueryParam,
  SensoresV2,
  TipoDispositivo,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { DispositivoService } from '../../../../auxiliares/http/dispositivos.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-crear-editar-dispositivos',
  imports: [SharedModule],
  templateUrl: './crear-editar-dispositivos.component.html',
  styleUrl: './crear-editar-dispositivos.component.scss',
})
export class CrearEditarDispositivosComponent implements OnInit, OnDestroy {
  public loading = false;
  public dispositivo?: IDispositivo;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public productores: IProductor[] = [];
  public establecimientos: IEstablecimiento[] = [];
  public lotes: ILote[] = [];
  private prefillLorawan?: Partial<IDispositivo>;
  private loteInicial?: string;

  private productores$?: Subscription;
  private establecimientos$?: Subscription;
  private lotes$?: Subscription;

  public tiposDispositivo: TipoDispositivo[] = [
    'Estacion Meteorologica',
    'Sensor de Humedad de Suelo',
    'Pluviometro',
    'Otro',
  ];

  public sensores: SensoresV2[] = [
    'Temperatura',
    'Temperatura Suelo',
    'Humedad',
    'Humedad Suelo Superficial',
    'Humedad Suelo Profundidad',
    'Salinidad Suelo',
    'Viento Velocidad',
    'Viento Dirección',
    'Pluviometro',
    'Presión',
    'Evapotranspiración',
    'Radiación Solar',
    'Napa',
    'Batería',
    'Otro',
  ];

  public readonly estadosCalificacion = [
    {
      label: 'Referencia de campo',
      value: 'referencia',
    },
    {
      label: 'Calificado para decisiones',
      value: 'calificado',
    },
    {
      label: 'Rechazado para variables de aire',
      value: 'rechazado',
    },
  ];

  public readonly rolesTemperatura = [
    { label: 'Aire a 2 m', value: 'aire_2m' },
    { label: 'Aire en canopia', value: 'aire_canopia' },
    { label: 'Suelo', value: 'suelo' },
    { label: 'Sin confirmar', value: 'desconocido' },
  ];

  constructor(
    private route: ActivatedRoute,
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: DispositivoService,
    public helper: HelperService,
    private listados: ListadosService
  ) {}

  public get lorawanSource(): Partial<IDispositivo> | undefined {
    return this.dispositivo || this.prefillLorawan;
  }

  public get establecimientosFiltrados(): IEstablecimiento[] {
    const idProductor = this.form?.get('idProductor')?.value;
    if (!idProductor) {
      return this.establecimientos;
    }
    return this.establecimientos.filter((establecimiento) => establecimiento.idProductor === idProductor);
  }

  public get lotesFiltrados(): ILote[] {
    const idProductor = this.form?.get('idProductor')?.value;
    const idEstablecimiento = this.form?.get('idEstablecimiento')?.value;

    return this.lotes.filter((lote) => {
      if (idEstablecimiento) {
        return lote.idEstablecimiento === idEstablecimiento;
      }
      if (idProductor) {
        return lote.idProductor === idProductor;
      }
      return true;
    });
  }

  private createForm(): void {
    const source = this.dispositivo || this.prefillLorawan;
    this.loteInicial = source?.idLote || '';
    this.form = new FormGroup({
      nombre: new FormControl(source?.nombre),
      deveui: new FormControl(source?.deveui, Validators.required),
      tipo: new FormControl(source?.tipo || 'Otro', Validators.required),
      sensores: new FormControl(source?.sensores || [], Validators.required),
      idProductor: new FormControl(source?.idProductor),
      idEstablecimiento: new FormControl(source?.idEstablecimiento),
      idLote: new FormControl(source?.idLote),
      fechaAsignacionLote: new FormControl(this.toDateTimeLocal(source?.fechaAsignacionLote)),
      calificacionMeteorologica: new FormGroup(
        {
          estado: new FormControl(source?.calificacionMeteorologica?.estado || 'referencia', Validators.required),
          rolTemperatura: new FormControl(source?.calificacionMeteorologica?.rolTemperatura || 'desconocido'),
          alturaM: new FormControl(source?.calificacionMeteorologica?.alturaM, [
            Validators.min(0.01),
            Validators.max(10),
          ]),
          abrigoRadiacion: new FormControl(source?.calificacionMeteorologica?.abrigoRadiacion === true),
          exactitudTemperaturaC: new FormControl(source?.calificacionMeteorologica?.exactitudTemperaturaC, [
            Validators.min(0.01),
            Validators.max(2),
          ]),
          fechaCalibracion: new FormControl(this.toDateInput(source?.calificacionMeteorologica?.fechaCalibracion)),
          proximaCalibracion: new FormControl(this.toDateInput(source?.calificacionMeteorologica?.proximaCalibracion)),
          offsetTemperaturaC: new FormControl(source?.calificacionMeteorologica?.offsetTemperaturaC, [
            Validators.min(-10),
            Validators.max(10),
          ]),
          fuenteCalibracion: new FormControl(source?.calificacionMeteorologica?.fuenteCalibracion),
          observaciones: new FormControl(source?.calificacionMeteorologica?.observaciones),
          humedadRelativa: new FormGroup(
            {
              estado: new FormControl(
                source?.calificacionMeteorologica?.humedadRelativa?.estado || 'referencia',
                Validators.required
              ),
              rol: new FormControl(source?.calificacionMeteorologica?.humedadRelativa?.rol || 'desconocido'),
              alturaM: new FormControl(source?.calificacionMeteorologica?.humedadRelativa?.alturaM, [
                Validators.min(0.01),
                Validators.max(10),
              ]),
              abrigoRadiacion: new FormControl(
                source?.calificacionMeteorologica?.humedadRelativa?.abrigoRadiacion === true
              ),
              exactitud: new FormControl(source?.calificacionMeteorologica?.humedadRelativa?.exactitud, [
                Validators.min(0.01),
                Validators.max(5),
              ]),
              fechaCalibracion: new FormControl(
                this.toDateInput(source?.calificacionMeteorologica?.humedadRelativa?.fechaCalibracion)
              ),
              proximaCalibracion: new FormControl(
                this.toDateInput(source?.calificacionMeteorologica?.humedadRelativa?.proximaCalibracion)
              ),
              offset: new FormControl(source?.calificacionMeteorologica?.humedadRelativa?.offset, [
                Validators.min(-20),
                Validators.max(20),
              ]),
              fuenteCalibracion: new FormControl(source?.calificacionMeteorologica?.humedadRelativa?.fuenteCalibracion),
              observaciones: new FormControl(source?.calificacionMeteorologica?.humedadRelativa?.observaciones),
            },
            { validators: [this.calificacionHumedadValidator] }
          ),
        },
        { validators: [this.calificacionMeteorologicaValidator] }
      ),
    });
  }

  private getData() {
    const data = { ...(this.form?.value || {}) } as ICreateDispositivo;
    if (data.fechaAsignacionLote) {
      data.fechaAsignacionLote = new Date(data.fechaAsignacionLote).toISOString();
    }
    const qualification = data.calificacionMeteorologica;
    if (qualification) {
      const humidity = qualification.humedadRelativa;
      data.calificacionMeteorologica = {
        ...qualification,
        alturaM: this.numberOrUndefined(qualification.alturaM),
        exactitudTemperaturaC: this.numberOrUndefined(qualification.exactitudTemperaturaC),
        offsetTemperaturaC: this.numberOrUndefined(qualification.offsetTemperaturaC),
        fechaCalibracion: this.toIsoDate(qualification.fechaCalibracion, false),
        proximaCalibracion: this.toIsoDate(qualification.proximaCalibracion, true),
        fuenteCalibracion: qualification.fuenteCalibracion?.trim() || undefined,
        observaciones: qualification.observaciones?.trim() || undefined,
        humedadRelativa: humidity
          ? {
              ...humidity,
              alturaM: this.numberOrUndefined(humidity.alturaM),
              exactitud: this.numberOrUndefined(humidity.exactitud),
              offset: this.numberOrUndefined(humidity.offset),
              fechaCalibracion: this.toIsoDate(humidity.fechaCalibracion, false),
              proximaCalibracion: this.toIsoDate(humidity.proximaCalibracion, true),
              fuenteCalibracion: humidity.fuenteCalibracion?.trim() || undefined,
              observaciones: humidity.observaciones?.trim() || undefined,
            }
          : undefined,
      };
    }
    return data;
  }

  public get estadoCalificacion(): string {
    return this.form?.get('calificacionMeteorologica.estado')?.value || 'referencia';
  }

  public get estadoCalificacionHumedad(): string {
    return this.form?.get('calificacionMeteorologica.humedadRelativa.estado')?.value || 'referencia';
  }

  public get historialCalibraciones() {
    return this.dispositivo?.calificacionMeteorologica?.historialCalibraciones || [];
  }

  public onProductorChange(): void {
    this.form?.get('idEstablecimiento')?.setValue(null);
    this.form?.get('idLote')?.setValue(null);
    this.form?.get('fechaAsignacionLote')?.setValue(null);
  }

  public onEstablecimientoChange(): void {
    this.form?.get('idLote')?.setValue(null);
    this.form?.get('fechaAsignacionLote')?.setValue(null);
  }

  public onLoteChange(): void {
    const idLote = this.form?.get('idLote')?.value || '';
    const fechaControl = this.form?.get('fechaAsignacionLote');
    if (!idLote) {
      fechaControl?.setValue(null);
      return;
    }

    if (!fechaControl?.value || idLote !== this.loteInicial) {
      fechaControl?.setValue(this.toDateTimeLocal(new Date().toISOString()));
    }
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.dispositivo?._id) {
        await this.service.update(this.dispositivo._id, data);
        this.listados.patchEntityItem('dispositivos', {
          _id: this.dispositivo._id,
          ...data,
        });
        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.create(data);
        this.listados.createEntityItem('dispositivos', created);
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

  private async listarProductores(): Promise<void> {
    const populate: IPopulate[] = [];
    const queryParams: IQueryParam = {
      populate: JSON.stringify(populate),
      page: 0,
      limit: 0,
      select: 'nombre',
      sort: 'nombre',
    };

    this.productores$?.unsubscribe();
    this.productores$ = this.listados
      .subscribe<IListado<IProductor>>('productors', queryParams)
      .subscribe(async (data) => {
        this.productores = data.datos;
      });
    await this.listados.getLastValue('productors', queryParams);
  }

  private async listarEstablecimientos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      select: 'nombre idProductor',
      sort: 'nombre',
    };

    this.establecimientos$?.unsubscribe();
    this.establecimientos$ = this.listados
      .subscribe<IListado<IEstablecimiento>>('establecimientos', queryParams)
      .subscribe(async (data) => {
        this.establecimientos = data.datos;
      });
    await this.listados.getLastValue('establecimientos', queryParams);
  }

  private async listarLotes(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      select: 'nombre idProductor idEstablecimiento',
      sort: 'nombre',
    };

    this.lotes$?.unsubscribe();
    this.lotes$ = this.listados.subscribe<IListado<ILote>>('lotes', queryParams).subscribe(async (data) => {
      this.lotes = data.datos;
    });
    await this.listados.getLastValue('lotes', queryParams);
  }

  private async cargarDispositivo(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    const dispositivoEnMemoria = this.paramsService.get('editDispositivo') as IDispositivo | undefined;
    this.prefillLorawan = this.paramsService.get('nuevoDispositivoLorawan') as Partial<IDispositivo> | undefined;

    if (id && dispositivoEnMemoria?._id !== id) {
      this.dispositivo = await this.service.getById(id);
      this.prefillLorawan = undefined;
      return;
    }

    this.dispositivo = dispositivoEnMemoria?._id ? dispositivoEnMemoria : undefined;
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    await this.cargarDispositivo();
    this.titulo = this.dispositivo
      ? () => this.translate.instant(`Editar dispositivo`)
      : () => this.translate.instant(`Crear dispositivo`);
    this.createForm();
    await Promise.all([this.listarProductores(), this.listarEstablecimientos(), this.listarLotes()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.productores$?.unsubscribe();
    this.establecimientos$?.unsubscribe();
    this.lotes$?.unsubscribe();
  }

  private toDateTimeLocal(value?: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  private toDateInput(value?: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  private toIsoDate(value?: string, endOfDay = false): string | undefined {
    if (!value) return undefined;
    const date = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${endOfDay ? '23:59:59.999' : '12:00:00.000'}Z` : value
    );
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private numberOrUndefined(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private readonly calificacionMeteorologicaValidator = (control: AbstractControl): ValidationErrors | null => {
    if (control.get('estado')?.value !== 'calificado') return null;

    const role = control.get('rolTemperatura')?.value;
    const height = Number(control.get('alturaM')?.value);
    const accuracy = Number(control.get('exactitudTemperaturaC')?.value);
    const shielded = control.get('abrigoRadiacion')?.value === true;
    const source = String(control.get('fuenteCalibracion')?.value || '').trim();
    const calibratedAt = this.dateInputTimestamp(control.get('fechaCalibracion')?.value, false);
    const validUntil = this.dateInputTimestamp(control.get('proximaCalibracion')?.value, true);

    const complete =
      (role === 'aire_2m' || role === 'aire_canopia') &&
      Number.isFinite(height) &&
      height > 0 &&
      height <= 10 &&
      shielded &&
      Number.isFinite(accuracy) &&
      accuracy > 0 &&
      accuracy <= 2 &&
      calibratedAt !== undefined &&
      calibratedAt <= Date.now() &&
      validUntil !== undefined &&
      validUntil >= Date.now() &&
      validUntil >= calibratedAt &&
      !!source;

    return complete ? null : { calificacionMeteorologicaIncompleta: true };
  };

  private readonly calificacionHumedadValidator = (control: AbstractControl): ValidationErrors | null => {
    if (control.get('estado')?.value !== 'calificado') return null;

    const role = control.get('rol')?.value;
    const height = Number(control.get('alturaM')?.value);
    const accuracy = Number(control.get('exactitud')?.value);
    const shielded = control.get('abrigoRadiacion')?.value === true;
    const source = String(control.get('fuenteCalibracion')?.value || '').trim();
    const calibratedAt = this.dateInputTimestamp(control.get('fechaCalibracion')?.value, false);
    const validUntil = this.dateInputTimestamp(control.get('proximaCalibracion')?.value, true);

    const complete =
      (role === 'aire_2m' || role === 'aire_canopia') &&
      Number.isFinite(height) &&
      height > 0 &&
      height <= 10 &&
      shielded &&
      Number.isFinite(accuracy) &&
      accuracy > 0 &&
      accuracy <= 5 &&
      calibratedAt !== undefined &&
      calibratedAt <= Date.now() &&
      validUntil !== undefined &&
      validUntil >= Date.now() &&
      validUntil >= calibratedAt &&
      !!source;

    return complete ? null : { calificacionHumedadIncompleta: true };
  };

  private dateInputTimestamp(value: unknown, endOfDay: boolean): number | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
      : value;
    const timestamp = new Date(normalized).getTime();
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }
}
