import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  ICoordenadas,
  ICreateEstablecimiento,
  IEstablecimiento,
  IGeoJSONMultiPolygon,
  IGeoJSONPolygon,
  IUbicacion,
} from 'modelos/src';
import { MapDrawComponent } from '../../../../auxiliares/componentes/map-draw/map-draw.component';
import { EstablecimientoService } from '../../../../auxiliares/http/establecimiento.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ListadosService } from '../../../../auxiliares/servicios/listados';

@Component({
  selector: 'app-crear-editar-establecimientos',
  imports: [SharedModule, MapDrawComponent],
  templateUrl: './crear-editar-establecimientos.component.html',
  styleUrl: './crear-editar-establecimientos.component.scss',
})
export class CrearEditarEstablecimientosComponent {
  public loading = false;
  public establecimiento?: IEstablecimiento;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public multipolygon?: IGeoJSONMultiPolygon;

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: EstablecimientoService,
    private helper: HelperService,
    private listado: ListadosService,
  ) {}

  // FORMULARIO
  private initMultipolygon() {
    const mp: IGeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [],
    };
    if (this.establecimiento?.ubicacion?.length) {
      for (const u of this.establecimiento.ubicacion) {
        if (u.geojson?.coordinates) mp.coordinates?.push(u.geojson.coordinates);
      }
    }
    this.multipolygon = mp;
  }

  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.establecimiento?.nombre, Validators.required),
    });
  }

  public onMultipoligonChange(mp: IGeoJSONMultiPolygon) {
    const multi: IGeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [],
    };
    if (!mp.coordinates?.length) return;
    for (const p of mp.coordinates) {
      multi.coordinates?.push(p);
    }
    this.multipolygon = multi;
  }

  // ACCIONES

  private getData() {
    const data: ICreateEstablecimiento = this.form?.value;

    const ubicaciones: IUbicacion[] = [];
    if (this.multipolygon?.coordinates?.length) {
      for (const p of this.multipolygon.coordinates) {
        const geojson: IGeoJSONPolygon = {
          type: 'Polygon',
          coordinates: p as [[number, number][]],
        };
        const centro = this.helper.calcularCentroide(geojson);
        const ubicacion: IUbicacion = {
          geojson,
          centro: { lat: centro[1], lng: centro[0] },
          superficie: this.helper.calcularAreaHectareas(geojson),
        };
        ubicaciones.push(ubicacion);
      }
      data.ubicacion = ubicaciones;
    }
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.establecimiento?._id) {
        await this.service.editar(this.establecimiento._id, data);

        // Solo actualiza el item en cache
        this.listado.patchEntityItem('establecimientos', {
          _id: this.establecimiento._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('establecimientos', created);

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

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.establecimiento = this.paramsService.get('editEstablecimiento');
    const datosKMZ: {
      coords: any;
      nombre: string;
    } = this.paramsService.get('establecimientoDesdeKMZ') as {
      coords: ICoordenadas[];
      nombre: string;
    };
    if (datosKMZ) {
      console.log('datosKMZ', datosKMZ);
      const ubicaciones: IUbicacion[] = [
        {
          geojson: {
            type: 'Polygon',
            coordinates: datosKMZ.coords,
          },
        },
      ];

      this.establecimiento = {
        nombre: datosKMZ.nombre,
        ubicacion: ubicaciones,
      };
      this.paramsService.set('establecimientoDesdeKMZ', null);
    }
    if (this.establecimiento) {
      console.log('edit', this.establecimiento);
    }
    this.titulo = this.establecimiento
      ? () => this.translate.instant(`Editar establecimiento`)
      : () => this.translate.instant('Crear establecimiento');
    this.initMultipolygon();
    this.createForm();
    this.loading = false;
  }
}
