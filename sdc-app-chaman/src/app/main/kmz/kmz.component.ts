import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';
import { IGeoJSONPoint } from 'modelos/src';
import { Feature, Map, View } from 'ol';
import KML from 'ol/format/KML';
import { Point, Polygon } from 'ol/geom';
import { Select } from 'ol/interaction';
import TileLayer from 'ol/layer/Tile';
import { OSM, XYZ } from 'ol/source';
import { ConfirmationService } from 'primeng/api';
import { FileSelectEvent } from 'primeng/fileupload';
import { LoginService } from '../../auxiliares/http/login.service';
import { HelperService } from '../../auxiliares/servicios/helper';
import { OpenLayersService } from '../../auxiliares/servicios/openLayers.service';
import { ParamsService } from '../../auxiliares/servicios/params.service';
import { SharedModule } from '../../auxiliares/shared.module';
import { KMZService } from './kmz.service';

export interface featureItem {
  id: string;
  name: string;
  originalName?: string;
  type: 'Point' | 'LineString' | 'Polygon';
  visible: boolean;
  feature: Feature;
}

@Component({
  selector: 'app-kmz',
  imports: [SharedModule],
  templateUrl: './kmz.component.html',
  styleUrl: './kmz.component.scss',
})
export class KMZComponent implements OnInit {
  public map?: Map;
  private currentPosition?: IGeoJSONPoint;
  public file = false;

  public loading = signal(false);
  // Drawer
  public visible = true;
  // Layers
  public pointsLayer = OpenLayersService.pointsSVGVectorLayer();
  public listaPuntos: featureItem[] = [];
  public linesLayer = OpenLayersService.polylineVectorLayer();
  public listaLineas: featureItem[] = [];
  public polygonsLayer = OpenLayersService.polygonsVectorLayer();
  public listaPoligonos: featureItem[] = [];

  private selectInteraction = new Select();

  constructor(
    private translate: TranslateService,
    public helper: HelperService,
    private params: ParamsService,
    private confirmationService: ConfirmationService,
    private router: Router,
    public loginService: LoginService,
    private kmzService: KMZService
  ) {}

  private initMap() {
    const maxZoomSatellite = this.helper.isHandset ? 15 : 19;
    const zoom = this.helper.isHandset ? 14 : 15;

    this.map = new Map({
      target: 'kmz',
      controls: [],
      view: new View({
        center: this.currentPosition?.coordinates,
        zoom,
        projection: 'EPSG:4326',
      }),
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
        // Puntos
        this.pointsLayer,
        // Lineas,
        this.linesLayer,
        // Polígonos
        this.polygonsLayer,
      ],
    });
    this.map.addInteraction(this.selectInteraction);
  }

  public toggleLayer(layer: 'Puntos' | 'Lineas' | 'Poly') {
    switch (layer) {
      case 'Puntos':
        this.pointsLayer.setVisible(!this.pointsLayer.getVisible());
        break;
      case 'Lineas':
        this.linesLayer.setVisible(!this.linesLayer.getVisible());
        break;
      case 'Poly':
        this.polygonsLayer.setVisible(!this.polygonsLayer.getVisible());
        break;
    }
  }

  public toggleFeatureVisibility(item: featureItem) {
    const layer = this.getLayerByFeatureType(item.type);
    const source = layer.getSource();
    if (!source) return;

    if (item.visible) {
      source.removeFeature(item.feature);
      item.visible = false;
    } else {
      source.addFeature(item.feature);
      item.visible = true;
    }
  }

  public zoomToFeature(item: featureItem) {
    const geometry = item.feature.getGeometry();
    if (geometry && this.map) {
      this.map.getView().fit(geometry.getExtent(), {
        duration: 500,
        maxZoom: 10,
      });

      // Seleccionar el feature
      this.selectInteraction.getFeatures().clear();
      this.selectInteraction.getFeatures().push(item.feature);
    }
  }

  private getLayerByFeatureType(type: 'Point' | 'LineString' | 'Polygon') {
    switch (type) {
      case 'Point':
        return this.pointsLayer;
      case 'LineString':
        return this.linesLayer;
      case 'Polygon':
        return this.polygonsLayer;
    }
  }

  public limpiarDatos() {
    this.listaPuntos = [];
    this.listaLineas = [];
    this.listaPoligonos = [];
    this.pointsLayer.getSource()?.clear();
    this.linesLayer.getSource()?.clear();
    this.polygonsLayer.getSource()?.clear();
    this.selectInteraction.getFeatures().clear();
    this.file = false;
  }

  public async getFile(e: FileSelectEvent) {
    const file = e.files[0];
    if (file) {
      this.kmzService.file = file;
      this.file = true;
    } else {
      this.file = false;
      this.kmzService.reset();
      this.helper.notifError(this.translate.instant('kmz.errorNoFileSelected'));
      return;
    }
    const validExtensions = ['.kmz', '.kml'];
    const fileName = file.name.toLowerCase();

    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));
    if (!isValid) {
      this.helper.notifError(this.translate.instant('kmz.errorFileType'));
      return;
    }

    this.loading.set(true);

    try {
      this.limpiarDatos();
      let kmlText = '';

      if (fileName.endsWith('.kmz')) {
        const arrayBuffer = await file.arrayBuffer();
        let zip;
        try {
          zip = await JSZip.loadAsync(arrayBuffer);
        } catch (zipError) {
          throw new Error('No se pudo leer el archivo KMZ como ZIP. Asegúrate de que el archivo esté correcto.');
        }

        const kmlFile = Object.values(zip.files).find((f) => f.name.endsWith('.kml'));
        if (!kmlFile) {
          throw new Error('No se encontró ningún archivo .kml dentro del .kmz.');
        }

        try {
          kmlText = await kmlFile.async('text');
        } catch (textError) {
          throw new Error('No se pudo leer el contenido del archivo .kml dentro del .kmz.');
        }
      } else {
        try {
          kmlText = await file.text();
        } catch (textError) {
          throw new Error('No se pudo leer el archivo .kml.');
        }
      }

      if (!kmlText || typeof kmlText !== 'string') {
        throw new Error('El contenido del archivo KML/KMZ está vacío o no es válido.');
      }

      // Eliminar etiquetas <Style>
      kmlText = kmlText.replace(/<Style[\s\S]*?<\/Style>/g, '');

      await this.procesarKmlText(kmlText);
    } catch (error: any) {
      this.helper.notifError(error.message || this.translate.instant('kmz.errorParsingFile'));
      console.error('Error parsing KMZ/KML file:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private async procesarKmlText(kmlText: string) {
    // Parse KML to OpenLayers features
    const kmlFormat = new KML();
    const allFeatures = kmlFormat.readFeatures(kmlText, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326',
    });

    // Filtrar solo polígonos
    const polygonFeatures = allFeatures.filter((f) => {
      const geom = f.getGeometry();
      const type = geom?.getType();
      return type === 'Polygon' || type === 'MultiPolygon';
    });
    // Añadir polígonos al mapa
    this.polygonsLayer.getSource()?.clear();
    polygonFeatures.forEach((f) => {
      const geom = f.getGeometry() as Polygon;
      if (geom) {
        const originalName = `${f.get('name') || f.get('nombre') || ''}`.trim();
        const name = `Ambiente ${this.listaPoligonos.length + 1}`;
        const id = crypto.randomUUID();
        const polygonFeature = new Feature({
          geometry: geom,
          name,
          originalName,
        });
        polygonFeature.setStyle(OpenLayersService.poligonosConTextStyle(polygonFeature));
        polygonFeature.setId(id);
        // Lista de polígonos para el drawer
        const featureList: featureItem = {
          id,
          name,
          originalName: originalName && originalName !== name ? originalName : undefined,
          type: 'Polygon',
          visible: true,
          feature: polygonFeature,
        };
        this.listaPoligonos.push(featureList);
        this.polygonsLayer.getSource()?.addFeature(polygonFeature);
      }
    });

    // Filtrar puntos
    const pointFeatures = allFeatures.filter((f) => {
      const geom = f.getGeometry();
      const type = geom?.getType();
      return type === 'Point' || type === 'MultiPoint';
    });

    // Añadir puntos al mapa
    this.pointsLayer.getSource()?.clear();
    pointFeatures.forEach((feature) => {
      const geom = feature.getGeometry() as Point;
      if (geom) {
        const name = feature.get('name') || feature.get('nombre') || 'Unnamed Point';
        const id = crypto.randomUUID();
        const pointFeature = new Feature({
          geometry: geom,
          name,
        });
        pointFeature.setStyle(OpenLayersService.pinConTextStyle(pointFeature));
        pointFeature.setId(id);
        // Lista de puntos para el drawer
        const featureList: featureItem = {
          id,
          name,
          type: 'Point',
          visible: true,
          feature: pointFeature,
        };
        this.listaPuntos.push(featureList);
        this.pointsLayer.getSource()?.addFeature(pointFeature);
      }
    });

    // Filter líneas
    const lineFeatures = allFeatures.filter((f) => {
      const geom = f.getGeometry();
      const type = geom?.getType();
      return type === 'LineString' || type === 'MultiLineString';
    });

    // Añadir líneas al mapa
    this.linesLayer.getSource()?.clear();
    lineFeatures.forEach((feature) => {
      const geom = feature.getGeometry();
      if (geom) {
        const name = feature.get('name') || feature.get('nombre') || 'Unnamed Line';
        const id = crypto.randomUUID();
        const lineFeature = new Feature({
          geometry: geom,
          name,
        });
        lineFeature.setStyle(OpenLayersService.lineasConTextStyle(lineFeature));
        lineFeature.setId(id);
        // Lista de líneas para el drawer
        const featureList: featureItem = {
          id,
          name,
          type: 'LineString',
          visible: true,
          feature: lineFeature,
        };
        this.listaLineas.push(featureList);
        this.linesLayer.getSource()?.addFeature(lineFeature);
      }
    });

    // console.log('Polygons:', polygonFeatures.length, 'Points:', pointFeatures.length, 'Lines:', lineFeatures.length);
    // console.log('Lista de polígonos:', this.listaPoligonos);
    // console.log('Lista de puntos:', this.listaPuntos);
    // console.log('Lista de líneas:', this.listaLineas);

    // Guardar en el estado compartido
    this.kmzService.listaPoligonos = this.listaPoligonos;
    this.kmzService.listaPuntos = this.listaPuntos;
    this.kmzService.listaLineas = this.listaLineas;
  }

  // Creadores
  public async crearLote(f: featureItem) {
    this.confirmationService.confirm({
      target: event?.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea crear un lote con los datos del polígono?'),
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
      accept: () => {
        const geometry = f.feature.getGeometry() as Polygon;
        if (!geometry) {
          this.helper.notifError(this.translate.instant('kmz.errorGeometryNotFound'));
          return;
        }
        const coords = geometry.getCoordinates();
        const coords2D = coords.map((coord) => coord.map(([lon, lat]) => [lon, lat]));
        if (!coords2D || !coords2D.length) {
          this.helper.notifError(this.translate.instant('kmz.errorCoordinatesNotFound'));
          return;
        }
        this.params.set('loteDesdeKMZ', {
          coords: coords2D,
          nombre: f.name,
        });
        this.router.navigateByUrl('lotes/crear');
      },
    });
  }
  public async crearEstablecimiento(f: featureItem) {
    this.confirmationService.confirm({
      target: event?.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea crear un establecimiento con los datos del polígono?'),
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
      accept: () => {
        const geometry = f.feature.getGeometry() as Polygon;
        if (!geometry) {
          this.helper.notifError(this.translate.instant('kmz.errorGeometryNotFound'));
          return;
        }
        const coords = geometry.getCoordinates();
        const coords2D = coords.map((coord) => coord.map(([lon, lat]) => [lon, lat]));
        if (!coords2D || !coords2D.length) {
          this.helper.notifError(this.translate.instant('kmz.errorCoordinatesNotFound'));
          return;
        }
        this.params.set('establecimientoDesdeKMZ', {
          coords: coords2D,
          nombre: f.name,
        });
        this.router.navigateByUrl('establecimientos/crear');
      },
    });
  }
  /// HOOKS
  async ngOnInit() {
    this.loading.set(true);
    this.currentPosition = await this.helper.getCurrentPosition();
    this.initMap();

    if (
      this.kmzService.listaPoligonos.length ||
      this.kmzService.listaPuntos.length ||
      this.kmzService.listaLineas.length
    ) {
      // Restaurar features al mapa
      this.listaPoligonos = this.kmzService.listaPoligonos;
      this.listaPuntos = this.kmzService.listaPuntos;
      this.listaLineas = this.kmzService.listaLineas;

      this.listaPoligonos.forEach((f) => this.polygonsLayer.getSource()?.addFeature(f.feature));
      this.listaPuntos.forEach((f) => this.pointsLayer.getSource()?.addFeature(f.feature));
      this.listaLineas.forEach((f) => this.linesLayer.getSource()?.addFeature(f.feature));
      this.file = true;
    }
    this.loading.set(false);
  }
}
