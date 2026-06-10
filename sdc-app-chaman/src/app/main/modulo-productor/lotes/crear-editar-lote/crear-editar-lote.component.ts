import { Component, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  ICoordenadas,
  ICreateLote,
  IDepartamento,
  IDispositivo,
  IEstablecimiento,
  IEstacion,
  IFilter,
  IGeoJSONPoint,
  IGeoJSONPolygon,
  IListado,
  IPopulate,
  IQueryParam,
  ISuelo,
  TTexturaSuelo,
  TTipoContenidoP,
  TTipoDepositoN,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { MapDrawComponent } from '../../../../auxiliares/componentes/map-draw/map-draw.component';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';

@Component({
  selector: 'app-crear-editar-lote',
  imports: [SharedModule, MapDrawComponent],
  templateUrl: './crear-editar-lote.component.html',
  styleUrl: './crear-editar-lote.component.scss',
})
export class CrearEditarLoteComponent implements OnInit {
  public loading = false;
  public lote?: ILoteTabla;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public establecimientos: IEstablecimiento[] = [];
  public establecimientos$?: Subscription;
  public departamentos: IDepartamento[] = [];
  public departamentos$?: Subscription;
  public sondasSuelo: IEstacion[] = [];
  public sondasSuelo$?: Subscription;
  public dispositivos: IDispositivo[] = [];
  public dispositivos$?: Subscription;

  public distanciaSonda?: string;
  public sueloIntaLoading = false;
  public sueloIntaInfo?: any;

  public texturas: TTexturaSuelo[] = ['Arcilloso', 'Franco arcilloso', 'Franco', 'Franco arenoso', 'Arenoso'];

  public depositoN: TTipoDepositoN[] = ['< 0.5', '> 0.5', '< 1.5', '> 1.5'];
  public drenaje: TTipoDrenaje[] = ['Mal Drenado', 'Moderadamente Drenado', 'Bien Drenado', 'Excesivamente Drenado'];
  public erosionEscorrentiaPendiente: TTipoErosionEscorrentiaPendiente[] = [
    'Baja (0 - 3%)',
    'Moderada (3 - 8%)',
    'Alta (8 - 15%)',
    'Muy Alta (> 15%)',
  ];
  public contenidoP: TTipoContenidoP[] = ['< 12', '> 12 < 20', '> 20 < 30', '> 30'];

  public get suelos() {
    return this.form?.get('suelos') as FormArray;
  }

  get geojson() {
    return this.form?.get('ubicacion.geojson') as FormGroup;
  }
  get geoJsonEstablecimiento() {
    const idEstablecimiento = this.form?.get('idEstablecimiento')?.value;
    const e = this.establecimientos.find((d) => d._id === idEstablecimiento);
    return e?.ubicacion?.filter((d) => d.geojson).map((d) => d.geojson!) || [];
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: LoteService,
    private helper: HelperService,
    private listado: ListadosService
  ) {}

  // FORMULARIO
  private initSuelos() {
    const array: FormGroup[] = [];
    if (this.lote?.suelos) {
      for (const p of this.lote.suelos) {
        array.push(this.agregarSueloFormGroup(p));
      }
      return array;
    } else {
      array.push(this.agregarSueloFormGroup());
      return array;
    }
  }
  public agregarSueloFormGroup(p?: ISuelo): FormGroup {
    return new FormGroup({
      profundidad: new FormControl(p?.profundidad),
      textura: new FormControl(p?.textura),
      hayRaices: new FormControl(p?.hayRaices),
      capacidadDeCampo: new FormControl(p?.capacidadDeCampo),
      puntoMarchitez: new FormControl(p?.puntoMarchitez),
      numeroDeSensor: new FormControl(p?.numeroDeSensor),
    });
  }
  public agregarSuelo() {
    this.suelos.push(this.agregarSueloFormGroup());
  }
  public borrarSuelo(i: number) {
    this.suelos.removeAt(i);
  }
  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.lote?.nombre, Validators.required),
      idEstablecimiento: new FormControl(this.lote?.idEstablecimiento, Validators.required),
      idDepartamento: new FormControl(this.lote?.idDepartamento, Validators.required),
      idSondaSuelo: new FormControl(this.lote?.idSondaSuelo),
      idsDispositivo: new FormControl(this.lote?.idsDispositivo),
      capacidadDeCampo: new FormControl(this.lote?.capacidadDeCampo),
      puntoMarchitez: new FormControl(this.lote?.puntoMarchitez),
      capacidadDeRiego: new FormControl(this.lote?.capacidadDeRiego),
      anchoDeBulbo: new FormControl(this.lote?.anchoDeBulbo),
      metrosLinealesHas: new FormControl(this.lote?.metrosLinealesHas),
      ubicacion: new FormGroup({
        geojson: new FormGroup({
          type: new FormControl('Polygon', [Validators.required]),
          coordinates: new FormControl(this.lote?.ubicacion?.geojson?.coordinates),
        }),
        centro: new FormControl(this.lote?.ubicacion?.centro),
        superficie: new FormControl(this.lote?.ubicacion?.superficie),
      }),
      suelos: new FormArray(this.initSuelos()),

      // Datos para Huella Hídrica
      depositoN: new FormControl(this.lote?.depositoN),
      texturaLixiviacion: new FormControl(this.lote?.texturaLixiviacion),
      texturaEscorrentia: new FormControl(this.lote?.texturaEscorrentia),
      drenajeNaturalLixiviacion: new FormControl(this.lote?.drenajeNaturalLixiviacion),
      drenajeNaturalEscorrentia: new FormControl(this.lote?.drenajeNaturalEscorrentia),
      erosionEscorrentiaPendiente: new FormControl(this.lote?.erosionEscorrentiaPendiente),
      contenidoP: new FormControl(this.lote?.contenidoP),
    });
  }

  // FUNCIONES
  public cambioSondaSuelo() {
    const idSondaSuelo = this.form?.get('idSondaSuelo')?.value;
    const sondaSuelo = this.sondasSuelo.find((d) => d._id === idSondaSuelo);
    if (!sondaSuelo) return;
    const geojsonLote = this.geojson?.value as IGeoJSONPolygon;
    if (!geojsonLote?.coordinates?.length) return;
    const centroLote: IGeoJSONPoint = {
      type: 'Point',
      coordinates: this.helper.calcularCentroide(geojsonLote),
    };
    const centroSonda = sondaSuelo.position?.geo as IGeoJSONPoint;
    if (!centroSonda || !centroLote) {
      this.distanciaSonda = '';
      return;
    }
    const distanciaSonda = Math.trunc(this.helper.calcularDistancia(centroLote, centroSonda));
    if (distanciaSonda > 1000) {
      this.distanciaSonda = `${Math.trunc(distanciaSonda / 1000)} km`;
    } else {
      this.distanciaSonda = `${distanciaSonda} m`;
    }
  }

  public async autocompletarSueloInta(): Promise<void> {
    if (!this.form) return;
    const data = this.getData();
    const centro = data.ubicacion?.centro;

    if (!centro?.lat || !centro?.lng) {
      this.helper.notifWarn('Dibuja el lote en el mapa antes de consultar el suelo INTA.');
      this.tabValue = 1;
      return;
    }

    this.sueloIntaLoading = true;
    try {
      const info = await this.service.sueloInta(centro.lat, centro.lng);
      this.sueloIntaInfo = info;

      if (!info?.encontrado || !info?.sugerencias) {
        this.helper.notifWarn(info?.mensaje || 'INTA no devolvio datos para esta ubicacion.');
        return;
      }

      const sugerencias = info.sugerencias;
      const patch: Record<string, any> = {};
      for (const key of [
        'capacidadDeCampo',
        'puntoMarchitez',
        'texturaLixiviacion',
        'texturaEscorrentia',
        'drenajeNaturalLixiviacion',
        'drenajeNaturalEscorrentia',
        'erosionEscorrentiaPendiente',
      ]) {
        if (sugerencias[key] !== undefined && sugerencias[key] !== null) {
          patch[key] = sugerencias[key];
        }
      }
      this.form.patchValue(patch);

      if (sugerencias.suelos?.length) {
        this.suelos.clear();
        for (const suelo of sugerencias.suelos) {
          this.suelos.push(this.agregarSueloFormGroup(suelo));
        }
      }

      this.helper.notifSuccess('Suelo INTA aplicado. Podes ajustar los valores antes de guardar.');
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.sueloIntaLoading = false;
    }
  }

  // ACCIONES

  private getData() {
    const data: ICreateLote = this.form?.value;
    if (data.ubicacion?.geojson) {
      const centro = this.helper.calcularCentroide(data.ubicacion.geojson);
      data.ubicacion.centro = { lat: centro[1], lng: centro[0] };
      data.ubicacion.superficie = this.helper.calcularAreaHectareas(data.ubicacion.geojson);
    }
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.lote?._id) {
        await this.service.editar(this.lote._id, data);

         // Solo actualiza el item en cache
        this.listado.patchEntityItem('lotes', {
          _id: this.lote._id,
          ...data,
        });
        
        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('lotes', created);

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

  // LISTADOS

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
  private async listarDepartamentos(): Promise<void> {
    const populate: IPopulate = {
      path: 'provincia',
      select: 'nombre',
    };
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.departamentos$?.unsubscribe();
    this.departamentos$ = this.listado
      .subscribe<IListado<IDepartamento>>('departamentos', queryParams)
      .subscribe(async (data) => {
        this.departamentos = data.datos;
        console.log(`listado de departamentos`, data);
      });
    await this.listado.getLastValue('departamentos', queryParams);
  }
  private async listarSondasSuelo(): Promise<void> {
    const filter: IFilter<IEstacion> = {
      'meta.soilTemp': { $exists: true },
      'meta.volumetricAverage': { $exists: true },
    } as any;
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      select: 'name.custom position.geo',
      sort: 'name.custom',
    };
    this.sondasSuelo$?.unsubscribe();
    this.sondasSuelo$ = this.listado.subscribe<IListado<IEstacion>>('estaciones', query).subscribe((data) => {
      this.sondasSuelo = data.datos;
      console.log(`listado de sondas de suelo`, data);
    });
    await this.listado.getLastValue('estaciones', query);
  }
  private async listarDispositivos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      select: 'nombre tipo deveui',
    };

    this.dispositivos$?.unsubscribe();
    this.dispositivos$ = this.listado
      .subscribe<IListado<IDispositivo>>('dispositivos', queryParams)
      .subscribe(async (data) => {
        this.dispositivos = data.datos;
        console.log(`listado de dispositivos`, data);
      });
    await this.listado.getLastValue('dispositivos', queryParams);
  }

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.lote = this.paramsService.get('editLote');
    const datosKMZ: {
      coords: any;
      nombre: string;
    } = this.paramsService.get('loteDesdeKMZ') as {
      coords: ICoordenadas[];
      nombre: string;
    };
    if (datosKMZ) {
      console.log('datosKMZ', datosKMZ);

      this.lote = {
        nombre: datosKMZ.nombre,
        ubicacion: {
          geojson: {
            type: 'Polygon',
            coordinates: datosKMZ.coords,
          },
        },
      };
      this.paramsService.set('loteDesdeKMZ', null);
    }

    this.titulo = this.lote ? () => this.translate.instant(`Editar lote`) : () => this.translate.instant('Crear lote');
    this.createForm();
    await Promise.all([
      this.listarEstablecimientos(),
      this.listarDepartamentos(),
      this.listarSondasSuelo(),
      this.listarDispositivos(),
    ]);
    this.cambioSondaSuelo();
    this.loading = false;
    console.log('form', this.form?.value);
  }
}
