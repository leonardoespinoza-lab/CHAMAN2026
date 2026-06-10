import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  ICreateDispositivo,
  IDispositivo,
  IListado,
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
  private productores$?: Subscription;

  public tiposDispositivo: TipoDispositivo[] = [
    'Estación Meteorológica',
    'Sensor de Humedad de Suelo',
    'Pluviómetro',
    'Otro',
  ];

  public sensores: SensoresV2[] = [
    'Temperatura',
    'Temperatura Suelo',
    'Humedad',
    'Humedad Suelo Superficial',
    'Humedad Suelo Profundidad',
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
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: DispositivoService,
    public helper: HelperService,
    private listados: ListadosService
  ) {}

  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.dispositivo?.nombre),
      deveui: new FormControl(this.dispositivo?.deveui, Validators.required),
      tipo: new FormControl(this.dispositivo?.tipo, Validators.required),
      sensores: new FormControl(this.dispositivo?.sensores, Validators.required),
      idProductor: new FormControl(this.dispositivo?.idProductor),
    });
  }

  // ACCIONES

  private getData() {
    const data: ICreateDispositivo = this.form?.value;
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.dispositivo?._id) {
        await this.service.update(this.dispositivo._id, data);

        // Solo actualiza el item en cache
        this.listados.patchEntityItem('dispositivos', {
          _id: this.dispositivo._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
        // console.log('edit', data);
      } else {
        const created = await this.service.create(data);

        // Solo actualiza el item en cache
        this.listados.createEntityItem('dispositivos', created);

        this.helper.notifSuccess(this.translate.instant('Creado correctamente'));
        // console.log('crear', data);
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

  // Listados
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
        console.log(`listado de productors`, data);
      });
    await this.listados.getLastValue('productors', queryParams);
  }

  // Hooks
  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.dispositivo = this.paramsService.get('editDispositivo');
    if (this.dispositivo) {
      console.log('edit', this.dispositivo);
    }
    this.titulo = this.dispositivo
      ? () => this.translate.instant(`Editar dispositivo`)
      : () => this.translate.instant(`Crear dispositivo`);
    this.createForm();
    await Promise.all([this.listarProductores()]);
    this.loading = false;
  }

  ngOnDestroy(): void {}
}
