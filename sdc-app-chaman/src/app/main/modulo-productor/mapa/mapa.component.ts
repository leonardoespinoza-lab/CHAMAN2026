import { animate, state, style, transition, trigger } from '@angular/animations';
import { AfterViewInit, ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  IEstablecimiento,
  IGeoJSONPoint,
  IGeoJSONPolygon,
  IListado,
  ILote,
  IPermiso,
  IPopulate,
  IQueryParam,
  IReporteNDVI,
} from 'modelos/src';
import { Feature, Map, MapBrowserEvent, Overlay, View } from 'ol';
import { click } from 'ol/events/condition';
import { createEmpty, Extent, extend as extendExtent } from 'ol/extent';
import { FeatureLike } from 'ol/Feature';
import TileWMS from 'ol/source/TileWMS';
import { Point, Polygon } from 'ol/geom';
import { Select } from 'ol/interaction';
import LayerGroup from 'ol/layer/Group';
import ImageLayer from 'ol/layer/Image';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import { OSM, Vector, XYZ } from 'ol/source';
import Static from 'ol/source/ImageStatic';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import { Subscription } from 'rxjs';
import { ClimaService, IClimaVariable } from '../../../auxiliares/http/clima.service';
import { LoginService } from '../../../auxiliares/http/login.service';
import { IUltimoReporteNDVI, ReporteNDVIService } from '../../../auxiliares/http/reporte-ndvis.service';
import { ClimaLayerManager } from '../../../auxiliares/servicios/clima-source';
import { ClimaTraduccionService } from '../../../auxiliares/servicios/clima-traduccion.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { OpenLayersService } from '../../../auxiliares/servicios/openLayers.service';
import { ParamsService } from '../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../auxiliares/shared.module';
import { DrawerClimaComponent } from './drawer-clima/drawer-clima.component';

interface IServicio {
  label: () => string;
  icon: string;
  backgroudColor: string;
  color: string;
}

interface ILoteMapa extends ILote {
  colorEnfermedad?: string;
  colorRiego?: string;
  colorNDVI?: string;
  severityRiego?: string;
  iconRiego?: string;
  sumaRiego?: number;
  colorHuella?: string;
  severityHuella?: string;
  iconHuella?: string;
  ndvi?: number;
  ndviFecha?: string;
}

@Component({
  selector: 'app-mapa',
  imports: [SharedModule, DrawerClimaComponent],
  templateUrl: './mapa.component.html',
  styleUrl: './mapa.component.scss',
  animations: [
    trigger('expandCollapse', [
      state(
        'collapsed',
        style({
          height: '0px',
          opacity: 0,
          overflow: 'hidden',
        })
      ),
      state(
        'expanded',
        style({
          height: '*',
          opacity: 1,
          overflow: 'hidden',
        })
      ),
      transition('collapsed <=> expanded', [animate('250ms ease-in-out')]),
    ]),
    trigger('slideInOut', [
      transition(':enter', [
        style({
          transform: 'translateX(-15px)',
          opacity: 0,
          scale: 0.95,
        }),
        animate(
          '200ms cubic-bezier(0.4, 0.0, 0.2, 1)',
          style({
            transform: 'translateX(0)',
            opacity: 1,
            scale: 1,
          })
        ),
      ]),
      transition(':leave', [
        animate(
          '150ms cubic-bezier(0.4, 0.0, 1, 0.5)',
          style({
            transform: 'translateX(-10px)',
            opacity: 0,
            scale: 0.98,
          })
        ),
      ]),
    ]),
  ],
})
export class MapaComponent implements OnInit, AfterViewInit, OnDestroy {

  // Helper para convertir severity a tipo válido
  getSeverity(severity: string | undefined): "error" | "success" | "info" | "warn" | "secondary" | "contrast" {
    const validSeverities = ["error", "success", "info", "warn", "secondary", "contrast"];
    return validSeverities.includes(severity || "") ? severity as any : "info";
  }
  private translate = inject(TranslateService);

  public map?: Map;
  private currentPosition?: IGeoJSONPoint;
  public masDetallesClima = false;

  public loading = signal(false);

  private readonly MAP_STATE_KEY = 'chaman_map_state';
  private isFirstVisit = true; // Para controlar si es la primera visita
  private awaitingNearestLotCenter = false;
  private readonly DISTRIBUTED_LOTS_DISTANCE_KM = 180;

  public establecimientos$?: Subscription;
  public establecimientos: IEstablecimiento[] = [];
  public establecimientoSeleccionado?: IEstablecimiento;
  public lotes$?: Subscription;
  public lotes: ILoteMapa[] = [];
  public loteSeleccionado?: ILoteMapa;

  public reportesNDVI: IUltimoReporteNDVI[] = [];
  public reportesNDVI$?: Subscription;

  // Capas
  private establecimientosLayer = new VectorLayer({ source: new Vector(), zIndex: 0 });
  private lotesLayer = new VectorLayer({ source: new Vector(), zIndex: 2 });
  private ndviLayerGroup = new LayerGroup({ zIndex: 1, visible: false });
  private suelosLayer = new TileLayer({
    source: new TileWMS({
      url: 'https://maps.isric.org/mapserv?map=/map/wrb.map',
      params: {
        LAYERS: 'wrb',
        FORMAT: 'image/png',
        TRANSPARENT: 'TRUE',
        VERSION: '1.3.0',
      },
      crossOrigin: 'anonymous',
    }),
    opacity: 0.65,
    visible: false,
    zIndex: 5,
  });
  public isSuelosLayerVisible = false;

  // Popup
  private popupOverlay!: Overlay;
  private popupContentElement!: HTMLElement;

  // Dist
  private permiso?: IPermiso | null;
  private distribuidorLayer = OpenLayersService.distribuidorVectorLayer();

  private selectInteractionLotes?: Select;
  private selectInteractionEstablecimientos?: Select;

  // Servicios
  public servicios: IServicio[] = [
    {
      label: () => this.translate.instant('Monitoreo de enfermedades'),
      icon: 'siembras',
      backgroudColor: 'var(--p-success-color)',
      color: 'white',
    },
    {
      label: () => this.translate.instant('Requerimiento de riego'),
      icon: 'water-drop',
      backgroudColor: 'var(--p-success-color)',
      color: 'white',
    },
    {
      label: () => this.translate.instant('Huella hídrica'),
      icon: 'bloodtype',
      backgroudColor: 'var(--p-success-color)',
      color: 'white',
    },
    {
      label: () => this.translate.instant('NDVI'),
      icon: 'plantas',
      backgroudColor: 'var(--p-success-color)',
      color: 'white',
    },
  ];

  // Helper methods for severity validation
  getValidSeverityRiego(): 'error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast' | null {
    const validSeverities: ('error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast')[] = ['error', 'success', 'info', 'warn', 'secondary', 'contrast'];
    return validSeverities.includes(this.loteSeleccionado?.severityRiego as any) 
      ? this.loteSeleccionado?.severityRiego as any 
      : null;
  }

  getValidSeverityHuella(): 'error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast' | null {
    const validSeverities: ('error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast')[] = ['error', 'success', 'info', 'warn', 'secondary', 'contrast'];
    return validSeverities.includes(this.loteSeleccionado?.severityHuella as any) 
      ? this.loteSeleccionado?.severityHuella as any 
      : null;
  }

  public servicioSeleccionado: IServicio = this.servicios[0];
  public showDrawerServicios = false;
  public showDrawerClima = false;

  // Datos para el panel de enfermedades
  public enfermedades = {
    cantRojo: 0,
    cantAmarillo: 0,
    cantVerde: 0,
    haRojo: 0,
    haAmarillo: 0,
    haVerde: 0,
  };
  // Datos para el panel de riego
  public riego = {
    cantRojo: 0,
    cantAmarillo: 0,
    cantVerde: 0,
    haRojo: 0,
    haAmarillo: 0,
    haVerde: 0,
  };
  // Datos para el panel de huella hidrica
  public huella = {
    cantRojo: 0,
    cantAmarillo: 0,
    cantVerde: 0,
    haRojo: 0,
    haAmarillo: 0,
    haVerde: 0,
  };

  // Variables para capas de clima
  climaVariables: IClimaVariable[] = [];
  climaVariableSeleccionada: IClimaVariable | null = null;
  showClimaLayers = false;
  climaOpacidad = 0.7;
  climaTilesLoading = false;
  showClimaTilesPanel = false; // Control para expandir/contraer panel
  private currentClimaLayer: any = null; // Tipo específico según librería de mapas
  private climaLayerManager?: ClimaLayerManager;

  // Definiciones de leyendas para cada variable climática
  climaLegendas: { [variableId: string]: { label: string; color: string; value: string }[] } = {
    temperature: [
      { label: 'Muy Frío', color: '#0066CC', value: '< -10°C' },
      { label: 'Frío', color: '#3399FF', value: '-10 a 0°C' },
      { label: 'Fresco', color: '#66CCFF', value: '0 a 10°C' },
      { label: 'Templado', color: '#99FF99', value: '10 a 20°C' },
      { label: 'Cálido', color: '#FFFF66', value: '20 a 30°C' },
      { label: 'Caliente', color: '#FF9933', value: '30 a 40°C' },
      { label: 'Muy Caliente', color: '#FF3300', value: '> 40°C' },
    ],
    humidity: [
      { label: 'Muy Seco', color: '#8B4513', value: '< 20%' },
      { label: 'Seco', color: '#DAA520', value: '20-40%' },
      { label: 'Moderado', color: '#FFFF00', value: '40-60%' },
      { label: 'Húmedo', color: '#90EE90', value: '60-80%' },
      { label: 'Muy Húmedo', color: '#4169E1', value: '> 80%' },
    ],
    precipitation: [
      { label: 'Sin lluvia', color: '#F0F0F0', value: '0 mm' },
      { label: 'Llovizna', color: '#87CEEB', value: '0.1-1 mm' },
      { label: 'Lluvia ligera', color: '#4682B4', value: '1-5 mm' },
      { label: 'Lluvia moderada', color: '#1E90FF', value: '5-15 mm' },
      { label: 'Lluvia fuerte', color: '#0000FF', value: '15-30 mm' },
      { label: 'Lluvia intensa', color: '#4B0082', value: '> 30 mm' },
    ],
    wind_speed: [
      { label: 'Calma', color: '#E0E0E0', value: '< 2 m/s' },
      { label: 'Brisa ligera', color: '#98FB98', value: '2-4 m/s' },
      { label: 'Brisa moderada', color: '#90EE90', value: '4-6 m/s' },
      { label: 'Viento fresco', color: '#FFFF00', value: '6-10 m/s' },
      { label: 'Viento fuerte', color: '#FFA500', value: '10-15 m/s' },
      { label: 'Viento muy fuerte', color: '#FF0000', value: '> 15 m/s' },
    ],
    pressure: [
      { label: 'Muy Baja', color: '#800080', value: '< 980 hPa' },
      { label: 'Baja', color: '#0000FF', value: '980-1000 hPa' },
      { label: 'Normal Baja', color: '#00BFFF', value: '1000-1013 hPa' },
      { label: 'Normal Alta', color: '#FFFF00', value: '1013-1025 hPa' },
      { label: 'Alta', color: '#FFA500', value: '1025-1040 hPa' },
      { label: 'Muy Alta', color: '#FF0000', value: '> 1040 hPa' },
    ],
    clouds: [
      { label: 'Despejado', color: '#FFFFFF', value: '< 10%' },
      { label: 'Pocas nubes', color: '#F0F8FF', value: '10-25%' },
      { label: 'Parcialmente nublado', color: '#D3D3D3', value: '25-50%' },
      { label: 'Muy nublado', color: '#A9A9A9', value: '50-75%' },
      { label: 'Nublado', color: '#808080', value: '75-90%' },
      { label: 'Cubierto', color: '#696969', value: '> 90%' },
    ],
  };

  constructor(
    private listado: ListadosService,
    public helper: HelperService,
    public sanitizer: DomSanitizer,
    public paramsService: ParamsService,
    public router: Router,
    private changeDetectorRef: ChangeDetectorRef,
    private service: ReporteNDVIService,
    private activatedRoute: ActivatedRoute,
    public loginService: LoginService,
    private climaTraduccionService: ClimaTraduccionService,
    private climaService: ClimaService
  ) {}

  // Métodos para manejar el estado del mapa
  private saveMapState() {
    if (!this.map) return;

    const view = this.map.getView();
    const center = view.getCenter();
    const zoom = view.getZoom();

    if (center && zoom !== undefined) {
      const mapState = {
        center,
        zoom,
        timestamp: Date.now(),
      };

      try {
        localStorage.setItem(this.MAP_STATE_KEY, JSON.stringify(mapState));
      } catch (error) {
        console.warn('Error al guardar estado del mapa:', error);
      }
    }
  }

  private loadMapState(): { center: number[]; zoom: number } | null {
    try {
      const saved = localStorage.getItem(this.MAP_STATE_KEY);
      if (saved) {
        const mapState = JSON.parse(saved);
        const center = this.normalizeStoredMapCenter(mapState.center);
        const zoom = Number(mapState.zoom);

        if (!center || !Number.isFinite(zoom)) {
          localStorage.removeItem(this.MAP_STATE_KEY);
          return null;
        }

        return {
          center,
          zoom,
        };
      }
    } catch (error) {
      console.warn('Error al cargar estado del mapa:', error);
      localStorage.removeItem(this.MAP_STATE_KEY);
    }
    return null;
  }

  private normalizeStoredMapCenter(center: unknown): number[] | null {
    if (!Array.isArray(center) || center.length < 2) {
      return null;
    }

    const x = Number(center[0]);
    const y = Number(center[1]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    // Estados viejos guardaban lon/lat directo. OpenLayers espera EPSG:3857.
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      return fromLonLat([x, y]);
    }

    const webMercatorLimit = 20037508.342789244;
    if (Math.abs(x) > webMercatorLimit || Math.abs(y) > webMercatorLimit) {
      return null;
    }

    return [x, y];
  }

  private getInitialMapPosition(): { center: number[]; zoom: number } {
    // Intentar cargar estado guardado primero
    const savedState = this.loadMapState();
    if (savedState) {
      return savedState;
    }

    // Si no hay estado guardado, usar posición por defecto
    // La posición real se establecerá después de cargar establecimientos/lotes
    const zoom = this.helper.isHandset ? 14 : 15;
    return {
      center: [-64.18105, -31.413801], // Coordenadas por defecto de Córdoba - NO usar ubicación del dispositivo aquí
      zoom,
    };
  }

  // Método para limpiar el estado guardado (útil para desarrollo/testing)
  public clearMapState() {
    try {
      localStorage.removeItem(this.MAP_STATE_KEY);
      this.isFirstVisit = true; // Resetear bandera de primera visita
    } catch (error) {
      console.warn('Error al limpiar estado del mapa:', error);
    }
  }

  // Método para centrar el mapa en la primera visita según prioridad
  private centerMapOnFirstVisit() {
    if (!this.isFirstVisit) {
      return;
    }

    if (this.lotes?.length > 0) {
      const distributedLots = this.getLotsSpreadKm() > this.DISTRIBUTED_LOTS_DISTANCE_KM;
      if (distributedLots && this.currentPosition?.coordinates) {
        this.centerMapOnNearestLotes();
        return;
      }
      this.awaitingNearestLotCenter = distributedLots;
      this.centerMapOnBoundsLotes(!distributedLots);
      return;
    }

    // Prioridad 2: Centrar en establecimientos si no hay lotes
    if (this.establecimientos?.length > 0) {
      this.setBoundsEstablecimientos();
      return;
    }

    // Prioridad 3: Usar ubicación del dispositivo si no hay datos
    this.centerOnUserLocation();
  }

  // Método para centrar en establecimientos
  private setBoundsEstablecimientos() {
    if (!this.map || !this.establecimientosLayer) {
      console.warn('Mapa o capa de establecimientos no inicializados para setBounds');
      return;
    }

    const source = this.establecimientosLayer.getSource();
    const extent = source?.getExtent();

    if (extent && (extent[0] === Infinity || extent[0] === -Infinity)) {
      return;
    }
    if (!extent) return;

    this.map?.getView()?.fit(extent, { padding: [50, 50, 50, 50] });

    // Guardar la posición después de centrar
    setTimeout(() => {
      this.saveMapState();
      this.isFirstVisit = false;
    }, 1000);
  }

  private calcularEnfermedades() {
    this.enfermedades = {
      cantRojo: 0,
      cantAmarillo: 0,
      cantVerde: 0,
      haRojo: 0,
      haAmarillo: 0,
      haVerde: 0,
    };
    let maxRiesgoTotal = 0;
    this.lotes.forEach((lote) => {
      const has = Math.trunc(lote?.ubicacion?.superficie || 0);
      const predicciones = lote.siembra?.ultimaPrediccion?.enfermedades || [];
      let maxRiesgo = 0; // Riesgo bajo (verde)
      predicciones.forEach((prediccion) => {
        if (prediccion.resultado >= 20) {
          maxRiesgo = Math.max(maxRiesgo, 2); // Riesgo alto (rojo)
        } else if (prediccion.resultado >= 15) {
          maxRiesgo = Math.max(maxRiesgo, 1); // Riesgo medio (amarillo)
        }
      });
      maxRiesgoTotal = Math.max(maxRiesgoTotal, maxRiesgo);
      switch (maxRiesgo) {
        case 2:
          this.enfermedades.cantRojo++;
          this.enfermedades.haRojo += has;
          lote.colorEnfermedad = 'rgba(244, 74, 74, 0.6)';
          break;
        case 1:
          this.enfermedades.cantAmarillo++;
          this.enfermedades.haAmarillo += has;
          lote.colorEnfermedad = 'rgba(243, 216, 64, 0.6)';
          break;
        default:
          this.enfermedades.cantVerde++;
          this.enfermedades.haVerde += has;
          lote.colorEnfermedad = 'rgba(34, 197, 94, 0.6)';
          break;
      }
    });

    // Cambia el color en el selector de servicios segun el riesgo
    if (maxRiesgoTotal === 2) {
      this.servicios[0].backgroudColor = 'var(--p-danger-color)';
    } else if (maxRiesgoTotal === 1) {
      this.servicios[0].backgroudColor = 'var(--p-warning-color)';
    } else {
      this.servicios[0].backgroudColor = 'var(--p-success-color)';
    }
  }
  private calcularRiego() {
    this.riego = {
      cantRojo: 0,
      cantAmarillo: 0,
      cantVerde: 0,
      haRojo: 0,
      haAmarillo: 0,
      haVerde: 0,
    };
    let regarHoyTotal: boolean = false;
    let regarAlgunDiaTotal: boolean = false;
    this.lotes.forEach((lote) => {
      const has = Math.trunc(lote?.ubicacion?.superficie || 0);
      const predicciones = lote.siembra?.ultimaPrediccionRiego || [];
      const regarHoy = !!predicciones[0]?.cantidad;
      const regarAlgunDia = predicciones.some((p) => p.cantidad && p.cantidad > 0);
      const sumaRiego = predicciones.reduce((acc, p) => acc + (p.cantidad || 0), 0);
      lote.sumaRiego = sumaRiego;
      if (regarHoy) {
        this.riego.cantRojo++;
        this.riego.haRojo += has;
        lote.colorRiego = 'rgba(244, 74, 74, 0.6)';
        lote.severityRiego = 'error';
        lote.iconRiego = 'pi pi-exclamation-triangle';
      } else if (regarAlgunDia) {
        this.riego.cantAmarillo++;
        this.riego.haAmarillo += has;
        lote.colorRiego = 'rgba(243, 216, 64, 0.6)';
        lote.severityRiego = 'warn';
        lote.iconRiego = 'pi pi-info-circle';
      } else {
        this.riego.cantVerde++;
        this.riego.haVerde += has;
        lote.colorRiego = 'rgba(34, 197, 94, 0.6)';
        lote.severityRiego = 'success';
        lote.iconRiego = 'pi pi-check';
      }

      regarHoyTotal = regarHoyTotal || regarHoy;
      regarAlgunDiaTotal = regarAlgunDiaTotal || regarAlgunDia;
    });

    // Cambia el color en el selector de servicios segun el riesgo
    if (regarHoyTotal) {
      this.servicios[1].backgroudColor = 'var(--p-danger-color)';
    } else if (regarAlgunDiaTotal) {
      this.servicios[1].backgroudColor = 'var(--p-warning-color)';
    } else {
      this.servicios[1].backgroudColor = 'var(--p-success-color)';
    }
  }
  private calcularHuella() {
    this.huella = {
      cantRojo: 0,
      cantAmarillo: 0,
      cantVerde: 0,
      haRojo: 0,
      haAmarillo: 0,
      haVerde: 0,
    };

    let maxHuellaGris = 0;
    this.lotes.forEach((lote) => {
      const has = Math.trunc(lote?.ubicacion?.superficie || 0);
      const huella = lote.huellaHidrica;
      if (!huella) return;

      const huellaGris = huella.gris?.litrosKcal || 0;
      // const huellaTotal = huella.total?.litrosKcal || 0

      if (huellaGris > 500) {
        this.huella.cantRojo++;
        this.huella.haRojo += has;
        lote.colorHuella = 'rgba(244, 74, 74, 0.6)';
        lote.severityHuella = 'error';
        lote.iconHuella = 'pi pi-exclamation-triangle';
      } else if (huellaGris > 200) {
        this.huella.cantAmarillo++;
        this.huella.haAmarillo += has;
        lote.colorHuella = 'rgba(243, 216, 64, 0.6)';
        lote.severityHuella = 'warn';
        lote.iconHuella = 'pi pi-info-circle';
      } else {
        this.huella.cantVerde++;
        this.huella.haVerde += has;
        lote.colorHuella = 'rgba(34, 197, 94, 0.6)';
        lote.severityHuella = 'success';
        lote.iconHuella = 'pi pi-check';
      }

      maxHuellaGris = Math.max(maxHuellaGris, huellaGris);
    });

    // Cambia el color en el selector de servicios segun el riesgo
    if (maxHuellaGris > 500) {
      this.servicios[2].backgroudColor = 'var(--p-danger-color)';
    } else if (maxHuellaGris > 200) {
      this.servicios[2].backgroudColor = 'var(--p-warning-color)';
    } else {
      this.servicios[2].backgroudColor = 'var(--p-success-color)';
    }
  }

  public changeServicio(servicio: IServicio) {
    this.servicioSeleccionado = servicio;
    this.showDrawerServicios = false;
    if (this.servicioSeleccionado.label() === this.translate.instant('NDVI')) {
      this.refreshImagesGroup();
      this.redibujarImagenes();
      this.redibujarLotes();
      this.setLayerNdviVisible(true);
      this.setBoundsNdvi();
    } else {
      this.redibujarLotes();
      this.setLayerNdviVisible(false);
      this.setVectorLayerLotesVisible(true);
      this.setBoundsLotes();
    }
  }

  public abrirDrawerClima() {
    this.showDrawerClima = true;
  }

  /**
   * Obtiene la descripción del clima traducida al español
   * @param descripcionOriginal - Descripción original del clima (normalmente en inglés)
   * @returns Descripción traducida al español
   */
  public getDescripcionClimaTraducida(descripcionOriginal: string | undefined): string {
    if (!descripcionOriginal) {
      return 'Indeterminado';
    }
    return this.climaTraduccionService.traducirDescripcion(descripcionOriginal);
  }

  public getServicioShortLabel(servicio: IServicio): string {
    switch (servicio.icon) {
      case 'siembras':
        return 'Enfermedades';
      case 'water-drop':
        return 'Riego';
      case 'bloodtype':
        return 'Huella';
      case 'plantas':
        return 'NDVI';
      default:
        return servicio.label();
    }
  }

  public climaZonaNombre(): string {
    return this.establecimientoSeleccionado?.nombre || 'Zona del mapa';
  }

  public climaTemperaturaActual(): string {
    return this.formatMetric(this.getClimaActual()?.temperatura?.last, 'C', 1);
  }

  public climaHumedadActual(): string {
    return this.formatMetric(this.getClimaActual()?.humedad?.last, '%', 0);
  }

  public climaLluvia24(): string {
    const pronosticos = this.getPronosticosZona();
    return this.formatMetric(this.numero(pronosticos[0]?.lluvia) || 0, 'mm', 1);
  }

  public climaLluvia72(): string {
    const lluvia = this.getPronosticosZona()
      .slice(0, 3)
      .reduce((acc, item) => acc + (this.numero(item?.lluvia) || 0), 0);
    return this.formatMetric(lluvia, 'mm', 1);
  }

  public climaVientoMax(): string {
    const pronosticos = this.getPronosticosZona();
    const maxPronostico = Math.max(
      ...pronosticos.slice(0, 3).map((item) => this.numero(item?.velocidadViento?.max ?? item?.velocidadViento?.avg) || 0),
      0
    );
    const actual = this.numero(this.getClimaActual()?.velocidadViento?.last) || 0;
    return this.formatMetric(Math.max(actual, maxPronostico), 'km/h', 0);
  }

  public loteUbicacion(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    const partes = [
      seleccionado?.establecimiento?.nombre,
      seleccionado?.departamento?.nombre,
      seleccionado?.departamento?.provincia?.nombre,
    ].filter(Boolean);
    return partes.length ? partes.join(' / ') : 'Ubicacion sin clasificar';
  }

  public loteHectareas(lote?: ILoteMapa): string {
    const superficie = this.numero((lote || this.loteSeleccionado)?.ubicacion?.superficie);
    return superficie === null ? '-- ha' : `${this.formatNumber(superficie, 1)} ha`;
  }

  public loteSuelo(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    return (
      seleccionado?.suelos?.[0]?.textura ||
      seleccionado?.texturaLixiviacion ||
      seleccionado?.texturaEscorrentia ||
      seleccionado?.drenajeNaturalLixiviacion ||
      'Sin dato'
    );
  }

  public loteCultivo(lote?: ILoteMapa): string {
    const cultivo = (lote || this.loteSeleccionado)?.siembra?.semilla?.cultivo;
    return cultivo ? this.helper.translateCultivo(cultivo) : 'Sin siembra';
  }

  public loteVariedad(lote?: ILoteMapa): string {
    const semilla = (lote || this.loteSeleccionado)?.siembra?.semilla;
    if (!semilla) {
      return 'Sin variedad cargada';
    }
    return [semilla.variedad, semilla.semillero, this.helper.translateCiclo(semilla.ciclo)].filter(Boolean).join(' ');
  }

  public loteEtapa(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    return seleccionado?.siembra ? this.helper.getNombreEtapa(seleccionado) : 'Sin siembra';
  }

  public loteFechaSiembra(lote?: ILoteMapa): string {
    const fecha = (lote || this.loteSeleccionado)?.siembra?.fechaSiembra;
    return fecha ? new Date(fecha).toLocaleDateString('es-AR') : 'No cargada';
  }

  public loteEnfermedadResumen(lote?: ILoteMapa): string {
    const predicciones = (lote || this.loteSeleccionado)?.siembra?.ultimaPrediccion?.enfermedades || [];
    if (!predicciones.length) {
      return 'Sin prediccion reciente';
    }
    const max = predicciones.reduce((prev, current) => ((current.resultado || 0) > (prev.resultado || 0) ? current : prev));
    return `${max.enfermedad}: ${this.formatNumber(max.resultado || 0, 0)}%`;
  }

  public loteEnfermedadNivel(lote?: ILoteMapa): string {
    const max = this.maxRiesgoEnfermedad(lote || this.loteSeleccionado);
    if (max === null) return 'Pendiente';
    if (max >= 20) return 'Riesgo alto';
    if (max >= 15) return 'Riesgo medio';
    return 'Riesgo bajo';
  }

  public loteEnfermedadPercent(lote?: ILoteMapa): number {
    const max = this.maxRiesgoEnfermedad(lote || this.loteSeleccionado);
    return max === null ? 8 : Math.max(8, Math.min(100, (max / 25) * 100));
  }

  public loteRiegoResumen(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    if (!seleccionado?.siembra) {
      return 'Sin siembra';
    }
    if (seleccionado?.sumaRiego && seleccionado.sumaRiego > 0) {
      return `${this.formatNumber(seleccionado.sumaRiego, 1)} mm sugeridos`;
    }
    return 'Sin riego recomendado';
  }

  public loteHuellaResumen(lote?: ILoteMapa): string {
    const huella = (lote || this.loteSeleccionado)?.huellaHidrica;
    if (huella?.total?.litrosKg) {
      return `${this.formatNumber(huella.total.litrosKg, 0)} l/kg total`;
    }
    return 'En seguimiento';
  }

  public loteNdviResumen(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    if (seleccionado?.ndvi) {
      return `NDVI ${this.formatNumber(seleccionado.ndvi, 3)}`;
    }
    return 'Sin lectura NDVI';
  }

  public loteRindeResumen(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    const siembra = seleccionado?.siembra;
    if (!siembra) {
      return 'Sin siembra';
    }
    const cosecha = siembra.rendimientoObtenidoKgHaSeco || siembra.rendimientoObtenidoKgHa;
    if (cosecha) {
      return `${this.formatNumber(cosecha, 0)} kg/ha cosechado`;
    }

    const cultivo = String(siembra.semilla?.cultivo || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    let base = 3500;
    if (cultivo.includes('maiz')) base = 8500;
    if (cultivo.includes('soja')) base = 3200;
    if (cultivo.includes('trigo')) base = 4200;

    const manejoFactor: Record<string, number> = {
      'Muy Bajo': 0.65,
      Bajo: 0.82,
      Alto: 1.08,
      'Muy Alto': 1.2,
    };
    const sueloFactor: Record<string, number> = {
      Arcilloso: 0.95,
      'Franco arcilloso': 1.04,
      Franco: 1.08,
      'Franco arenoso': 0.98,
      Arenoso: 0.84,
    };

    const riesgo = this.maxRiesgoEnfermedad(seleccionado) || 0;
    const ndviFactor = seleccionado?.ndvi ? Math.max(0.65, Math.min(1.18, 0.72 + seleccionado.ndvi * 0.62)) : 0.92;
    const enfermedadFactor = riesgo >= 20 ? 0.82 : riesgo >= 15 ? 0.91 : 1;
    const riegoFactor = seleccionado?.sumaRiego && seleccionado.sumaRiego > 15 ? 0.92 : 1;
    const factor =
      (manejoFactor[siembra.rendimiento || ''] || 1) *
      (sueloFactor[this.loteSuelo(seleccionado)] || 1) *
      ndviFactor *
      enfermedadFactor *
      riegoFactor;

    return `${this.formatNumber(base * factor, 0)} kg/ha estimado`;
  }

  public cosecharLote() {
    if (!this.loteSeleccionado?.idSiembra) {
      this.helper.notifWarn('El lote necesita una siembra activa para cargar cosecha.');
      return;
    }
    this.paramsService.set('cosecharLote', this.loteSeleccionado);
    this.router.navigate(['lotes', 'cosechar', this.loteSeleccionado?._id]);
  }

  public editarLote() {
    if (!this.loteSeleccionado?._id) return;
    this.router.navigate(['lotes', 'editar', this.loteSeleccionado._id]);
  }

  private getClimaActual(): any {
    const actual = this.establecimientoSeleccionado?.climaActual as any;
    return actual?.clima || actual;
  }

  private getPronosticosZona(): any[] {
    const prediccion = this.establecimientoSeleccionado?.prediccionClimatica as any;
    const pronosticos = prediccion?.pronosticos || prediccion?.clima?.pronosticos || [];
    return Array.isArray(pronosticos) ? pronosticos : [];
  }

  private maxRiesgoEnfermedad(lote?: ILoteMapa): number | null {
    const predicciones = lote?.siembra?.ultimaPrediccion?.enfermedades || [];
    if (!predicciones.length) return null;
    return predicciones.reduce((max, item) => Math.max(max, item.resultado || 0), 0);
  }

  private numero(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private formatMetric(value: unknown, unit: string, digits = 0): string {
    const numberValue = this.numero(value);
    if (numberValue === null) {
      return '--';
    }
    return `${this.formatNumber(numberValue, digits)} ${unit}`;
  }

  private formatNumber(value: number, digits = 0): string {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  // Método para redibujar datos cuando el mapa está listo
  private async redibujarDatosSiEstaDisponible() {
    // Redibujar establecimientos si hay datos
    if (this.establecimientos?.length > 0) {
      await this.redibujarEstablecimientos();
    }

    // Redibujar lotes si hay datos
    if (this.lotes?.length > 0) {
      await this.redibujarLotes();

      // Solo centrar automáticamente en primera visita
      if (this.isFirstVisit) {
        this.centerMapOnFirstVisit();
      }
    }
  }

  private initMap() {
    // Timeout para asegurar que el DOM está completamente renderizado (especialmente importante en iOS)
    setTimeout(() => {
      const mapElement = document.getElementById('mapa');
      if (!mapElement) {
        console.error('Elemento del mapa no encontrado');
        return;
      }

      // Verificar que el elemento tenga dimensiones
      const rect = mapElement.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
        console.warn('El contenedor del mapa no tiene dimensiones, reintentando...');
        // Intentar nuevamente después de un timeout más largo
        setTimeout(() => this.initMap(), 500);
        return;
      }

      // Límites de zoom basados en la disponibilidad real de datos de ArcGIS
      // Aunque los servicios soportan hasta nivel 23, muchas regiones (especialmente rurales)
      // no tienen tiles disponibles en niveles altos, causando "Map not yet available"
      const maxZoomSatellite = this.helper.isHandset ? 15 : 17; // Reducido a 17 para desktop
      const maxZoomLabels = this.helper.isHandset ? 15 : 17; // Reducido a 17 para desktop

      // Obtener posición inicial (guardada o del dispositivo)
      const initialPosition = this.getInitialMapPosition();
      this.map = new Map({
        target: 'mapa',
        controls: [],
        view: new View({
          center: this.normalizeStoredMapCenter(initialPosition.center) || fromLonLat([-64.18105, -31.413801]),
          zoom: initialPosition.zoom,
          projection: 'EPSG:3857',
          maxZoom: maxZoomSatellite, // Limitar el zoom máximo del mapa
          minZoom: 2, // Limitar el zoom mínimo para evitar problemas de renderizado
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
              maxZoom: maxZoomLabels,
            }),
          }),
          this.establecimientosLayer,
          this.lotesLayer,
          this.ndviLayerGroup,
          this.distribuidorLayer,
          this.suelosLayer,
        ],
      });

      // ✨ =======================================================
      // ✨ PASO 1: MUEVE LA CONFIGURACIÓN DEL POPUP AQUÍ
      // ✨ =======================================================
      const popupContainer = document.getElementById('popup');
      this.popupContentElement = document.getElementById('popup-content')!;
      const popupCloser = document.getElementById('popup-closer');

      if (!popupContainer || !this.popupContentElement || !popupCloser) {
        console.error('No se encontraron los elementos del popup en el DOM.');
        return;
      }

      this.popupOverlay = new Overlay({
        element: popupContainer,
        autoPan: {
          animation: {
            duration: 250,
          },
        },
      });

      // ✨ PASO 2: AÑADE LA LÍNEA QUE FALTABA
      this.map.addOverlay(this.popupOverlay);

      // Configurar visibilidad inicial de las capas
      this.suelosLayer.setVisible(this.isSuelosLayerVisible);

      popupCloser.onclick = () => {
        this.popupOverlay.setPosition(undefined);
        popupCloser.blur();
        return false;
      };

      // ✨ =======================================================
      // ✨ PASO 3: TUS LISTENERS EXISTENTES
      // ✨ =======================================================
      this.map.on('click', (evt: MapBrowserEvent<any>) => {
        // Primero, manejamos el click en los suelos
        this.handleSuelosClick(evt);
        // Luego, el click para deseleccionar lotes (si es necesario)
        this.handleMapClick();
      });

      // Forzar un resize del mapa después de la inicialización (importante para iOS)
      setTimeout(() => {
        if (this.map) {
          this.map.updateSize();
        }
      }, 100);

      // Agregar listener para cambios de zoom
      this.map.getView().on('change:resolution', () => {
        // Guardar estado con un pequeño delay para evitar muchas escrituras
        setTimeout(() => {
          this.saveMapState();
        }, 500);
      });

      this.handleSelectLote();
      this.handleSelectEstablciemientos();
      this.handleMapDragEnd();
      this.handleMapClick();
      setTimeout(() => {
        this.moveEnd();
        // Una vez que el mapa está completamente inicializado, redibujar datos si están disponibles
        this.redibujarDatosSiEstaDisponible();

        // Inicializar capas de clima
        this.initClimaLayers();
      }, 50);
    }, 100);
  }

  // Poligonos Establecimientos
  private getEstablecimientoDefaultStyle(feature: FeatureLike) {
    return new Style({
      stroke: new Stroke({
        color: feature.get('strokeColor') || '#000',
        width: 1,
        lineDash: [4, 8],
        lineDashOffset: 0,
      }),
    });
  }

  private getEstablecimientoSelectedStyle(feature: FeatureLike) {
    const style = this.getEstablecimientoDefaultStyle(feature);
    style.setStroke(
      new Stroke({
        color: '#f44a4a',
        width: 2,
        lineDash: [4, 8],
        lineDashOffset: 0,
      })
    );
    return style;
  }

  private addPolygonEstablecimiento(establecimiento: IEstablecimiento) {
    const ubicaciones = establecimiento.ubicacion;
    if (!ubicaciones?.length) {
      console.warn('⚠️ Establecimiento sin ubicaciones válidas:', establecimiento.nombre);
      return;
    }

    for (const ubicacion of ubicaciones) {
      const geojson = ubicacion.geojson as IGeoJSONPolygon;
      if (!geojson?.coordinates?.length) {
        console.warn('⚠️ Ubicación sin coordenadas válidas para:', establecimiento.nombre);
        continue;
      }

      const source = this.establecimientosLayer.getSource();
      if (!source) {
        console.warn('⚠️ Source del layer de establecimientos no disponible');
        return;
      }

      const polygon = new Polygon(geojson.coordinates!);
      polygon.transform('EPSG:4326', 'EPSG:3857');
      const feature = new Feature(polygon);
      // Estilo del poligono
      feature.setId(establecimiento.nombre);
      feature.set('establecimiento', establecimiento);
      feature.set('nombre', establecimiento.nombre);
      feature.set('strokeColor', this.helper.darkTheme ? '#000' : '#FFF');
      feature.set('strokeColorSelected', this.helper.darkTheme ? '#FFF' : '#000');
      const style = this.getEstablecimientoDefaultStyle(feature);
      feature.setStyle(style);
      source.addFeature(feature);
    }
  }

  private clearPolygonsEstablecimientos() {
    if (!this.map || !this.establecimientosLayer) {
      console.warn('Mapa o capa de establecimientos no inicializados aún');
      return;
    }
    const source = this.establecimientosLayer.getSource();
    source?.clear();
  }

  private async redibujarEstablecimientos() {
    if (!this.map || !this.establecimientosLayer) {
      console.warn('Mapa no inicializado, posponiendo redibujado de establecimientos');
      return;
    }

    this.loading.set(true);
    this.clearPolygonsEstablecimientos();

    await Promise.all(
      this.establecimientos.map(async (e) => {
        if (e.ubicacion?.length) {
          this.addPolygonEstablecimiento(e);
        }
      })
    );

    this.loading.set(false);
  }

  private selectEstablecimiento(nombre?: string, intentos: number = 0) {
    if (!nombre) {
      return;
    }

    // Evitar loop infinito - máximo 10 intentos
    if (intentos >= 10) {
      console.warn('⚠️ Máximo de intentos alcanzado para seleccionar establecimiento:', nombre);
      return;
    }

    // Verificar que el layer de establecimientos esté inicializado y tenga features
    const source = this.establecimientosLayer?.getSource();
    if (!source || source.getFeatures().length === 0) {
      // Intentar nuevamente después de un pequeño delay
      setTimeout(() => {
        this.selectEstablecimiento(nombre, intentos + 1);
      }, 200); // Aumentar delay a 200ms
      return;
    }

    const feature = source.getFeatureById(nombre);
    if (feature) {
      // Limpiar selección anterior
      this.selectInteractionEstablecimientos?.getFeatures().clear();
      // Seleccionar el nuevo
      this.selectInteractionEstablecimientos?.getFeatures().push(feature);
    }
  }

  private handleSelectEstablciemientos() {
    this.selectInteractionEstablecimientos = new Select({
      style: (feature) => this.getEstablecimientoSelectedStyle(feature),
      layers: [this.establecimientosLayer],
      condition: () => false,
    });
    this.selectInteractionEstablecimientos.on('select', (e) => {
      e.selected.forEach((f) => {
        const establecimiento = f.get('establecimiento');
        this.establecimientoSeleccionado = establecimiento as IEstablecimiento;

        this.changeDetectorRef.detectChanges();
      });
    });
    this.map?.addInteraction(this.selectInteractionEstablecimientos);
  }

  private moveEnd() {
    // Verificar que tengamos establecimientos cargados
    if (!this.establecimientos || this.establecimientos.length === 0) {
      return;
    }

    const view = this.map?.getView();
    const center3857 = view?.getCenter(); // Coordenadas en EPSG:3857
    if (!center3857) {
      console.warn('⚠️ No se pudo obtener el centro del mapa');
      return;
    }
    const center = toLonLat(center3857);
    const point: IGeoJSONPoint = {
      type: 'Point',
      coordinates: (center as any) || [0, 0],
    };

    this.establecimientoSeleccionado = this.helper.establecimientoMasCercano(point, this.establecimientos);

    // Si no encuentra establecimiento más cercano, seleccionar el primero disponible
    if (!this.establecimientoSeleccionado && this.establecimientos?.length > 0) {
      this.establecimientoSeleccionado = this.establecimientos[0];
    }

    // Forzar detección de cambios
    if (this.establecimientoSeleccionado) {
      this.changeDetectorRef.detectChanges();
    }

    this.selectEstablecimiento(this.establecimientoSeleccionado?.nombre);
  }
  private handleMapDragEnd() {
    this.map?.on('moveend', () => {
      this.moveEnd();
      // Guardar el estado del mapa cada vez que se mueva
      this.saveMapState();

      // Actualizar tiles climáticos si están visibles y cambió el zoom
      this.handleZoomChange();
    });
  }

  private async handleZoomChange(): Promise<void> {
    if (!this.map || !this.climaLayerManager || !this.showClimaLayers) {
      return;
    }

    const currentZoom = Math.round(this.map.getView().getZoom() || 8);

    // Solo actualizar si el zoom cambió significativamente
    if (Math.abs(currentZoom - this.climaLayerManager.getCurrentZoom()) > 0) {
      console.log(`Zoom cambió a ${currentZoom}, actualizando tiles climáticos...`);

      try {
        // ✅ SOLO actualizar zoom en el manager - OpenLayers maneja automáticamente los tiles
        this.climaLayerManager.setZoom(currentZoom);

        // 🚫 NO recargar la capa - OpenLayers ya solicita automáticamente los tiles del nuevo zoom
        console.log(`📍 Zoom actualizado a ${currentZoom}. OpenLayers cargará automáticamente los tiles necesarios.`);
      } catch (error) {
        console.error('Error actualizando zoom:', error);
      }
    }
  }

  // Polígonos Lotes
  private getColorLote(lote: ILoteMapa) {
    let color = 'rgba(255, 255, 255, 0.6)';
    switch (this.servicioSeleccionado?.label()) {
      case this.translate.instant('Monitoreo de enfermedades'):
        color = lote.colorEnfermedad || color;
        break;
      case this.translate.instant('Requerimiento de riego'):
        color = lote.colorRiego || color;
        break;
      case this.translate.instant('Huella hídrica'):
        color = lote.colorHuella || color;
        break;
      case this.translate.instant('NDVI'):
        color = lote.colorNDVI || color;
        break;
    }
    return color;
  }

  private addPolygonLote(lote: ILoteMapa) {
    const geojson = lote.ubicacion?.geojson as IGeoJSONPolygon;
    const source = this.lotesLayer.getSource();
    const polygon = new Polygon(geojson.coordinates!);
    polygon.transform('EPSG:4326', 'EPSG:3857');
    const feature = new Feature(polygon);
    // Estilo del poligono
    const color = this.getColorLote(lote);
    feature.set('lote', lote);
    feature.set('nombre', lote.nombre);
    feature.set('fillColor', color);
    feature.set('strokeColor', this.helper.darkTheme ? '#000' : '#FFF');
    feature.set('strokeColorSelected', this.helper.darkTheme ? '#FFF' : '#000');
    const style = this.getLoteDefaultStyle(feature);
    feature.setStyle(style);
    source?.addFeature(feature);
  }

  private clearPolygonsLotes() {
    if (!this.map || !this.lotesLayer) {
      console.warn('Mapa o capa de lotes no inicializados aún');
      return;
    }
    const source = this.lotesLayer.getSource();
    source?.clear();
  }

  private getLoteSelectedStyle(feature: FeatureLike) {
    const style = this.getLoteDefaultStyle(feature);
    style.setStroke(
      new Stroke({
        color: feature.get('strokeColorSelected'),
        width: 2,
      })
    );
    return style;
  }

  private getLoteDefaultStyle(feature: FeatureLike) {
    return new Style({
      stroke: new Stroke({
        color: feature.get('strokeColor') || '#000',
        width: 1,
      }),
      fill: new Fill({
        color: feature.get('fillColor') || 'rgba(255, 255, 255, 0.6)',
      }),
      text: new Text({
        text: feature.get('nombre') || '',
        font: 'bold 14px lato',
      }),
    });
  }

  private handleSelectLote() {
    this.selectInteractionLotes = new Select({
      style: (feature) => this.getLoteSelectedStyle(feature),
      condition: click,
      layers: [this.lotesLayer],
    });
    this.selectInteractionLotes.on('select', (e) => {
      e.selected.forEach((f) => {
        const lote = f.get('lote');
        this.loteSeleccionado = lote as ILoteMapa;
        this.changeDetectorRef.detectChanges();
      });
    });
    this.map?.addInteraction(this.selectInteractionLotes);
  }

  private setVectorLayerLotesVisible(visible: boolean) {
    if (!this.lotesLayer) {
      console.warn('Capa de lotes no inicializada para setVisible');
      return;
    }
    this.lotesLayer.setVisible(visible);
  }

  private async redibujarLotes() {
    if (!this.map || !this.lotesLayer) {
      console.warn('Mapa no inicializado, posponiendo redibujado de lotes');
      return;
    }

    this.loading.set(true);
    this.clearPolygonsLotes();
    await Promise.all(
      this.lotes.map(async (lote) => {
        if (lote.ubicacion?.geojson?.coordinates) {
          this.addPolygonLote(lote);
        }
      })
    );
    this.loading.set(false);
  }

  private setBoundsLotes() {
    // Solo hacer fit automático en la primera visita
    if (!this.isFirstVisit) {
      return;
    }

    this.centerMapOnBoundsLotes();
  }

  private getLoteCenter(lote: ILoteMapa): [number, number] | null {
    if (lote.ubicacion?.centro?.lng !== undefined && lote.ubicacion?.centro?.lat !== undefined) {
      return [lote.ubicacion.centro.lng, lote.ubicacion.centro.lat];
    }

    const coords = (lote.ubicacion?.geojson as IGeoJSONPolygon | undefined)?.coordinates?.[0];
    if (!coords?.length) return null;
    const total = coords.reduce(
      (acc, coord) => {
        acc.lng += Number(coord[0]) || 0;
        acc.lat += Number(coord[1]) || 0;
        return acc;
      },
      { lng: 0, lat: 0 }
    );
    return [total.lng / coords.length, total.lat / coords.length];
  }

  private getLotsSpreadKm(): number {
    const centers = this.lotes.map((lote) => this.getLoteCenter(lote)).filter((center): center is [number, number] => !!center);
    if (centers.length < 2) return 0;
    let maxDistance = 0;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        maxDistance = Math.max(maxDistance, this.distanceKm(centers[i], centers[j]));
      }
    }
    return maxDistance;
  }

  private centerMapOnNearestLotes() {
    if (!this.map || !this.currentPosition?.coordinates?.length) {
      return;
    }

    const userCenter = this.currentPosition.coordinates as [number, number];
    const ranked = this.lotes
      .map((lote) => {
        const center = this.getLoteCenter(lote);
        return center ? { lote, distance: this.distanceKm(userCenter, center) } : null;
      })
      .filter((item): item is { lote: ILoteMapa; distance: number } => !!item)
      .sort((a, b) => a.distance - b.distance);

    if (!ranked.length) {
      this.centerMapOnBoundsLotes();
      return;
    }

    const nearestDistance = ranked[0].distance;
    const selectedIds = new Set(
      ranked
        .filter((item, index) => index < 6 || item.distance <= nearestDistance + 80)
        .slice(0, 8)
        .map((item) => item.lote._id)
    );
    const features = this.lotesLayer
      .getSource()
      ?.getFeatures()
      .filter((feature) => selectedIds.has((feature.get('lote') as ILoteMapa | undefined)?._id));

    if (features?.length) {
      const extent = createEmpty();
      features.forEach((feature) => {
        const geometry = feature.getGeometry();
        if (geometry) {
          extendExtent(extent, geometry.getExtent());
        }
      });
      this.map.getView().fit(extent, { padding: [90, 90, 260, 90], duration: 1000 });
    } else {
      this.map.getView().animate({
        center: fromLonLat(this.getLoteCenter(ranked[0].lote)!),
        zoom: this.helper.isHandset ? 13 : 14,
        duration: 1000,
      });
    }

    this.awaitingNearestLotCenter = false;
    setTimeout(() => {
      this.saveMapState();
      this.isFirstVisit = false;
    }, 1100);
  }

  private distanceKm(a: [number, number], b: [number, number]): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const radiusKm = 6371;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * radiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // Método separado que siempre centra en lotes (para uso del botón)
  private centerMapOnBoundsLotes(markAsVisited = true) {
    if (!this.map || !this.lotesLayer) {
      console.warn('Mapa o capa de lotes no inicializados para setBounds');
      return;
    }

    const source = this.lotesLayer.getSource();
    const extent = source?.getExtent();
    // Check that the extent is not infinite
    if (extent && (extent[0] === Infinity || extent[0] === -Infinity)) {
      return;
    }
    if (!extent) return;

    this.map?.getView()?.fit(extent, { padding: [50, 50, 50, 50], duration: 1000 });

    // Guardar la posición después de centrar en los lotes
    setTimeout(() => {
      this.saveMapState();
      if (markAsVisited) {
        this.isFirstVisit = false; // Marcar que ya no es primera visita
      }
    }, 1100);
  }

  private handleMapClick() {
    this.map?.on('click', (evt) => {
      // Detectar si se clickeó sobre algún feature
      const feature = this.map?.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (!feature) {
        // No se clickeó en ningún feature: deseleccionar
        this.selectInteractionLotes?.getFeatures().clear();
        this.loteSeleccionado = undefined;
      }
    });
  }

  // Imágenes NDVI
  private addNdviImage(reporte: IReporteNDVI) {
    if (!reporte.ndviUrl || !reporte.metadataImagen?.geojson) return;
    const extent4326 = reporte.metadataImagen.geojson.coordinates?.[0].reduce(
      (acc, coord) => {
        const [x, y] = coord;
        return [
          Math.min(acc[0], x), // minX
          Math.min(acc[1], y), // minY
          Math.max(acc[2], x), // maxX
          Math.max(acc[3], y), // maxY
        ];
      },
      [Infinity, Infinity, -Infinity, -Infinity]
    ) as Extent;
    const extent = transformExtent(extent4326, 'EPSG:4326', 'EPSG:3857');
    const imageLayer = new ImageLayer({
      source: new Static({
        url: reporte.ndviUrl,
        imageExtent: extent,
        projection: 'EPSG:3857',
      }),
      opacity: 1,
      extent,
    });
    imageLayer.set('loteId', reporte.idLote); // opcional para luego identificarla

    this.ndviLayerGroup?.getLayers().push(imageLayer);
  }

  private clearImagesNdvi() {
    this.ndviLayerGroup?.getLayers().clear();
  }

  private setLayerNdviVisible(visible: boolean) {
    this.ndviLayerGroup.setVisible(visible);
  }

  private setBoundsNdvi() {
    const layers = this.ndviLayerGroup?.getLayers();
    if (!layers || layers.getLength() === 0) return;

    const layersArray = layers.getArray();
    let combinedExtent: Extent | undefined;

    // ✨ CORRECCIÓN: Calcula el extent combinado directamente en 3857
    const firstExtent = layersArray[0]?.getExtent();
    if (!firstExtent) return;

    combinedExtent = [...firstExtent]; // Inicia con el primer extent

    for (let i = 1; i < layersArray.length; i++) {
      const layer = layersArray[i];
      const extent = layer.getExtent();
      if (extent) {
        combinedExtent[0] = Math.min(combinedExtent[0], extent[0]); // minX
        combinedExtent[1] = Math.min(combinedExtent[1], extent[1]); // minY
        combinedExtent[2] = Math.max(combinedExtent[2], extent[2]); // maxX
        combinedExtent[3] = Math.max(combinedExtent[3], extent[3]); // maxY
      }
    }

    // Como los extents de las capas ya están en 3857, no se necesita transformar.
    if (combinedExtent && combinedExtent[0] !== Infinity) {
      this.map?.getView()?.fit(combinedExtent, { padding: [50, 50, 50, 50], duration: 1000 });
    }

    setTimeout(() => {
      this.saveMapState();
    }, 1100);
  }

  private async redibujarImagenes() {
    this.loading.set(true);
    this.clearImagesNdvi();
    await Promise.all(
      this.reportesNDVI.map(async (reporte) => {
        if (reporte.lastReporte?.ndviUrl && reporte.lastReporte?.metadataImagen?.geojson?.coordinates) {
          this.addNdviImage(reporte.lastReporte);
        }
      })
    );
    this.loading.set(false);
  }

  private refreshImagesGroup() {
    // Nunca vi una basura como esta
    const layerGroup = this.map?.getLayerGroup();
    if (!layerGroup) return;
    layerGroup.getLayersArray().forEach((layer) => {
      const source = layer.getSource();
      if (source && typeof source.refresh === 'function') {
        source.refresh();
      }
    });
  }

  // Distribuidor

  private addDistribuidor() {
    if (!this.permiso?.distribuidor?.geojson) return;
    const ubicacion = this.permiso?.distribuidor?.geojson;
    if (!ubicacion.coordinates) return;
    const geojson = ubicacion.coordinates;
    const source = this.distribuidorLayer.getSource();
    const point = new Point(geojson);
    point.transform('EPSG:4326', 'EPSG:3857');
    const feature = new Feature(point);

    // Estilo del punto
    feature.setId(this.permiso?.distribuidor?.nombre);
    feature.set('distribuidor', this.permiso?.distribuidor);
    feature.set('nombre', this.permiso?.distribuidor?.nombre);
    feature.set('name', this.permiso?.distribuidor?.nombre); // Para el estilo de texto
    source?.addFeature(feature);
  }

  // Suelos

  private handleSuelosClick(evt: MapBrowserEvent<any>) {
    const feature = this.map?.forEachFeatureAtPixel(evt.pixel, (feat, layer) => {
      if (layer === this.suelosLayer) {
        return feat;
      }
      return undefined;
    });

    if (feature) {
      const coordinate = evt.coordinate;
      const properties = feature.getProperties();

      // ✨ CORRECCIÓN: Añadimos un título y un div contenedor para el scroll.
      let contentWrapper = '';
      const keysAIgnorar = ['geometry', 'layer', 'ogc_fid', 'new_ncart'];

      for (const key in properties) {
        const valor = properties[key];
        if (valor && valor !== '-' && valor !== 0 && !keysAIgnorar.includes(key)) {
          let keyFormateada = key.replace(/_/g, ' ').replace('sue', 'suelo ');

          // Mejoras específicas para nombres más legibles
          keyFormateada = keyFormateada
            .replace('simbc', 'símbolo cartográfico')
            .replace('tipo uc', 'tipo de unidad')
            .replace('limit ppal', 'limitación principal')
            .replace('limit secu', 'limitación secundaria')
            .replace('ind prod', 'índice productivo')
            .replace('porc suelo 1', 'porcentaje suelo')
            .replace('posi suelo 1', 'posición')
            .replace('orden suelo 1', 'orden')
            .replace('ggrup suelo 1', 'gran grupo')
            .replace('sgrup suelo 1', 'subgrupo')
            .replace('text sups1', 'textura superficial')
            .replace('text bs1', 'textura subsuelo')
            .replace('drenaje s1', 'drenaje')
            .replace('profund s1', 'profundidad')
            .replace('alcalin s1', 'alcalinidad');

          // Formatear valores
          let valorFormateado = valor;
          if (key === 'ind_prod') {
            valorFormateado = `${valor}%`;
          } else if (key === 'profund_s1') {
            valorFormateado = `${valor} cm`;
          }

          contentWrapper += `<div class="property-row">
                          <span class="property-key">${keyFormateada}</span>
                          <span class="property-value">${valorFormateado}</span>
                        </div>`;
        }
      }

      if (contentWrapper === '') {
        contentWrapper = 'No hay datos detallados para esta zona.';
      }

      // Componemos el HTML final con título + contenido
      const finalHtml = `
      <div class="popup-title">Información del Suelo</div>
      <div class="popup-content-wrapper">
        ${contentWrapper}
      </div>
    `;

      this.popupContentElement.innerHTML = finalHtml;
      this.popupOverlay.setPosition(coordinate);
    } else {
      this.popupOverlay.setPosition(undefined);
    }
  }

  public toggleSuelosLayer(): void {
    this.isSuelosLayerVisible = !this.isSuelosLayerVisible;
    this.suelosLayer.setVisible(this.isSuelosLayerVisible);
  }

  // Listados

  private async listarLotes(): Promise<void> {
    const populate: IPopulate[] = [
      {
        path: 'establecimiento',
        select: 'nombre climaActual prediccionClimatica',
      },
      {
        path: 'departamento',
        select: 'nombre idProvincia',
        populate: {
          path: 'provincia',
          select: 'nombre',
        },
      },
      {
        path: 'sondaSuelo',
        select: 'name.custom',
      },
      {
        path: 'siembra',
        populate: [
          {
            path: 'semilla',
          },
          {
            path: 'crono',
          },
        ],
      },
      {
        path: 'dispositivos',
      },
    ];
    const query: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.lotes$?.unsubscribe();
    this.lotes$ = this.listado.subscribe<IListado<ILote>>('lotes', query).subscribe(async (data) => {
      this.lotes = data.datos;

      this.calcularEnfermedades();
      this.calcularRiego();
      this.calcularHuella();

      // SIEMPRE actualiza los poligonos en el mapa
      await this.redibujarLotes();

      // Solo centrar mapa automáticamente en primera visita
      if (this.isFirstVisit) {
        this.centerMapOnFirstVisit();
      }
    });
    await this.listado.getLastValue('lotes', query);
  }

  private async ultimoReportePorLote(): Promise<void> {
    try {
      if (this.loginService.esProductor || this.loginService.esEstablecimiento) {
        this.reportesNDVI = await this.service.ultimoPorLote();
      } else if (this.loginService.esDistribuidor) {
        this.reportesNDVI = await this.service.ultimoPorLotePorDistribuidor();
      } else {
        return;
      }
    } catch (error) {
      console.error('Error al obtener los reportes NDVI:', error);
    }
    if (!this.reportesNDVI?.length) return;

    this.reportesNDVI.map((reporte) => {
      // Agrego la imagen al mapa
      if (reporte.lastReporte?.ndviUrl) {
        this.addNdviImage(reporte.lastReporte);
      }
      const lote = this.lotes.find((lote) => lote._id === reporte?.lastReporte?.idLote);
      // Actualizo el lote con el ndvi promedio
      if (lote && reporte?.lastReporte?.ndviPromedio && reporte.lastReporte?.fechaDelReporte) {
        lote.ndvi = reporte.lastReporte?.ndviPromedio;
        lote.ndviFecha = reporte.lastReporte?.fechaDeLaImagen || reporte.lastReporte?.fechaDelReporte;
        lote.colorNDVI = 'rgba(0, 0, 0, 0)';
      }
    });
  }

  private suscribirReportesNDVI(): void {
    const query: IQueryParam = { limit: 1, sort: '-fechaCreacion' };
    this.reportesNDVI$?.unsubscribe();
    this.reportesNDVI$ = this.listado.subscribe<IListado<IReporteNDVI>>('reportendvis', query).subscribe(async () => {
      await this.ultimoReportePorLote();
      this.redibujarImagenes();
    });
  }

  private async listarEstablecimientos() {
    const query: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      select: 'nombre ubicacion climaActual prediccionClimatica',
    };

    this.establecimientos$?.unsubscribe();
    this.establecimientos$ = this.listado
      .subscribe<IListado<IEstablecimiento>>('establecimientos', query)
      .subscribe(async (data) => {
        this.establecimientos = data.datos;

        // SIEMPRE redibuja los establecimientos en el mapa
        await this.redibujarEstablecimientos();
        // Solo intentar centrar el mapa automáticamente si es primera visita
        if (this.isFirstVisit) {
          this.centerMapOnFirstVisit();
        }
      });
    await this.listado.getLastValue('establecimientos', query);
  }

  // Detalles

  public detallesLote() {
    this.paramsService.set('detallesLote', this.loteSeleccionado);
    this.router.navigate(['lotes', 'detalles', this.loteSeleccionado?._id]);
  }

  public async cargaInicial() {
    await Promise.all([this.listarLotes(), this.listarEstablecimientos()]);
    // Va después porque completo los lotes, fer.
    await this.ultimoReportePorLote();
    // Suscripción reactiva para refrescar imágenes NDVI cuando lleguen nuevos reportes
    this.suscribirReportesNDVI();
    // Agregar el distribuidor al mapa
    this.addDistribuidor();
  }

  // Método público para volver a la ubicación actual del usuario
  public async centerOnUserLocation() {
    try {
      this.currentPosition = await this.helper.getCurrentPosition();
      if (this.map && this.currentPosition?.coordinates) {
        const view = this.map.getView();
        view.animate({
          center: fromLonLat(this.currentPosition.coordinates),
          zoom: this.helper.isHandset ? 14 : 15,
          duration: 1000,
        });

        // Guardar la nueva posición
        setTimeout(() => {
          this.saveMapState();
          if (this.isFirstVisit) {
            this.isFirstVisit = false; // Marcar como visitado si era fallback
          }
        }, 1100);
      }
    } catch (error) {
      console.error('Error al obtener ubicación actual:', error);
    }
  }

  // Método público para centrar el mapa en todos los lotes y establecimientos
  public centerMapOnBounds() {
    if (!this.map) {
      console.warn('Mapa no inicializado para centerMapOnBounds');
      return;
    }

    // Prioridad: centrar en lotes primero, luego establecimientos
    if (this.lotes?.length > 0 && this.lotesLayer) {
      const source = this.lotesLayer.getSource();
      const extent = source?.getExtent();

      if (extent && extent[0] !== Infinity && extent[0] !== -Infinity) {
        this.map?.getView()?.fit(extent, {
          padding: [50, 50, 50, 50],
          duration: 1000,
        });

        // Guardar la nueva posición
        setTimeout(() => {
          this.saveMapState();
        }, 1100);
        return;
      }
    }

    // Si no hay lotes, centrar en establecimientos
    if (this.establecimientos?.length > 0 && this.establecimientosLayer) {
      const source = this.establecimientosLayer.getSource();
      const extent = source?.getExtent();

      if (extent && extent[0] !== Infinity && extent[0] !== -Infinity) {
        this.map?.getView()?.fit(extent, {
          padding: [50, 50, 50, 50],
          duration: 1000,
        });

        // Guardar la nueva posición
        setTimeout(() => {
          this.saveMapState();
        }, 1100);
        return;
      }
    }
  }

  // 🚀 NUEVO: Método para obtener ubicación sin bloquear
  private async obtenerUbicacionEnBackground() {
    try {
      this.currentPosition = await this.helper.getCurrentPosition();

      // Si es primera visita y no hay datos, usar ubicación como fallback
      if (this.isFirstVisit && !this.lotes?.length && !this.establecimientos?.length) {
        this.centerOnUserLocation();
      }
      if (this.awaitingNearestLotCenter && this.lotes?.length) {
        this.centerMapOnNearestLotes();
      }
    } catch (error) {
      console.warn('⚠️ No se pudo obtener ubicación del dispositivo:', error);
      if (this.awaitingNearestLotCenter && this.lotes?.length) {
        this.awaitingNearestLotCenter = false;
        this.isFirstVisit = false;
      }
      // La app sigue funcionando normalmente sin ubicación
    }
  }

  // ========================================
  // MÉTODOS DE CLIMA
  // ========================================

  /**
   * Inicializa el sistema de capas de clima
   */
  private async initClimaSystem(): Promise<void> {
    try {
      // Inicializar el gestor de capas de clima
      this.climaLayerManager = new ClimaLayerManager(this.climaService, this.helper);

      // Cargar variables climáticas disponibles
      this.climaVariables = await this.climaService.getAvailableVariables();
      // Seleccionar temperatura como variable por defecto
      this.climaVariableSeleccionada = this.climaVariables.find((v) => v.id === 'temperature') || null;
    } catch (error) {
      console.error('Error inicializando sistema de clima:', error);
    }
  }

  /**
   * Inicializa las capas de clima en el mapa (DEPRECATED - usar initClimaSystem)
   */
  private initClimaLayers(): void {
    // Este método ahora usa el nuevo sistema
    this.initClimaSystem();
  }

  async toggleClimaLayers(): Promise<void> {
    this.showClimaLayers = !this.showClimaLayers;

    if (this.showClimaLayers) {
      await this.addClimaLayer();
    } else {
      this.removeClimaLayer();
    }
  }

  toggleClimaTilesPanel(): void {
    this.showClimaTilesPanel = !this.showClimaTilesPanel;
  }

  async onClimaVariableChange(event: any): Promise<void> {
    this.climaVariableSeleccionada = event.value;
    if (this.showClimaLayers) {
      await this.updateClimaLayer();
    }
  }

  increaseOpacity(): void {
    this.climaOpacidad = Math.min(1, this.climaOpacidad + 0.1);
    this.updateLayerOpacity();
  }

  decreaseOpacity(): void {
    this.climaOpacidad = Math.max(0.1, this.climaOpacidad - 0.1);
    this.updateLayerOpacity();
  }

  async clearClimaCache(): Promise<void> {
    if (this.climaLayerManager) {
      this.climaLayerManager.clearCache();

      // Si hay capas visibles, recargarlas después de limpiar cache
      if (this.showClimaLayers && this.climaVariableSeleccionada) {
        await this.updateClimaLayer();
      }
    }
  }

  private async addClimaLayer(): Promise<void> {
    if (!this.climaVariableSeleccionada || !this.climaLayerManager || !this.map) return;

    try {
      this.climaTilesLoading = true;
      const startTime = Date.now();

      // Crear la capa usando el nuevo manager y esperar a que se carguen los tiles
      const layer = await this.climaLayerManager.createClimaLayer({
        variable: this.climaVariableSeleccionada.id,
        opacity: this.climaOpacidad,
        visible: true,
        zIndex: 10, // Por encima de suelos (5) pero por debajo de popups
        zoom: Math.round(this.map.getView().getZoom() || 8),
      });

      // Agregar la capa al mapa
      this.map.addLayer(layer);
      this.currentClimaLayer = layer;

      // Asegurar que el spinner sea visible por al menos 500ms para buena UX
      const elapsedTime = Date.now() - startTime;
      const minLoadingTime = 500;
      const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

      if (remainingTime > 0) {
        setTimeout(() => {
          this.climaTilesLoading = false;
        }, remainingTime);
      } else {
        this.climaTilesLoading = false;
      }
    } catch (error) {
      console.error('Error agregando capa de clima:', error);
      this.climaTilesLoading = false;
    }
  }

  private async updateClimaLayer(): Promise<void> {
    this.removeClimaLayer();
    await this.addClimaLayer();
  }

  private removeClimaLayer(): void {
    if (this.currentClimaLayer && this.map) {
      this.map.removeLayer(this.currentClimaLayer);
      this.currentClimaLayer = null;
    }
  }

  private updateLayerOpacity(): void {
    if (this.currentClimaLayer && this.climaVariableSeleccionada && this.climaLayerManager) {
      this.climaLayerManager.setLayerOpacity(this.climaVariableSeleccionada.id, this.climaOpacidad);
    }
  }

  /**
   * Obtiene la leyenda de la variable climática seleccionada
   */
  getClimaLeyenda(): { label: string; color: string; value: string }[] | null {
    if (!this.climaVariableSeleccionada || !this.showClimaLayers) {
      return null;
    }

    return this.climaLegendas[this.climaVariableSeleccionada.id] || null;
  }

  /// GHOOOOKS

  async ngOnInit() {
    this.loading.set(true);

    // Al entrar al mapa despues del login, priorizamos lotes/cercania por sobre un estado viejo guardado.
    this.isFirstVisit = true;

    // 🚀 OPTIMIZACIÓN: Obtener ubicación en background sin bloquear la carga inicial
    this.obtenerUbicacionEnBackground();

    this.permiso = this.helper.permiso;

    // Inicializar sistema de capas de clima
    await this.initClimaSystem();

    // NO llamar initMap aquí - se llamará en ngAfterViewInit

    this.activatedRoute.queryParams.subscribe(async (params) => {
      await this.cargaInicial();
      // Establecer el establecimiento más cercano inmediatamente después de cargar los datos
      this.moveEnd();
    });
    this.loading.set(false);
  }

  ngOnDestroy(): void {
    this.removeClimaLayer();
    this.lotes$?.unsubscribe();
    this.establecimientos$?.unsubscribe();
    this.reportesNDVI$?.unsubscribe();
  }

  ngAfterViewInit() {
    // Inicializar el mapa después de que la vista esté completamente renderizada
    // Esto es especialmente importante en iOS donde el WebView puede tardar más en renderizar
    setTimeout(() => {
      this.initMap();
    }, 200);
  }
}
