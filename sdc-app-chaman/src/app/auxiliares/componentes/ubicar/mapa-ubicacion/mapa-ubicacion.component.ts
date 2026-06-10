import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ICoordenadas } from 'modelos/src';
import { Feature, Map, View } from 'ol';
import { Coordinate } from 'ol/coordinate';
import { getCenter } from 'ol/extent';
import { Geometry, Point, Polygon } from 'ol/geom';
import { Modify } from 'ol/interaction';
import { HelperService } from '../../../servicios/helper';
import { OpenLayersService } from '../../../servicios/openLayers.service';
import { SharedModule } from '../../../shared.module';

@Component({
  selector: 'app-mapa-ubicacion',
  imports: [SharedModule],
  templateUrl: './mapa-ubicacion.component.html',
  styleUrl: './mapa-ubicacion.component.scss',
})
export class MapaUbicacionComponent implements OnInit {
  public mapId = `mapa-ubicacion-${Math.random().toString(36).substring(2, 15)}`;
  public loading = false;
  @Input() centro?: ICoordenadas;
  @Input() poligonos?: ICoordenadas[][];
  @Output() coordenadas: EventEmitter<Coordinate> = new EventEmitter();
  private coordinate?: Coordinate;
  private map?: Map;
  private pinsLayer = OpenLayersService.pointsSVGVectorLayer();
  private polygonsLayer = OpenLayersService.polygonsVectorLayer();

  constructor(private helper: HelperService) {}

  public resetarYLimpiar() {
    console.log('Limpiando estado del mapa anterior...');
    if (this.map) {
      // Esto es muy importante para liberar la memoria y los recursos del mapa anterior
      this.map.setTarget(undefined);
      this.map = undefined;
    }
    // Limpiamos las capas para que no contengan los 'features' de la carga anterior
    this.pinsLayer.getSource()?.clear();
    this.polygonsLayer.getSource()?.clear();
    // Reseteamos las variables de estado
    this.coordinate = undefined;
  }

  public async inicializarMapa() {
    this.loading = true;
    this.coordinate = await this.calcularCoordinate();

    // Pequeña demora para asegurar que el DOM está listo
    setTimeout(() => {
      const maxZoomSatellite = this.helper.isHandset ? 15 : 19;
      const zoom = this.helper.isHandset ? 16 : 18;

      this.map = new Map({
        interactions: OpenLayersService.interactions(),
        target: this.mapId,
        controls: [],
        layers: [
          OpenLayersService.mapTileSatelite(maxZoomSatellite),
          OpenLayersService.mapReferenciasPoliticas(),
          this.pinsLayer,
          this.polygonsLayer,
        ],
        view: new View({
          center: this.coordinate,
          zoom,
        }),
      });
      this.addPin();
      this.addPoligons();
      this.modify();
      if (this.poligonos && this.poligonos.length > 0) {
        // Si hay polígonos ponemos la vista ahí
        const ext = this.polygonsLayer.getSource()?.getExtent();
        if (ext) {
          this.map?.getView().fit(ext, {
            size: this.map.getSize(),
            maxZoom: zoom,
          });
        }
      }
      this.loading = false;
    }, 100); // 50ms es usualmente suficiente
  }

  private async calcularCoordinate(): Promise<Coordinate> {
    // Orden de Importancia:
    // 1. Coordenadas del dispositivo (si están definidas en `centro`)
    if (this.centro?.lat && this.centro?.lng) {
      return OpenLayersService.lonLatToCoordinate(this.centro.lng, this.centro.lat);
    }

    // 2. Centro de los polígonos (si existen)
    if (this.poligonos && this.poligonos.length > 0) {
      const tempSource = OpenLayersService.polygonsVectorLayer().getSource();
      if (tempSource) {
        this.poligonos.forEach((polygon) => {
          const coordinates = polygon.map((coord) => OpenLayersService.lonLatToCoordinate(coord.lng, coord.lat));
          const feature = new Feature({ geometry: new Polygon([coordinates]) });
          tempSource.addFeature(feature);
        });
        const extent = tempSource.getExtent();
        // Comprobamos que el extent sea un array de números válidos
        if (extent && extent.every(isFinite)) {
          return getCenter(extent);
        }
      }
    }

    // 3. Coordenadas actuales del usuario (como última opción)
    return await OpenLayersService.getCurrentPosition();
  }

  private addPin() {
    if (!this.map) return;
    if (!this.coordinate) return;
    const source = this.pinsLayer.getSource();
    if (!source) return;
    source.clear();
    const feature: Feature<Geometry> = new Feature({
      geometry: new Point(this.coordinate),
    });
    source.addFeature(feature);
  }

  private addPoligons() {
    if (!this.map) return;
    if (!this.poligonos) return;
    const source = this.polygonsLayer.getSource();
    if (!source) return;
    source.clear();
    this.poligonos.forEach((polygon) => {
      const coordinates = polygon.map((coord) => OpenLayersService.lonLatToCoordinate(coord.lng, coord.lat));
      const feature: Feature<Geometry> = new Feature({
        geometry: new Polygon([coordinates]),
      });
      source.addFeature(feature);
    });
  }

  private modify() {
    const target = document.getElementById(this.mapId);
    const source = this.pinsLayer.getSource();
    if (!source) return;
    const modify = new Modify({
      hitDetection: this.pinsLayer,
      source,
    });
    modify.on(['modifystart', 'modifyend'], function (evt) {
      target!.style.cursor = evt.type === 'modifystart' ? 'grabbing' : 'pointer';
    });
    modify.on('modifyend', (evt) => {
      const feature = evt.features.getArray()[0];
      if (feature) {
        const geometry = feature.getGeometry() as Point;
        const coordinates = geometry.getCoordinates();
        this.coordinate = coordinates;
        this.coordenadas.emit(coordinates);
      }
    });
    const overlaySource = modify.getOverlay().getSource();
    overlaySource?.on(
      ['addfeature', 'removefeature'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function (evt: { type: any }) {
        target!.style.cursor = evt.type === 'addfeature' ? 'pointer' : '';
      }
    );
    this.map?.addInteraction(modify);
  }

  private panTo(coordinate: Coordinate) {
    if (!this.map) return;
    this.map.getView().animate({
      center: coordinate,
      duration: 1000,
      zoom: this.helper.isHandset ? 16 : 18,
    });
  }

  ngOnInit(): void {}
}
