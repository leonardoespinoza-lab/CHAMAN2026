import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { IGeoJSONPoint } from 'modelos/src';
import { Collection, Map, View } from 'ol';
import { Coordinate } from 'ol/coordinate';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Translate } from 'ol/interaction';
import { Vector as VectorLayer } from 'ol/layer';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Vector as VectorSource } from 'ol/source';
import Icon from 'ol/style/Icon';
import Style from 'ol/style/Style';
import { AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { GeoNodeService } from '../../http/geonode.service';
import { HelperService } from '../../servicios/helper';
import { OpenLayersService } from '../../servicios/openLayers.service';
import { SharedModule } from '../../shared.module';

export interface DireccionSeleccionada {
  direccion: string;
  geojson: IGeoJSONPoint;
}

@Component({
  selector: 'app-autocomplete-direccion',
  imports: [SharedModule],
  templateUrl: './autocomplete-direccion.component.html',
  styleUrl: './autocomplete-direccion.component.scss',
})
export class AutocompleteDireccionComponent implements OnInit, AfterViewInit {
  @Input() placeholder: string = 'Buscar dirección...';
  @Input() disabled: boolean = false;
  @Input() initialValue?: DireccionSeleccionada;
  @Input() useDeviceLocation: boolean = true; // Nueva propiedad para controlar el uso de geolocalización
  @Output() direccionChange = new EventEmitter<DireccionSeleccionada>();

  public direccionInput: string = '';
  public direccionesSugeridas: string[] = [];
  public loading: boolean = false;
  public map?: Map;
  public vectorLayer?: VectorLayer<VectorSource>;
  public markerFeature?: Feature<Point>;
  public translateInteraction?: Translate;
  public draggableFeatures?: Collection<Feature>;

  @ViewChild('mapContainer', { static: false }) mapContainer?: ElementRef;

  constructor(
    private geonode: GeoNodeService,
    private helper: HelperService
  ) {}

  ngOnInit() {
    if (this.initialValue) {
      this.direccionInput = this.initialValue.direccion;
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initializeMap();
    }, 0);
  }

  private async initializeMap() {
    if (!this.mapContainer) return;

    // Crear fuente vectorial para el marcador
    const vectorSource = new VectorSource();
    this.vectorLayer = new VectorLayer({
      source: vectorSource,
      style: new Style({
        image: new Icon({
          anchor: [0.5, 1],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          src:
            'data:image/svg+xml;base64,' +
            btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
              <path fill="#dc2626" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          `),
        }),
      }),
    });

    // Obtener coordenadas para centrar el mapa
    let mapCenter = fromLonLat([-58.3816, -34.6037]); // Buenos Aires por defecto
    let mapZoom = 6;

    if (this.useDeviceLocation) {
      try {
        const deviceCoords = await this.helper.getSearchCoordinates(true);
        mapCenter = fromLonLat([deviceCoords.lng, deviceCoords.lat]);
        mapZoom = 10; // Zoom más cercano si tenemos ubicación del dispositivo
        console.log('Centrando mapa en ubicación del dispositivo:', deviceCoords);
      } catch (error) {
        console.log('Usando ubicación por defecto para el mapa');
      }
    }

    // Inicializar mapa
    this.map = new Map({
      target: this.mapContainer.nativeElement,
      layers: [OpenLayersService.mapTile(), this.vectorLayer],
      view: new View({
        center: mapCenter,
        zoom: mapZoom,
      }),
    });

    // Configurar interacción de arrastre solo para el marcador
    this.draggableFeatures = new Collection();
    this.translateInteraction = new Translate({
      features: this.draggableFeatures,
    });

    this.map.addInteraction(this.translateInteraction);

    // Evento cuando termina de arrastrar el marcador
    this.translateInteraction.on('translateend', (event) => {
      if (this.markerFeature && event.features.getArray().includes(this.markerFeature)) {
        const coordinate = this.markerFeature.getGeometry()?.getCoordinates();
        if (coordinate) {
          this.onMarkerDragEnd(coordinate);
        }
      }
    });

    // Si hay un valor inicial, mostrar el marcador
    if (this.initialValue && this.initialValue.geojson.coordinates) {
      this.showMarkerAtCoordinate(this.initialValue.geojson.coordinates);
    }
  }

  public async onSearch(event: AutoCompleteCompleteEvent) {
    if (!event.query || event.query.length < 3) {
      this.direccionesSugeridas = [];
      return;
    }

    this.loading = true;
    try {
      // Obtener coordenadas del dispositivo para mejorar la búsqueda
      const searchCoords = await this.helper.getSearchCoordinates(this.useDeviceLocation);

      const response = await this.geonode.direcciones({
        text: event.query,
        coordenadas: searchCoords,
      });

      console.log('Sugerencias de direcciones:', response.resultados);
      this.direccionesSugeridas = response.resultados || [];
    } catch (error) {
      console.error('Error al buscar direcciones:', error);
      this.direccionesSugeridas = [];
    } finally {
      this.loading = false;
    }
  }

  public async onDireccionSelect(direccion: string) {
    if (!direccion) return;

    this.loading = true;
    try {
      const coordenadas = await this.geonode.geocode({ text: direccion });
      const geojson: IGeoJSONPoint = {
        type: 'Point',
        coordinates: [coordenadas.lng, coordenadas.lat],
      };

      this.showMarkerAtCoordinate([coordenadas.lng, coordenadas.lat]);
      this.emitDireccionChange(direccion, geojson);
    } catch (error) {
      console.error('Error al geocodificar dirección:', error);
    } finally {
      this.loading = false;
    }
  }

  public onDireccionSelectEvent(event: AutoCompleteSelectEvent) {
    const direccion = event.value as string;
    this.onDireccionSelect(direccion);
  }

  private async onMarkerDragEnd(coordinate: Coordinate) {
    const lonLat = toLonLat(coordinate);

    // Hacer reverse geocoding para obtener la dirección
    try {
      const geojson: IGeoJSONPoint = {
        type: 'Point',
        coordinates: [lonLat[0], lonLat[1]],
      };

      const direccionData = await this.geonode.reverse({ geojson });
      const direccionCompleta = direccionData.direccion || this.formatearDireccion(direccionData);

      this.direccionInput = direccionCompleta;
      this.emitDireccionChange(direccionCompleta, geojson);
    } catch (error) {
      console.error('Error en reverse geocoding:', error);
      // Si falla el reverse geocoding, usar coordenadas como dirección
      const direccionCoords = `${lonLat[1].toFixed(6)}, ${lonLat[0].toFixed(6)}`;
      this.direccionInput = direccionCoords;
      this.emitDireccionChange(direccionCoords, {
        type: 'Point',
        coordinates: [lonLat[0], lonLat[1]],
      });
    }
  }

  private showMarkerAtCoordinate(lonLat: number[]) {
    if (!this.vectorLayer || !this.map || !this.draggableFeatures) return;

    const coordinate = fromLonLat(lonLat);

    // Remover marcador anterior si existe
    if (this.markerFeature) {
      this.vectorLayer.getSource()?.removeFeature(this.markerFeature);
      this.draggableFeatures.remove(this.markerFeature);
    }

    // Crear nuevo marcador
    this.markerFeature = new Feature({
      geometry: new Point(coordinate),
    });

    this.vectorLayer.getSource()?.addFeature(this.markerFeature);

    // Agregar el marcador a la colección de características que se pueden arrastrar
    this.draggableFeatures.push(this.markerFeature);

    // Centrar el mapa en el marcador
    this.map.getView().animate({
      center: coordinate,
      zoom: 15,
      duration: 1000,
    });
  }

  private formatearDireccion(direccionData: any): string {
    // Usar la propiedad direccion si existe, sino concatenar las partes
    if (direccionData.direccion) {
      return direccionData.direccion;
    }

    // Fallback: Formatear la dirección concatenando las partes
    const partes = [];

    if (direccionData.calle) partes.push(direccionData.calle);
    if (direccionData.numero) partes.push(direccionData.numero);
    if (direccionData.barrio) partes.push(direccionData.barrio);
    if (direccionData.ciudad) partes.push(direccionData.ciudad);
    if (direccionData.provincia) partes.push(direccionData.provincia);
    if (direccionData.pais) partes.push(direccionData.pais);

    return partes.length > 0 ? partes.join(', ') : 'Dirección desconocida';
  }

  private emitDireccionChange(direccion: string, geojson: IGeoJSONPoint) {
    const resultado: DireccionSeleccionada = {
      direccion,
      geojson,
    };
    this.direccionChange.emit(resultado);
  }
}
