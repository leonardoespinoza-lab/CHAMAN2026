/* eslint-disable @typescript-eslint/no-explicit-any */
import { AfterViewInit, Component, EventEmitter, Input, Output, SimpleChanges } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { IGeoJSONCircle, IGeoJSONLineString, IGeoJSONMultiPolygon, IGeoJSONPoint, IGeoJSONPolygon } from 'modelos/src';
import { Feature, Map, View } from 'ol';
import { Circle, Geometry, LineString, MultiPolygon, Point, Polygon } from 'ol/geom';
import { Modify, Snap } from 'ol/interaction';
import Draw from 'ol/interaction/Draw';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { OSM, Vector, XYZ } from 'ol/source';
import VectorSource from 'ol/source/Vector';
import { FlatStyle } from 'ol/style/flat';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import { HelperService } from '../../servicios/helper';
import { SharedModule } from '../../shared.module';

@Component({
  selector: 'app-map-draw',
  imports: [SharedModule],
  templateUrl: './map-draw.component.html',
  styleUrl: './map-draw.component.scss',
})
export class MapDrawComponent implements AfterViewInit {
  private currentPosition?: IGeoJSONPoint;
  private modificacionLocal = false;
  @Input() formGeojson?: FormGroup;
  @Input() centrarA?: IGeoJSONPoint;
  @Input() public tipo?: 'Point' | 'LineString' | 'Polygon' | 'Circle' | 'MultiPolygon';
  @Input() public color?: string = '#000000';
  @Input() public herramientasPosicion: 'izquierda' | 'derecha' = 'izquierda';

  @Input() public point?: IGeoJSONPoint;
  @Output() public pointChange = new EventEmitter<IGeoJSONPoint>();
  @Input() public lineString?: IGeoJSONLineString;
  @Output() public lineStringChange = new EventEmitter<IGeoJSONLineString>();
  @Input() public polygon?: IGeoJSONPolygon;
  @Output() public polygonChange = new EventEmitter<IGeoJSONPolygon>();
  @Input() public circle?: IGeoJSONCircle;
  @Output() public circleChange = new EventEmitter<IGeoJSONCircle>();
  @Input() public multiPolygon?: IGeoJSONMultiPolygon;
  @Output() public multiPolygonChange = new EventEmitter<IGeoJSONMultiPolygon>();

  @Input() public readOnlyPolygons?: IGeoJSONPolygon[];

  public s: FlatStyle = {
    'fill-color': 'rgba(255, 255, 255, 0.2)',
    'stroke-color': '#ffcc33',
    'stroke-width': 2,
    'circle-radius': 7,
    'circle-fill-color': '#ffcc33',
    'circle-stroke-color': '#fff',
  };

  public draw?: Draw;
  public snap?: Snap;
  public modify?: Modify;
  public dibujando = false;

  private map?: Map;

  get editando(): boolean {
    return (
      !!this.point?.coordinates ||
      !!this.lineString?.coordinates ||
      !!this.polygon?.coordinates ||
      !!this.circle?.coordinates ||
      !!this.multiPolygon?.coordinates
    );
  }

  get drawLayer(): VectorLayer | undefined {
    return this.map?.getLayers().getArray()[3] as VectorLayer;
  }
  get drawSource(): VectorSource | undefined {
    return this.drawLayer?.getSource() as VectorSource;
  }

  get readOnlyLayer(): VectorLayer {
    return this.map?.getLayers().getArray()[2] as VectorLayer;
  }

  constructor(private helper: HelperService) {}

  private suscribePointChange() {
    this.pointChange.subscribe((point) => {
      if (this.formGeojson) {
        this.formGeojson.get('type')?.setValue('Point');
        this.formGeojson.get('coordinates')?.setValue(point.coordinates);
        this.formGeojson.get('radius')?.setValue(null);
      }
    });
  }
  private suscribeLineStringChange() {
    this.lineStringChange.subscribe((lineString) => {
      if (this.formGeojson) {
        this.formGeojson.get('type')?.setValue('LineString');
        this.formGeojson.get('coordinates')?.setValue(lineString.coordinates);
        this.formGeojson.get('radius')?.setValue(null);
      }
    });
  }
  private suscribePolygonChange() {
    this.polygonChange.subscribe((polygon) => {
      if (this.formGeojson) {
        this.formGeojson.get('type')?.setValue('Polygon');
        this.formGeojson.get('coordinates')?.setValue(polygon.coordinates);
        this.formGeojson.get('radius')?.setValue(null);
      }
    });
  }
  private suscribeCircleChange() {
    this.circleChange.subscribe((circle) => {
      if (this.formGeojson) {
        this.formGeojson.get('type')?.setValue('Point');
        this.formGeojson.get('coordinates')?.setValue(circle.coordinates);
        this.formGeojson.get('radius')?.setValue(circle.radius);
      }
    });
  }
  private suscribeMultiPolygonChange() {
    this.multiPolygonChange.subscribe((multiPolygon) => {
      if (this.formGeojson) {
        this.formGeojson.get('type')?.setValue('MultiPolygon');
        this.formGeojson.get('coordinates')?.setValue(multiPolygon.coordinates);
        this.formGeojson.get('radius')?.setValue(null);
      }
    });
  }

  private async initMap(): Promise<void> {
    const maxZoomSatellite = this.helper.isHandset ? 15 : 19;
    const zoom = this.helper.isHandset ? 13 : 15;

    this.map = new Map({
      target: 'map-draw',
      controls: [],
      layers: [
        new TileLayer({
          source: new OSM({
            url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attributions: '',
            maxZoom: maxZoomSatellite,
          }),
        }),
        new TileLayer({
          source: new XYZ({
            url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            attributions: '',
            maxZoom: 19,
          }),
        }),
        new VectorLayer({
          source: new Vector(),
        }),
        new VectorLayer({
          source: new VectorSource({ wrapX: false }),
        }),
      ],
      view: new View({
        center: this.currentPosition?.coordinates,
        zoom,
        projection: 'EPSG:4326',
      }),
    });

    if (this.color) {
      this.s = {
        'fill-color': HelperService.hexToRgba(this.color, 0.2),
        'stroke-color': this.color,
        'stroke-width': 2,
        'circle-radius': 5,
        'circle-fill-color': this.color,
      };
      this.drawLayer?.setStyle(this.s);
    }
  }

  private handleModify() {
    //
    this.snap = new Snap({
      source: this.drawSource,
    });

    this.modify = new Modify({
      source: this.drawSource,
    });

    this.map?.addInteraction(this.snap);
    this.map?.addInteraction(this.modify);

    this.handleDrawEnd();
    this.handleModifyEnd();
  }

  public async dibujar() {
    if (this.dibujando) return;

    // Editando
    if (this.editando) {
      // Tengo que elegir que estoy dibujando
      switch (this.tipo) {
        case 'Point':
        case 'Polygon':
        case 'Circle':
        case 'LineString': {
          this.map?.addInteraction(this.snap!);
          this.map?.addInteraction(this.modify!);
          break;
        }
        case 'MultiPolygon': {
          this.map?.addInteraction(this.draw!);
          this.map?.addInteraction(this.snap!);
          this.map?.addInteraction(this.modify!);
          break;
        }
        default: {
          this.helper.notifError('Tipo de geometría no soportado');
          return;
        }
      }
    } else {
      this.map?.addInteraction(this.draw!);
    }
    this.dibujando = true;
    this.setBounds();
  }

  private handleDrawEnd() {
    this.draw?.on('drawend', (event) => {
      this.modificacionLocal = true;
      switch (this.tipo) {
        case 'Point': {
          const p = event?.feature.getGeometry() as Point;
          if (!p) return;
          const point = p.getCoordinates() as [number, number];
          this.point!.coordinates = point;
          this.pointChange.emit(this.point);
          break;
        }
        case 'Polygon': {
          const p = event?.feature.getGeometry() as Polygon;
          if (!p) return;
          const coords = p.getCoordinates() as [[number, number][]];
          this.polygon!.coordinates = coords;
          this.polygonChange.emit(this.polygon);
          break;
        }
        case 'Circle': {
          const c = event?.feature.getGeometry() as Circle;
          if (!c) break;
          const coordinates = c.getCenter() as [number, number];
          const radius = c.getRadius();
          this.circle = { coordinates, radius, type: 'Point' };
          this.circleChange.emit(this.circle);
          break;
        }
        case 'LineString': {
          const l = event?.feature.getGeometry() as LineString;
          if (!l) break;
          const coords = l.getCoordinates() as [number, number][];
          this.lineString!.coordinates = coords;
          this.lineStringChange.emit(this.lineString);
          break;
        }
        case 'MultiPolygon': {
          const multiPolygon: IGeoJSONMultiPolygon = {
            type: 'MultiPolygon',
            coordinates: [],
          };

          // Desde el evento
          const geometryEvent = event?.feature.getGeometry() as MultiPolygon;
          const coordsEvent = geometryEvent.getCoordinates() as number[][][][];
          if (!coordsEvent) break;
          for (const coord of coordsEvent) {
            multiPolygon.coordinates!.push(coord);
          }

          // Desde el source
          const features = this.drawSource?.getFeatures();
          if (!features) break;
          for (const feature of features) {
            const geometry = feature?.getGeometry() as MultiPolygon;
            const coords = geometry?.getCoordinates() as number[][][][];
            if (!coords) continue;
            for (const coord of coords) {
              multiPolygon.coordinates!.push(coord);
            }
          }

          //
          this.multiPolygon = multiPolygon;
          this.multiPolygonChange.emit(this.multiPolygon);
          break;
        }
        default: {
          this.helper.notifError('Tipo de geometría no soportado');
          break;
        }
      }
      this.desactivarModoEdicion();
    });
  }

  private handleModifyEnd() {
    this.modify?.on('modifyend', (event) => {
      this.modificacionLocal = true;
      switch (this.tipo) {
        case 'Point': {
          const l = event?.features?.getArray()[0]?.getGeometry() as Point;
          if (!l) return;
          const point = l.getCoordinates() as [number, number];
          this.point!.coordinates = point;
          this.pointChange.emit(this.point);
          break;
        }
        case 'Polygon': {
          const l = event?.features?.getArray()[0]?.getGeometry() as Polygon;
          if (!l) return;
          const coords = l.getCoordinates() as [[number, number][]];
          this.polygon!.coordinates = coords;
          this.polygonChange.emit(this.polygon);
          break;
        }
        case 'Circle': {
          const l = event?.features?.getArray()[0]?.getGeometry() as Circle;
          if (!l) return;
          const coordinates = l.getCenter() as [number, number];
          const radius = l.getRadius();
          this.circle = { coordinates, radius, type: 'Point' };
          this.circleChange.emit(this.circle);
          return;
        }
        case 'LineString': {
          const l = event?.features?.getArray()[0]?.getGeometry() as LineString;
          if (!l) return;
          const coords = l.getCoordinates() as [number, number][];
          this.lineString!.coordinates = coords;
          this.lineStringChange.emit(this.lineString);
          return;
        }
        case 'MultiPolygon': {
          const multiPolygon: IGeoJSONMultiPolygon = {
            type: 'MultiPolygon',
            coordinates: [],
          };

          const source = this.drawSource;
          const features = source?.getFeatures();
          if (!features) return;

          for (const feature of features) {
            const geometry = feature?.getGeometry() as any;
            if (!geometry) continue;

            const coords = geometry?.getCoordinates() as number[][][][];
            for (const coord of coords) {
              multiPolygon.coordinates!.push(coord);
            }
          }

          this.multiPolygon = multiPolygon;
          this.multiPolygonChange.emit(this.multiPolygon);
          return;
        }

        default: {
          this.helper.notifError('Tipo de geometría no soportado');
          return;
        }
      }
    });
  }

  public async desactivarModoEdicion() {
    this.map?.removeInteraction(this.draw!);
    this.map?.removeInteraction(this.modify!);
    this.map?.removeInteraction(this.snap!);
    this.dibujando = false;
  }

  public borrarDibujos() {
    this.drawSource?.clear();
    this.point = { type: 'Point', coordinates: undefined };
    this.lineString = { type: 'LineString', coordinates: undefined };
    this.polygon = { type: 'Polygon', coordinates: undefined };
    this.circle = { type: 'Point', coordinates: undefined, radius: undefined };
    this.multiPolygon = { type: 'MultiPolygon', coordinates: undefined };
    this.pointChange.emit(this.point);
    this.lineStringChange.emit(this.lineString);
    this.polygonChange.emit(this.polygon);
    this.circleChange.emit(this.circle);
    this.multiPolygonChange.emit(this.multiPolygon);
    this.desactivarModoEdicion();
  }

  private panTo(coordinates: [number, number]) {
    if (!this.map) return;
    this.map.getView().animate({ center: coordinates, duration: 1000, zoom: 18 });
  }

  private updatePunto() {
    if (this.modificacionLocal) {
      this.modificacionLocal = false;
      return;
    }
    this.drawSource?.clear();
    this.prepararVariablesForm();
    this.desactivarModoEdicion();
    this.dibujar();
  }

  private prepararVariablesForm() {
    switch (this.tipo) {
      case 'Point': {
        this.point = this.formGeojson?.getRawValue();
        break;
      }
      case 'Circle': {
        this.circle = this.formGeojson?.getRawValue();
        break;
      }
      case 'Polygon': {
        this.polygon = this.formGeojson?.getRawValue();
        break;
      }
      default: {
        break;
      }
    }
  }

  private prepararVariables() {
    const coordinates = this.formGeojson?.get('coordinates')?.value;
    switch (this.tipo) {
      case 'Point': {
        this.point = this.point || { type: 'Point', coordinates };
        break;
      }
      case 'LineString': {
        this.lineString = this.lineString || {
          type: 'LineString',
          coordinates,
        };
        break;
      }
      case 'Polygon': {
        this.polygon = this.polygon || { type: 'Polygon', coordinates };
        break;
      }
      case 'Circle': {
        const radius = this.formGeojson?.get('radius')?.value;
        this.circle = this.circle || {
          type: 'Point',
          coordinates,
          radius,
        };
        break;
      }
      case 'MultiPolygon': {
        this.multiPolygon = this.multiPolygon || {
          type: 'MultiPolygon',
          coordinates,
        };
        break;
      }
      default: {
        this.helper.notifError('Tipo de geometría no soportado');
        break;
      }
    }
  }

  private agregarFigurasInicialesEditables() {
    if (!this.editando) return;

    // Tengo que elegir que estoy dibujando
    switch (this.tipo) {
      case 'Point': {
        const feature: Feature<Geometry> = new Feature({
          geometry: new Point(this.point?.coordinates!),
        });
        this.drawSource?.addFeature(feature);
        break;
      }
      case 'Polygon': {
        const feature: Feature<Geometry> = new Feature({
          geometry: new Polygon(this.polygon?.coordinates!),
        });
        const s = new Style({
          stroke: new Stroke({
            color: this.color,
            width: 4,
          }),
        });
        feature.setStyle(s);
        this.drawSource?.addFeature(feature);
        break;
      }
      case 'Circle': {
        const feature: Feature<Geometry> = new Feature({
          geometry: new Circle(this.circle?.coordinates!, this.circle?.radius),
        });
        const s = new Style({
          stroke: new Stroke({
            color: this.color,
            width: 4,
          }),
        });
        feature.setStyle(s);
        this.drawSource?.addFeature(feature);
        break;
      }
      case 'LineString': {
        const feature: Feature<Geometry> = new Feature({
          geometry: new LineString(this.lineString?.coordinates!),
        });
        const s = new Style({
          stroke: new Stroke({
            color: this.color,
            width: 4,
          }),
        });
        feature.setStyle(s);
        this.drawSource?.addFeature(feature);
        break;
      }
      case 'MultiPolygon': {
        const feature: Feature<Geometry> = new Feature({
          geometry: new MultiPolygon(this.multiPolygon?.coordinates!),
        });
        const s = new Style({
          stroke: new Stroke({
            color: this.color,
            width: 4,
          }),
        });
        feature.setStyle(s);
        this.drawSource?.addFeature(feature);
        break;
      }
      default: {
        this.helper.notifError('Tipo de geometría no soportado');
        return;
      }
    }
  }

  private async addReadOnlyPolygons() {
    if (!this.readOnlyPolygons) return;
    const source = this.readOnlyLayer.getSource();
    if (!source) return;
    for (const polygon of this.readOnlyPolygons) {
      const feature = new Feature({
        geometry: new Polygon(polygon.coordinates!),
      });
      source.addFeature(feature);
    }
    this.setBounds();
  }

  private setBounds() {
    // Si hay figuras de solo lectura ajusta la vista a estas
    const readOnlySource = this.readOnlyLayer.getSource();
    const readOnlyExtent = readOnlySource?.getExtent();
    if (!readOnlyExtent) return;
    if (readOnlySource?.getFeatures().length) {
      this.map?.getView().fit(readOnlyExtent, { padding: [50, 50, 50, 50] });
    }

    // Ajusta la vista a la figura editable
    const drawSource = this.drawLayer?.getSource();
    const drawExtent = drawSource?.getExtent();
    if (!drawExtent) return;
    if (drawSource?.getFeatures().length) {
      if (drawExtent[0] !== Infinity) {
        this.map?.getView().fit(drawExtent, { padding: [50, 50, 50, 50] });
      }
    }
  }

  private initDraw() {
    this.draw = new Draw({
      source: this.drawSource!,
      type: this.tipo!,
      style: this.s,
    });
  }

  async ngAfterViewInit(): Promise<void> {
    this.currentPosition = await this.helper.getCurrentPosition();
    await this.initMap();
    this.initDraw();
    this.handleModify();

    this.suscribePointChange();
    this.suscribeLineStringChange();
    this.suscribePolygonChange();
    this.suscribeCircleChange();
    this.suscribeMultiPolygonChange();

    this.prepararVariables();
    this.agregarFigurasInicialesEditables();
    this.addReadOnlyPolygons();
    this.dibujar();

    this.formGeojson?.get('coordinates')?.valueChanges.subscribe(() => {
      this.updatePunto();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['color']?.currentValue !== changes['color']?.previousValue) {
      this.s = {
        'fill-color': HelperService.hexToRgba(this.color!, 0.2),
        'stroke-color': this.color,
        'stroke-width': 2,
        'circle-radius': 5,
        'circle-fill-color': this.color,
      };
      this.drawLayer?.setStyle(this.s);
    }

    if (changes['centrarA']?.currentValue) {
      this.panTo(this.centrarA?.coordinates!);
      // Si se está dibujando un punto o un circulo se dibuja en la posicion recibida
      if (this.tipo === 'Point') {
        this.borrarDibujos();
        this.prepararVariables();
        this.point!.coordinates = this.centrarA?.coordinates;
        this.modificacionLocal = true;
        this.pointChange.emit(this.point);
        this.agregarFigurasInicialesEditables();
      }
      if (this.tipo === 'Circle') {
        this.borrarDibujos();
        this.prepararVariables();
        this.circle!.coordinates = this.centrarA?.coordinates;
        this.circle!.radius = 0.0005;
        this.modificacionLocal = true;
        this.circleChange.emit(this.circle);
        this.agregarFigurasInicialesEditables();
      }
    }

    if (changes['tipo'] && !changes['tipo']?.firstChange) {
      this.borrarDibujos();
      this.initDraw();
      this.handleModify();
      this.prepararVariables();
      this.agregarFigurasInicialesEditables();
      this.dibujar();
    }
  }
}
