import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  ICoordenadas,
  IDispositivo,
  IEstablecimiento,
  IFilter,
  IListado,
  IQueryParam,
  IUpdateDispositivo,
} from 'modelos/src';
import { Coordinate } from 'ol/coordinate';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { DispositivoService } from '../../http/dispositivos.service';
import { HelperService } from '../../servicios/helper';
import { ListadosService } from '../../servicios/listados';
import { OpenLayersService } from '../../servicios/openLayers.service';
import { SharedModule } from '../../shared.module';
import { MapaUbicacionComponent } from './mapa-ubicacion/mapa-ubicacion.component';

@Component({
  selector: 'app-ubicar',
  imports: [SharedModule, MapaUbicacionComponent],
  templateUrl: './ubicar.component.html',
  styleUrl: './ubicar.component.scss',
})
export class UbicarComponent implements OnInit, OnDestroy {
  @Input() dispositivo?: IDispositivo;
  public loading: boolean = false;
  public visible: boolean = false;
  private update: IUpdateDispositivo = {
    geojson: { type: 'Point' },
  };
  public disabled: boolean = true;

  public establecimientos: IEstablecimiento[] = [];
  private establecimientos$?: Subscription;

  public centro?: ICoordenadas;
  public poligonos?: ICoordenadas[][];

  @ViewChild('mapaUbicacion') mapaUbicacion?: MapaUbicacionComponent;

  constructor(
    private service: DispositivoService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private helper: HelperService,
    private listados: ListadosService
  ) {}

  public showDialog() {
    this.calcularCentro(); // Calcular centro antes de mostrar el diálogo
    this.visible = true;
    this.mapaUbicacion?.resetarYLimpiar();
    this.mapaUbicacion?.inicializarMapa();
  }

  public onCoordenadasChange(coordenadas: Coordinate) {
    const coordenada = OpenLayersService.coordinateToCoordenada(coordenadas);
    if (!coordenada) {
      return;
    }
    this.update.geojson = {
      type: 'Point',
      coordinates: [coordenada.lng, coordenada.lat],
    };
    this.disabled = false;
  }

  public onSave() {
    try {
      // Guardo la ubicacion
      console.log('Guardando ubicación del dispositivo', this.dispositivo);
      this.confirmationService.confirm({
        // target: event.target as EventTarget,
        header: this.translate.instant('Por favor, confirme la acción'),
        message: this.translate.instant('¿Desea ubicar el dispositivo?'),
        closable: true,
        closeOnEscape: true,
        icon: 'pi pi-exclamation-triangle',
        rejectButtonProps: {
          label: this.translate.instant('Cancelar'),
          severity: 'secondary',
          outlined: true,
        },
        acceptButtonProps: {
          label: this.translate.instant('Aceptar'),
        },
        accept: async () => {
          this.loading = true;
          try {
            await this.service.update(this.dispositivo?._id!, this.update);
            this.helper.notifSuccess(this.translate.instant('Ubicado correctamente'));
          } catch (error) {
            this.helper.notifError(error);
          }
          this.loading = false;
          this.visible = false;
        },
      });
    } catch (error) {
      console.error('Error al guardar la ubicación:', error);
      this.helper.notifError(this.translate.instant('Error al guardar la ubicación'));
    }
  }

  public onCancel() {
    this.visible = false;
  }

  // Listados

  private async listarEstablecimientos(): Promise<void> {
    const filter: IFilter<IEstablecimiento> = {
      idProductor: this.dispositivo?.idProductor,
    };
    const queryParams: IQueryParam = {
      filter: JSON.stringify(filter),
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.establecimientos$?.unsubscribe();
    this.establecimientos$ = this.listados
      .subscribe<IListado<IEstablecimiento>>('establecimientos', queryParams)
      .subscribe(async (data) => {
        this.establecimientos = data.datos;
        // 1. Prepara los polígonos ahora que tienes los datos.
        this.prepPoligonos();

        // 2. Calcula el centro del mapa.
        this.calcularCentro();
      });
    await this.listados.getLastValue('establecimientos', queryParams);
  }

  // Aux

  private prepPoligonos() {
    if (!this.establecimientos || this.establecimientos.length === 0) {
      console.warn('No hay establecimientos para procesar polígonos.');
      return;
    }
    this.poligonos = [];
    for (const e of this.establecimientos) {
      if (!e.ubicacion || e.ubicacion.length === 0) {
        console.warn(`Establecimiento ${e.nombre} no tiene ubicación definida.`);
        continue;
      }
      for (const u of e.ubicacion) {
        const geojson = u.geojson;
        if (!geojson || geojson.type !== 'Polygon' || !geojson.coordinates) {
          console.warn(`GeoJSON inválido para ${e.nombre}:`, geojson);
          continue;
        }
        const poligono = OpenLayersService.geoJSONToCoordenadas(geojson);
        if (poligono.length > 0) {
          this.poligonos.push(poligono);
        } else {
          console.warn(`Polígono vacío para ${e.nombre}.`);
        }
      }
    }
  }

  private calcularCentro() {
    if (this.dispositivo?.geojson?.coordinates?.length === 2) {
      this.centro = {
        lat: this.dispositivo.geojson.coordinates[1],
        lng: this.dispositivo.geojson.coordinates[0],
      };
    } else if (this.establecimientos?.[0]?.ubicacion?.[0]?.centro) {
      // Usa el centro del primer establecimiento si el dispositivo no tiene coordenadas
      this.centro = this.establecimientos[0].ubicacion[0].centro;
    } else {
      // Si no hay nada, el centro queda indefinido
      this.centro = undefined;
    }
  }

  /// Hooks

  async ngOnInit() {
    this.loading = true;
    await this.listarEstablecimientos(); // Esto ahora se encarga de todo
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.establecimientos$?.unsubscribe();
  }
}
