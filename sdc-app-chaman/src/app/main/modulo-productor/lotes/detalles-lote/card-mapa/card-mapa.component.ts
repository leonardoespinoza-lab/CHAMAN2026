import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { IGeoJSONPolygon } from 'modelos/src';
import { Feature, Map, View } from 'ol';
import { Polygon } from 'ol/geom';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { OSM, Vector } from 'ol/source';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { IDetallesLote } from '../detalles-lote.component';

@Component({
  selector: 'app-card-mapa',
  imports: [CommonModule],
  templateUrl: './card-mapa.component.html',
  styleUrl: './card-mapa.component.scss',
})
export class CardMapaComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() public lote?: IDetallesLote;
  @ViewChild('mapContainer', { static: true }) private mapContainer?: ElementRef<HTMLElement>;
  public map?: Map;

  constructor(public helper: HelperService) {}

  private initMap() {
    if (this.lote?.ubicacion?.centro && this.mapContainer?.nativeElement) {
      this.map = new Map({
        target: this.mapContainer.nativeElement,
        controls: [],
        interactions: [],
        view: new View({
          center: [this.lote.ubicacion.centro.lng, this.lote.ubicacion.centro.lat],
          zoom: 10,
          projection: 'EPSG:4326',
        }),
        layers: [
          new TileLayer({
            source: new OSM({
              url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              attributions: '',
              maxZoom: 15,
            }),
          }),
          new VectorLayer({
            source: new Vector(),
          }),
        ],
      });
    }
  }

  private addPolygon() {
    const geojson = this.lote?.ubicacion?.geojson as IGeoJSONPolygon;
    if (!geojson?.coordinates) return;
    const vectorLayer = this.map?.getLayers().getArray()[1] as VectorLayer;
    const source = vectorLayer.getSource();
    const polygon = new Polygon(geojson.coordinates);
    const feature = new Feature(polygon);
    // Estilo del poligono
    let color = 'rgba(255, 255, 255, 0.6)';

    const style = new Style({
      stroke: new Stroke({
        color: this.helper.darkTheme ? '#000' : '#FFF',
        width: 1,
      }),
      fill: new Fill({
        color,
      }),
      // text: new Text({
      //   text: lote.nombre,
      //   font: 'bold 14px lato',
      // }),
    });
    feature.setStyle(style);
    source?.addFeature(feature);
  }

  private setBounds() {
    const vectorLayer = this.map?.getLayers().getArray()[1] as VectorLayer;
    const source = vectorLayer.getSource();
    const extent = source?.getExtent();
    if (!extent) return;
    // Los extent pueden existir sin coordenadas, por lo que hay que comprobar si son Infinity o -Infinity
    if (extent[0] === Infinity) return;
    if (extent[1] === Infinity) return;
    if (extent[2] === -Infinity) return;
    if (extent[3] === -Infinity) return;
    this.map?.getView().fit(extent, { padding: [150, 150, 150, 150], duration: 1000 });
  }

  async ngOnInit(): Promise<void> {}

  async ngAfterViewInit(): Promise<void> {
    this.initMap();
    this.addPolygon();
    this.setBounds();
  }

  ngOnDestroy(): void {
    if (!this.map) return;
    this.map.setTarget(undefined);
    this.map.dispose();
    this.map = undefined;
  }
}
