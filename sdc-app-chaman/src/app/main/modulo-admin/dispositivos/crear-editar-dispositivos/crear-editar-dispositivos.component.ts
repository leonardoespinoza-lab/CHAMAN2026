import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
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
    });
  }

  private getData() {
    const data = { ...(this.form?.value || {}) } as ICreateDispositivo;
    if (data.fechaAsignacionLote) {
      data.fechaAsignacionLote = new Date(data.fechaAsignacionLote).toISOString();
    }
    return data;
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
}
