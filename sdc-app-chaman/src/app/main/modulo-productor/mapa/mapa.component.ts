import { animate, style, transition, trigger } from '@angular/animations';
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
  esCultivoPerenne,
} from 'modelos/src';
import { Feature, Map, MapBrowserEvent, Overlay, View } from 'ol';
import { click } from 'ol/events/condition';
import { Extent } from 'ol/extent';
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
import { EstadoRiegoMapa, evaluarRiegoMapa } from './mapa-riego-evidence';
import { evaluarSanidadFrontend } from '../lotes/sanidad-evidence';

interface IServicio {
  label: () => string;
  icon: string;
  primeIcon?: string;
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
  estadoRiegoMapa?: EstadoRiegoMapa;
  colorHuella?: string;
  severityHuella?: string;
  iconHuella?: string;
  ndvi?: number;
  ndviFecha?: string;
}

interface IGrupoAmbientesMapa {
  key: string;
  cultivo: string;
  establecimiento?: string;
  lotes: ILoteMapa[];
  variedades: string[];
  representanteId: string;
}

interface IResumenGerencialMetric {
  label: string;
  valor: string;
  detalle: string;
  icon: string;
  tono: 'ok' | 'warn' | 'risk' | 'neutral';
  progreso?: number;
  soporte?: string;
}

interface IResumenGerencialEstablecimiento {
  id: string;
  nombre: string;
  lotes: number;
  siembras: number;
  perennes: number;
  hectareas: string;
  estado: IResumenGerencialMetric;
  clima: IResumenGerencialMetric[];
  metricas: IResumenGerencialMetric[];
}

interface IMapaContexto {
  establecimientoId?: string;
  establecimientoNombre?: string;
  loteId?: string;
  loteNombre?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-mapa',
  imports: [SharedModule, DrawerClimaComponent],
  templateUrl: './mapa.component.html',
  styleUrl: './mapa.component.scss',
  animations: [
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
  getSeverity(severity: string | undefined): 'error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast' {
    const validSeverities = ['error', 'success', 'info', 'warn', 'secondary', 'contrast'];
    return validSeverities.includes(severity || '') ? (severity as any) : 'info';
  }
  private translate = inject(TranslateService);

  public map?: Map;
  private currentPosition?: IGeoJSONPoint;

  public loading = signal(false);

  private isFirstVisit = true; // Para controlar si es la primera visita
  private initialDataLoaded = false;
  private readonly mapaContextoPrefix = 'chaman:mapa:contexto';

  public establecimientos$?: Subscription;
  public establecimientos: IEstablecimiento[] = [];
  public establecimientoSeleccionado?: IEstablecimiento;
  public lotes$?: Subscription;
  public lotes: ILoteMapa[] = [];
  public loteSeleccionado?: ILoteMapa;
  public grupoAmbientesSeleccionado?: IGrupoAmbientesMapa;
  private gruposAmbientes = new globalThis.Map<string, IGrupoAmbientesMapa>();
  private grupoAmbientePorLote = new globalThis.Map<string, IGrupoAmbientesMapa>();

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
    {
      label: () => this.translate.instant('Horas frio'),
      icon: 'plantas',
      primeIcon: 'pi pi-clock',
      backgroudColor: 'var(--p-success-color)',
      color: 'white',
    },
    {
      label: () => this.translate.instant('Riesgo de heladas'),
      icon: 'plantas',
      primeIcon: 'pi pi-snowflake',
      backgroudColor: 'var(--p-success-color)',
      color: 'white',
    },
  ];

  // Helper methods for severity validation
  getValidSeverityRiego(): 'error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast' | null {
    const validSeverities: ('error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast')[] = [
      'error',
      'success',
      'info',
      'warn',
      'secondary',
      'contrast',
    ];
    return validSeverities.includes(this.loteSeleccionado?.severityRiego as any)
      ? (this.loteSeleccionado?.severityRiego as any)
      : null;
  }

  getValidSeverityHuella(): 'error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast' | null {
    const validSeverities: ('error' | 'success' | 'info' | 'warn' | 'secondary' | 'contrast')[] = [
      'error',
      'success',
      'info',
      'warn',
      'secondary',
      'contrast',
    ];
    return validSeverities.includes(this.loteSeleccionado?.severityHuella as any)
      ? (this.loteSeleccionado?.severityHuella as any)
      : null;
  }

  public servicioSeleccionado: IServicio = this.servicios[0];
  public showDrawerClima = false;
  public showResumenGerencial = false;
  public resumenSeleccionadoId?: string;

  // Datos para el panel de enfermedades
  public enfermedades = {
    cantRojo: 0,
    cantAmarillo: 0,
    cantVerde: 0,
    cantSinDatos: 0,
    haRojo: 0,
    haAmarillo: 0,
    haVerde: 0,
    haSinDatos: 0,
  };
  // Datos para el panel de riego
  public riego = {
    cantRojo: 0,
    cantAmarillo: 0,
    cantVerde: 0,
    haRojo: 0,
    haAmarillo: 0,
    haVerde: 0,
    cantSinDatos: 0,
    haSinDatos: 0,
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

  private getMapaContextoKey(): string {
    const user = this.helper.user as any;
    const permiso = this.permiso as any;
    const userKey =
      user?._id ||
      user?.id ||
      user?.usuario ||
      user?.email ||
      permiso?._id ||
      permiso?.idProductor ||
      permiso?.idEstablecimiento ||
      permiso?.idDistribuidor ||
      permiso?.idQuimica ||
      'anonimo';
    return `${this.mapaContextoPrefix}:${userKey}`;
  }

  private leerContextoMapa(): IMapaContexto | undefined {
    try {
      const raw = sessionStorage.getItem(this.getMapaContextoKey());
      return raw ? (JSON.parse(raw) as IMapaContexto) : undefined;
    } catch {
      return undefined;
    }
  }

  private guardarContextoMapa(contexto: IMapaContexto): void {
    sessionStorage.setItem(
      this.getMapaContextoKey(),
      JSON.stringify({
        ...contexto,
        updatedAt: new Date().toISOString(),
      })
    );
  }

  private limpiarContextoMapa(): void {
    sessionStorage.removeItem(this.getMapaContextoKey());
  }

  private getEstablecimientoId(establecimiento?: IEstablecimiento): string | undefined {
    return establecimiento?._id || establecimiento?.nombre;
  }

  private buscarEstablecimiento(id?: string, nombre?: string): IEstablecimiento | undefined {
    return this.establecimientos.find((establecimiento) => {
      const idMatch = !!id && (establecimiento._id === id || establecimiento.nombre === id);
      const nombreMatch = !!nombre && establecimiento.nombre === nombre;
      return idMatch || nombreMatch;
    });
  }

  private buscarLote(id?: string, nombre?: string): ILoteMapa | undefined {
    return this.lotes.find((lote) => {
      const idMatch = !!id && lote._id === id;
      const nombreMatch = !!nombre && lote.nombre === nombre;
      return idMatch || nombreMatch;
    });
  }

  private getEstablecimientoDelLote(lote?: ILoteMapa): IEstablecimiento | undefined {
    if (!lote) {
      return undefined;
    }
    return (
      this.buscarEstablecimiento(lote.idEstablecimiento, lote.establecimiento?.nombre) ||
      this.buscarEstablecimiento(lote.establecimiento?._id, lote.establecimiento?.nombre)
    );
  }

  private guardarContextoEstablecimiento(establecimiento: IEstablecimiento, lote?: ILoteMapa): void {
    this.guardarContextoMapa({
      establecimientoId: this.getEstablecimientoId(establecimiento),
      establecimientoNombre: establecimiento.nombre,
      loteId: lote?._id,
      loteNombre: lote?.nombre,
    });
  }

  private getEstablecimientoDesdeContexto(): IEstablecimiento | undefined {
    const contexto = this.leerContextoMapa();
    if (!contexto) {
      return undefined;
    }

    const lote = this.buscarLote(contexto.loteId, contexto.loteNombre);
    const establecimientoDelLote = this.getEstablecimientoDelLote(lote);
    return (
      establecimientoDelLote || this.buscarEstablecimiento(contexto.establecimientoId, contexto.establecimientoNombre)
    );
  }

  private sincronizarSeleccionConDatos(): void {
    if (this.loteSeleccionado) {
      const loteActualizado = this.buscarLote(this.loteSeleccionado._id, this.loteSeleccionado.nombre);
      if (loteActualizado) {
        this.loteSeleccionado = loteActualizado;
        this.establecimientoSeleccionado =
          this.getEstablecimientoDelLote(loteActualizado) || this.establecimientoSeleccionado;
      } else {
        this.loteSeleccionado = undefined;
      }
    }

    if (this.establecimientoSeleccionado) {
      this.establecimientoSeleccionado =
        this.buscarEstablecimiento(this.establecimientoSeleccionado._id, this.establecimientoSeleccionado.nombre) ||
        this.establecimientoSeleccionado;
    }

    if (!this.establecimientoSeleccionado) {
      this.establecimientoSeleccionado = this.getEstablecimientoDesdeContexto();
    }

    if (this.establecimientoSeleccionado) {
      this.selectEstablecimiento(this.establecimientoSeleccionado.nombre);
    }
  }

  // El mapa arranca en una posicion neutra y luego se encuadra con datos reales.
  private getInitialMapPosition(): { center: number[]; zoom: number } {
    const zoom = this.helper.isHandset ? 14 : 15;
    return {
      center: [-64.18105, -31.413801], // Coordenadas por defecto de Córdoba - NO usar ubicación del dispositivo aquí
      zoom,
    };
  }

  // Método para centrar el mapa en la primera visita según prioridad
  private centerMapOnFirstVisit() {
    if (!this.isFirstVisit) {
      return;
    }

    if (!this.initialDataLoaded) {
      return;
    }

    this.sincronizarSeleccionConDatos();
    const establecimientoInicial = this.getEstablecimientoInicial();
    if (establecimientoInicial) {
      this.seleccionarEstablecimiento(establecimientoInicial, true, {
        preserveSelection: true,
        persist: !this.leerContextoMapa(),
      });
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

  private getEstablecimientoInicial(): IEstablecimiento | undefined {
    if (this.establecimientoSeleccionado) {
      return this.establecimientoSeleccionado;
    }
    const establecimientoContexto = this.getEstablecimientoDesdeContexto();
    if (establecimientoContexto) {
      return establecimientoContexto;
    }
    const establecimientoConLotes = this.establecimientos.find((establecimiento) => {
      return this.lotesDeEstablecimiento(establecimiento).length > 0;
    });
    return establecimientoConLotes || this.establecimientos[0];
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

    this.isFirstVisit = false;
  }

  private calcularEnfermedades() {
    this.enfermedades = {
      cantRojo: 0,
      cantAmarillo: 0,
      cantVerde: 0,
      cantSinDatos: 0,
      haRojo: 0,
      haAmarillo: 0,
      haVerde: 0,
      haSinDatos: 0,
    };
    let maxRiesgoTotal = 0;
    this.lotes.forEach((lote) => {
      const has = Math.trunc(lote?.ubicacion?.superficie || 0);
      const evidencia = evaluarSanidadFrontend(lote.siembra);
      if (!evidencia.operativas.length) {
        this.enfermedades.cantSinDatos++;
        this.enfermedades.haSinDatos += has;
        lote.colorEnfermedad = 'rgba(100, 116, 139, 0.45)';
        return;
      }
      let maxRiesgo = 0; // Riesgo bajo (verde)
      evidencia.operativas.forEach((prediccion) => {
        const nivel = this.nivelRiesgoEnfermedad(lote, prediccion.resultado || 0);
        if (nivel === 2) {
          maxRiesgo = Math.max(maxRiesgo, 2); // Riesgo alto (rojo)
        } else if (nivel === 1) {
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
    } else if (this.enfermedades.cantSinDatos && !this.enfermedades.cantVerde) {
      this.servicios[0].backgroudColor = 'var(--p-surface-500)';
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
      cantSinDatos: 0,
      haSinDatos: 0,
    };
    let regarHoyTotal: boolean = false;
    let regarAlgunDiaTotal: boolean = false;
    this.lotes.forEach((lote) => {
      const has = Math.trunc(lote?.ubicacion?.superficie || 0);
      const evidencia = evaluarRiegoMapa(lote);
      const regarHoy = evidencia.estado === 'hoy';
      const regarAlgunDia = evidencia.estado === 'proximo';
      lote.estadoRiegoMapa = evidencia.estado;
      lote.sumaRiego = evidencia.suma ?? undefined;
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
      } else if (evidencia.estado === 'sin_aporte') {
        this.riego.cantVerde++;
        this.riego.haVerde += has;
        lote.colorRiego = 'rgba(34, 197, 94, 0.6)';
        lote.severityRiego = 'success';
        lote.iconRiego = 'pi pi-check';
      } else {
        this.riego.cantSinDatos++;
        this.riego.haSinDatos += has;
        lote.colorRiego = 'rgba(148, 163, 184, 0.45)';
        lote.severityRiego = 'secondary';
        lote.iconRiego = 'pi pi-question-circle';
      }

      regarHoyTotal = regarHoyTotal || regarHoy;
      regarAlgunDiaTotal = regarAlgunDiaTotal || regarAlgunDia;
    });

    // Cambia el color en el selector de servicios segun el riesgo
    if (regarHoyTotal) {
      this.servicios[1].backgroudColor = 'var(--p-danger-color)';
    } else if (regarAlgunDiaTotal) {
      this.servicios[1].backgroudColor = 'var(--p-warning-color)';
    } else if (this.riego.cantVerde) {
      this.servicios[1].backgroudColor = 'var(--p-success-color)';
    } else {
      this.servicios[1].backgroudColor = 'var(--p-surface-400)';
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

  public abrirResumenGerencial(): void {
    const resumenes = this.resumenGerencialEstablecimientos();
    const establecimientoActualId = this.establecimientoSeleccionado?._id || this.establecimientoSeleccionado?.nombre;
    const actual = resumenes.find((resumen) => resumen.id === establecimientoActualId);
    const seleccionadoValido = resumenes.some((resumen) => resumen.id === this.resumenSeleccionadoId);
    this.resumenSeleccionadoId = seleccionadoValido ? this.resumenSeleccionadoId : actual?.id || resumenes[0]?.id;
    this.showResumenGerencial = true;
  }

  public seleccionarResumenEstablecimiento(id: string): void {
    this.resumenSeleccionadoId = id;
  }

  public resumenGerencialActivo(): IResumenGerencialEstablecimiento | undefined {
    const resumenes = this.resumenGerencialEstablecimientos();
    return resumenes.find((resumen) => resumen.id === this.resumenSeleccionadoId) || resumenes[0];
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
        return servicio.primeIcon === 'pi pi-clock'
          ? 'Horas frio'
          : servicio.primeIcon === 'pi pi-snowflake'
            ? 'Heladas'
            : 'NDVI';
      default:
        return servicio.label();
    }
  }

  public climaZonaNombre(): string {
    return this.establecimientoSeleccionado?.nombre || 'Zona del mapa';
  }

  public establecimientoResumen(): string {
    const lotes = this.lotesDeEstablecimientoActual();
    if (!lotes.length) {
      return `${this.lotes.length} lotes cargados`;
    }
    const hectareas = lotes.reduce((acc, lote) => acc + (this.numero(lote.ubicacion?.superficie) || 0), 0);
    return `${lotes.length} lotes / ${this.formatNumber(hectareas, 0)} ha`;
  }

  public resumenEstablecimiento(establecimiento: IEstablecimiento): string {
    const lotes = this.lotesDeEstablecimiento(establecimiento);
    const hectareas = lotes.reduce((acc, lote) => acc + (this.numero(lote.ubicacion?.superficie) || 0), 0);
    if (!lotes.length) {
      return 'sin lotes';
    }
    return `${lotes.length} lotes / ${this.formatNumber(hectareas, 0)} ha`;
  }

  public resumenGerencialEstablecimientos(): IResumenGerencialEstablecimiento[] {
    if (!this.establecimientos.length && this.lotes.length) {
      return [
        this.crearResumenGerencial(
          {
            _id: 'zona-mapa',
            nombre: 'Zona del mapa',
          } as IEstablecimiento,
          this.lotes
        ),
      ];
    }

    return this.establecimientos.map((establecimiento) =>
      this.crearResumenGerencial(establecimiento, this.lotesDeEstablecimiento(establecimiento))
    );
  }

  public seleccionarEstablecimiento(
    establecimiento: IEstablecimiento,
    markAsVisited = true,
    options: { preserveSelection?: boolean; persist?: boolean } = {}
  ): void {
    this.establecimientoSeleccionado = establecimiento;
    if (!options.preserveSelection) {
      this.loteSeleccionado = undefined;
      this.grupoAmbientesSeleccionado = undefined;
    }
    if (options.persist !== false) {
      this.guardarContextoEstablecimiento(
        establecimiento,
        options.preserveSelection ? this.loteSeleccionado : undefined
      );
    }
    this.selectEstablecimiento(establecimiento.nombre);
    this.centerMapOnEstablecimiento(establecimiento, markAsVisited);
    this.changeDetectorRef.detectChanges();
  }

  public centerAllEstablecimientos(): void {
    this.loteSeleccionado = undefined;
    this.grupoAmbientesSeleccionado = undefined;
    this.establecimientoSeleccionado = undefined;
    this.limpiarContextoMapa();
    this.centerMapOnBounds();
    this.isFirstVisit = false;
    this.changeDetectorRef.detectChanges();
  }

  public climaTemperaturaActual(): string {
    const actual = this.getClimaActual();
    const pronostico = this.getPronosticoActualFallback();
    const valor =
      actual?.temperatura?.last ??
      actual?.temperatura?.avg ??
      pronostico?.temperatura?.avg ??
      pronostico?.temperatura?.max ??
      pronostico?.temperatura?.min;
    return this.formatMetric(valor, 'C', 1);
  }

  public climaHumedadActual(): string {
    const actual = this.getClimaActual();
    const pronostico = this.getPronosticoActualFallback();
    const valor =
      actual?.humedad?.last ??
      actual?.humedad?.avg ??
      pronostico?.humedad?.avg ??
      pronostico?.humedad?.max ??
      pronostico?.humedad?.min;
    return this.formatMetric(valor, '%', 0);
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
      ...pronosticos
        .slice(0, 3)
        .map((item) => this.numero(item?.velocidadViento?.max ?? item?.velocidadViento?.avg) || 0),
      0
    );
    const actual =
      this.numero(this.getClimaActual()?.velocidadViento?.last ?? this.getClimaActual()?.velocidadViento?.avg) || 0;
    return this.formatMetric(Math.max(actual, maxPronostico), 'km/h', 0);
  }

  public riesgoMapaEstado(): string {
    if (this.enfermedades.cantRojo) {
      return `${this.enfermedades.cantRojo} en alto`;
    }
    if (this.enfermedades.cantAmarillo) {
      return `${this.enfermedades.cantAmarillo} en observación`;
    }
    if (this.enfermedades.cantSinDatos) {
      return `${this.enfermedades.cantSinDatos} en seguimiento`;
    }
    if (this.enfermedades.cantVerde) {
      return `${this.enfermedades.cantVerde} sin necesidades`;
    }
    return 'Sin datos';
  }

  public riesgoHectareas(tipo: 'verde' | 'amarillo' | 'rojo'): string {
    const hectareas =
      tipo === 'rojo'
        ? this.enfermedades.haRojo
        : tipo === 'amarillo'
          ? this.enfermedades.haAmarillo
          : this.enfermedades.haVerde;
    return `${this.formatNumber(hectareas || 0, 0)} ha`;
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

  public loteTitulo(lote?: ILoteMapa): string {
    const nombre = String((lote || this.loteSeleccionado)?.nombre || '').trim();
    if (!nombre) {
      return 'Lote sin nombre';
    }
    return /^lote\b/i.test(nombre) ? nombre : `Lote ${nombre}`;
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

  public nombreAmbienteListado(index: number): string {
    return `Ambiente ${index + 1}`;
  }

  public variedadAmbiente(lote?: ILoteMapa): string {
    const semilla = lote?.siembra?.semilla;
    return (
      [semilla?.variedad, semilla?.semillero, this.helper.translateCiclo(semilla?.ciclo)].filter(Boolean).join(' ') ||
      lote?.nombre ||
      'Sin variedad'
    );
  }

  public variedadesAmbientesTexto(grupo?: IGrupoAmbientesMapa): string {
    return grupo?.variedades?.length ? grupo.variedades.join(', ') : 'Sin variedades cargadas';
  }

  public cerrarGrupoAmbientes(): void {
    this.grupoAmbientesSeleccionado = undefined;
    this.selectInteractionLotes?.getFeatures().clear();
  }

  public cerrarResumenLote(): void {
    this.loteSeleccionado = undefined;
    this.selectInteractionLotes?.getFeatures().clear();
    if (this.establecimientoSeleccionado) {
      this.guardarContextoEstablecimiento(this.establecimientoSeleccionado);
    }
  }

  public entrarAmbiente(lote: ILoteMapa): void {
    this.grupoAmbientesSeleccionado = undefined;
    this.loteSeleccionado = lote;
    const establecimiento = this.getEstablecimientoDelLote(lote);
    if (establecimiento) {
      this.establecimientoSeleccionado = establecimiento;
      this.guardarContextoEstablecimiento(establecimiento, lote);
    }
    this.detallesLote(lote);
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
    const evidencia = evaluarSanidadFrontend((lote || this.loteSeleccionado)?.siembra);
    if (evidencia.principal) {
      return `${evidencia.principal.enfermedad}: ${this.formatNumber(evidencia.principal.resultado || 0, 0)}%`;
    }
    if (evidencia.noAgregables.length) {
      return `${evidencia.noAgregables.length} lectura${evidencia.noAgregables.length === 1 ? '' : 's'} en revision; sin alerta automatica`;
    }
    if (!evidencia.todas.length) {
      return 'Sin prediccion reciente';
    }
    return 'Prediccion no vigente; actualizar monitoreo';
  }

  public loteEnfermedadNivel(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    const max = this.maxRiesgoEnfermedad(seleccionado);
    if (max === null) {
      return evaluarSanidadFrontend(seleccionado?.siembra).todas.length ? 'En seguimiento' : 'Pendiente';
    }
    const nivel = this.nivelRiesgoEnfermedad(seleccionado, max);
    if (nivel === 2) return 'Riesgo alto';
    if (nivel === 1) return 'Riesgo medio';
    return 'Riesgo bajo';
  }

  public loteEnfermedadPercent(lote?: ILoteMapa): number {
    const seleccionado = lote || this.loteSeleccionado;
    const max = this.maxRiesgoEnfermedad(seleccionado);
    return max === null ? 0 : this.progresoRiesgoEnfermedad(seleccionado, max);
  }

  public loteEnfermedadesOperativas(lote?: ILoteMapa) {
    return evaluarSanidadFrontend((lote || this.loteSeleccionado)?.siembra).operativas;
  }

  public loteRiegoResumen(lote?: ILoteMapa): string {
    const seleccionado = lote || this.loteSeleccionado;
    if (!seleccionado?.siembra) {
      return 'Sin siembra';
    }
    if (seleccionado?.sumaRiego && seleccionado.sumaRiego > 0) {
      return `${this.formatNumber(seleccionado.sumaRiego, 1)} mm sugeridos`;
    }
    if (seleccionado.estadoRiegoMapa === 'sin_datos') {
      return 'Sin datos suficientes';
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
      'Franco limoso': 1.07,
      Limoso: 1.02,
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
    this.paramsService.set('editLote', this.loteSeleccionado);
    this.router.navigate(['lotes', 'editar', this.loteSeleccionado._id]);
  }

  private crearResumenGerencial(
    establecimiento: IEstablecimiento,
    lotes: ILoteMapa[]
  ): IResumenGerencialEstablecimiento {
    const hectareas = lotes.reduce((acc, lote) => acc + (this.numero(lote.ubicacion?.superficie) || 0), 0);
    const sembrados = lotes.filter((lote) => !!lote.siembra).length;
    const perennes = lotes.filter((lote) => this.esLotePerenne(lote)).length;
    const metricas = [
      this.resumenEnfermedadesGerencial(lotes, sembrados),
      this.resumenRiegoGerencial(lotes),
      this.resumenHuellaGerencial(lotes),
      this.resumenNdviGerencial(lotes),
      this.resumenFrioGerencial(lotes, perennes),
      this.resumenHeladaGerencial(establecimiento, lotes, perennes),
    ];

    return {
      id: establecimiento._id || establecimiento.nombre || 'establecimiento-sin-id',
      nombre: establecimiento.nombre || 'Establecimiento sin nombre',
      lotes: lotes.length,
      siembras: sembrados,
      perennes,
      hectareas: `${this.formatNumber(hectareas, 0)} ha`,
      estado: this.resumenEstadoGerencial(metricas, lotes),
      clima: this.resumenClimaGerencial(establecimiento),
      metricas,
    };
  }

  private resumenEstadoGerencial(metricas: IResumenGerencialMetric[], lotes: ILoteMapa[]): IResumenGerencialMetric {
    if (!lotes.length) {
      return this.metric(
        'Estado',
        'Sin lotes',
        'Todavia no hay superficie cargada en este establecimiento.',
        'pi pi-map-marker',
        'neutral'
      );
    }

    const criticos = metricas.filter((metric) => metric.tono === 'risk').length;
    const atencion = metricas.filter((metric) => metric.tono === 'warn').length;

    if (criticos) {
      return this.metric(
        'Estado',
        'Alerta',
        `${criticos} indicador${criticos > 1 ? 'es' : ''} critico${criticos > 1 ? 's' : ''}. Revisar este establecimiento hoy.`,
        'pi pi-exclamation-triangle',
        'risk'
      );
    }

    if (atencion) {
      return this.metric(
        'Estado',
        'Atencion',
        `${atencion} indicador${atencion > 1 ? 'es' : ''} en observacion. No requiere alarma, pero si seguimiento.`,
        'pi pi-info-circle',
        'warn'
      );
    }

    return this.metric(
      'Estado',
      'Operativo normal',
      'Sin alertas altas con la informacion cargada y los calculos disponibles.',
      'pi pi-check-circle',
      'ok'
    );
  }

  private resumenEnfermedadesGerencial(lotes: ILoteMapa[], sembrados: number): IResumenGerencialMetric {
    const lotesConRiesgo = lotes
      .map((lote) => ({ lote, riesgo: this.maxRiesgoEnfermedad(lote) }))
      .filter((item): item is { lote: ILoteMapa; riesgo: number } => item.riesgo !== null);
    const extensivos = lotes.filter((lote) => this.esCultivoExtensivo(lote));
    const altos = lotesConRiesgo.filter((item) => this.nivelRiesgoEnfermedad(item.lote, item.riesgo) === 2);
    const medios = lotesConRiesgo.filter((item) => this.nivelRiesgoEnfermedad(item.lote, item.riesgo) === 1);

    if (!sembrados) {
      return this.metric(
        'Enfermedades',
        'Sin siembras',
        'Todavia no hay cultivos activos para monitoreo sanitario.',
        'pi pi-shield',
        'neutral',
        0
      );
    }
    if (!lotesConRiesgo.length) {
      const detalle = extensivos.length
        ? `${this.cultivosResumen(extensivos)} en monitoreo. Actualizar riesgo para cruzar clima, cultivo y etapa.`
        : 'Sin predicciones recientes de riesgo sanitario en cultivos activos.';
      return this.metric('Enfermedades', `${sembrados} activos`, detalle, 'pi pi-shield', 'neutral', 8);
    }
    const peor = lotesConRiesgo.reduce((max, item) => (item.riesgo > max.riesgo ? item : max));
    const progreso = this.progresoRiesgoEnfermedad(peor.lote, peor.riesgo);
    if (altos.length) {
      return this.metric(
        'Enfermedades',
        `${this.formatNumber(peor.riesgo, 0)}%`,
        `${altos.length} lote${altos.length > 1 ? 's' : ''} con riesgo alto. Prioridad: ${peor.lote.nombre || 'lote sin nombre'}.`,
        'pi pi-shield',
        'risk',
        progreso,
        medios.length ? `${medios.length} en riesgo medio` : 'Riesgo sanitario alto'
      );
    }
    if (medios.length) {
      return this.metric(
        'Enfermedades',
        `${this.formatNumber(peor.riesgo, 0)}%`,
        `${medios.length} lote${medios.length > 1 ? 's' : ''} en riesgo medio. Revisar humedad, etapa fenologica y aplicaciones.`,
        'pi pi-shield',
        'warn',
        progreso
      );
    }
    return this.metric(
      'Enfermedades',
      'Sin alertas altas',
      `${lotesConRiesgo.length} lote${lotesConRiesgo.length > 1 ? 's' : ''} con lectura sanitaria reciente.`,
      'pi pi-shield',
      'ok',
      progreso
    );
  }

  private resumenRiegoGerencial(lotes: ILoteMapa[]): IResumenGerencialMetric {
    const lotesEvaluables = lotes.filter((lote) => lote.estadoRiegoMapa && lote.estadoRiegoMapa !== 'sin_datos');
    const lotesConRiego = lotes.filter((lote) => (this.numero(lote.sumaRiego) || 0) > 0);
    const mm = lotesConRiego.reduce((acc, lote) => acc + (this.numero(lote.sumaRiego) || 0), 0);
    if (!lotes.length) {
      return this.metric('Riego', 'Sin lotes', 'No hay superficie cargada para evaluar.', 'pi pi-tint', 'neutral', 0);
    }
    if (!lotesEvaluables.length) {
      return this.metric(
        'Riego',
        'Sin datos concluyentes',
        'Falta cerrar el balance hidrico; no se declara necesidad ni ausencia de riego.',
        'pi pi-tint',
        'neutral',
        0
      );
    }
    if (!lotesConRiego.length) {
      return this.metric(
        'Riego',
        'Sin aporte calculado',
        `${lotesEvaluables.length} lote${lotesEvaluables.length > 1 ? 's' : ''} con balance valido sin aporte en la ventana.`,
        'pi pi-tint',
        'ok',
        5
      );
    }
    return this.metric(
      'Riego',
      `${this.formatNumber(mm, 1)} mm`,
      `${lotesConRiego.length} lote${lotesConRiego.length > 1 ? 's' : ''} con recomendacion activa.`,
      'pi pi-tint',
      mm >= 30 ? 'risk' : 'warn',
      Math.min(100, Math.max(12, (mm / 40) * 100))
    );
  }

  private resumenHuellaGerencial(lotes: ILoteMapa[]): IResumenGerencialMetric {
    const valores = lotes
      .map((lote) => this.numero(lote.huellaHidrica?.total?.litrosKg))
      .filter((valor): valor is number => valor !== null && valor > 0);
    if (!lotes.length) {
      return this.metric(
        'Huella',
        'Sin lotes',
        'No hay lotes cargados para seguimiento hidrico.',
        'pi pi-compass',
        'neutral',
        0
      );
    }
    if (!valores.length) {
      return this.metric(
        'Huella',
        'En seguimiento',
        'Acumula lluvia, riego y aplicaciones durante la campana.',
        'pi pi-compass',
        'neutral',
        18
      );
    }
    const promedio = valores.reduce((acc, valor) => acc + valor, 0) / valores.length;
    return this.metric(
      'Huella',
      `${this.formatNumber(promedio, 0)} l/kg`,
      `Promedio en ${valores.length} lote${valores.length > 1 ? 's' : ''} con calculo consolidado.`,
      'pi pi-compass',
      'ok',
      65
    );
  }

  private resumenNdviGerencial(lotes: ILoteMapa[]): IResumenGerencialMetric {
    const valores = lotes.map((lote) => this.numero(lote.ndvi)).filter((valor): valor is number => valor !== null);
    if (!valores.length) {
      return this.metric(
        'NDVI',
        'Sin escena',
        'Todavia no hay lectura satelital util para los lotes.',
        'pi pi-sparkles',
        'neutral',
        0
      );
    }
    const promedio = valores.reduce((acc, valor) => acc + valor, 0) / valores.length;
    const tono: IResumenGerencialMetric['tono'] = promedio < 0.18 ? 'risk' : promedio < 0.28 ? 'warn' : 'ok';
    return this.metric(
      'NDVI',
      this.formatNumber(promedio, 3),
      `Promedio de ${valores.length} lote${valores.length > 1 ? 's' : ''} con escena procesada.`,
      'pi pi-sparkles',
      tono,
      Math.min(100, Math.max(8, promedio * 100))
    );
  }

  private resumenFrioGerencial(lotes: ILoteMapa[], perennes: number): IResumenGerencialMetric {
    if (!perennes) {
      return this.metric(
        'Horas frio',
        'No aplica',
        'Solo se muestra para frutales y cultivos perennes.',
        'pi pi-clock',
        'neutral',
        0
      );
    }
    const avances = lotes
      .filter((lote) => this.esLotePerenne(lote))
      .map((lote) => this.avanceFrioLote(lote))
      .filter(Boolean) as Array<{
      lote: string;
      metric: string;
      actual: number;
      objetivo: number;
      progreso: number;
    }>;

    if (!avances.length) {
      return this.metric(
        'Horas frio',
        'Sin consolidar',
        'El resumen del mapa no recibio acumulado y objetivo comparables; verificar la tarjeta termica de cada lote.',
        'pi pi-clock',
        'neutral',
        0
      );
    }

    const peor = avances.reduce((min, item) => (item.progreso < min.progreso ? item : min));
    const tono: IResumenGerencialMetric['tono'] = peor.progreso >= 85 ? 'ok' : peor.progreso >= 50 ? 'warn' : 'risk';
    return this.metric(
      'Horas frio',
      `${this.formatNumber(peor.actual, peor.metric === 'CP' ? 1 : 0)} / ${this.formatNumber(peor.objetivo, peor.metric === 'CP' ? 1 : 0)} ${peor.metric}`,
      `${peor.lote}: avance ${this.formatNumber(peor.progreso, 0)}% del objetivo mas sensible.`,
      'pi pi-clock',
      tono,
      peor.progreso
    );
  }

  private resumenHeladaGerencial(
    establecimiento: IEstablecimiento,
    lotes: ILoteMapa[],
    perennes: number
  ): IResumenGerencialMetric {
    if (!perennes) {
      return this.metric(
        'Heladas',
        'No aplica',
        'Solo se muestra para frutales y cultivos perennes.',
        'pi pi-snowflake',
        'neutral',
        0
      );
    }
    const minima = this.minimaPronosticadaEstablecimiento(establecimiento, lotes);
    if (minima === null) {
      return this.metric(
        'Heladas',
        'Sin pronostico',
        'Faltan minimas pronosticadas para la ventana de riesgo.',
        'pi pi-snowflake',
        'neutral',
        0
      );
    }
    const tono: IResumenGerencialMetric['tono'] = minima <= 0 ? 'risk' : minima <= 2 ? 'warn' : 'ok';
    const detalle =
      minima <= 0
        ? 'Alerta de helada: priorizar monitoreo de cuadros sensibles.'
        : minima <= 2
          ? 'Cerca del umbral de helada: mantener alerta operativa.'
          : 'Sin helada probable en la ventana de pronostico.';
    return this.metric(
      'Heladas',
      `${this.formatNumber(minima, 1)} C`,
      detalle,
      'pi pi-snowflake',
      tono,
      minima <= 0 ? 100 : minima <= 2 ? 70 : 18
    );
  }

  private metric(
    label: string,
    valor: string,
    detalle: string,
    icon: string,
    tono: IResumenGerencialMetric['tono'],
    progreso?: number,
    soporte?: string
  ): IResumenGerencialMetric {
    return { label, valor, detalle, icon, tono, progreso, soporte };
  }

  private getClimaActual(): any {
    return this.getClimaActualEstablecimiento(this.establecimientoSeleccionado);
  }

  private getClimaActualEstablecimiento(establecimiento?: IEstablecimiento): any {
    const actual = establecimiento?.climaActual as any;
    const clima = actual?.clima || actual;
    return Array.isArray(clima) ? clima[clima.length - 1] : clima;
  }

  private getPronosticosZona(): any[] {
    return this.getPronosticosEstablecimiento(this.establecimientoSeleccionado);
  }

  private getPronosticosEstablecimiento(establecimiento?: IEstablecimiento): any[] {
    const prediccion = establecimiento?.prediccionClimatica as any;
    const pronosticos = prediccion?.pronosticos || prediccion?.clima?.pronosticos || [];
    return Array.isArray(pronosticos) ? pronosticos : [];
  }

  private getPronosticoActualFallback(): any {
    return this.getPronosticosZona()[0] || null;
  }

  private lotesDeEstablecimientoActual(): ILoteMapa[] {
    const establecimiento = this.establecimientoSeleccionado;
    if (!establecimiento) {
      return this.lotes;
    }
    return this.lotesDeEstablecimiento(establecimiento);
  }

  private lotesDeEstablecimiento(establecimiento: IEstablecimiento): ILoteMapa[] {
    return this.lotes.filter((lote) => {
      const idMatch = lote.idEstablecimiento && establecimiento._id && lote.idEstablecimiento === establecimiento._id;
      const nombreMatch = lote.establecimiento?.nombre && lote.establecimiento.nombre === establecimiento.nombre;
      return idMatch || nombreMatch;
    });
  }

  private resumenClimaGerencial(establecimiento: IEstablecimiento): IResumenGerencialMetric[] {
    const actual = this.getClimaActualEstablecimiento(establecimiento);
    const pronosticos = this.getPronosticosEstablecimiento(establecimiento);
    const pronostico = pronosticos[0] || null;
    const temperatura =
      actual?.temperatura?.last ??
      actual?.temperatura?.avg ??
      pronostico?.temperatura?.avg ??
      pronostico?.temperatura?.max ??
      pronostico?.temperatura?.min;
    const humedad =
      actual?.humedad?.last ??
      actual?.humedad?.avg ??
      pronostico?.humedad?.avg ??
      pronostico?.humedad?.max ??
      pronostico?.humedad?.min;
    const lluvia72 = pronosticos.slice(0, 3).reduce((acc, item) => acc + (this.numero(item?.lluvia) || 0), 0);
    const minima = this.minimaPronosticadaEstablecimiento(establecimiento, []);

    const clima: IResumenGerencialMetric[] = [
      this.metric(
        'Temperatura',
        this.formatMetric(temperatura, 'C', 1),
        'Actual o primer pronostico disponible.',
        'pi pi-sun',
        'neutral'
      ),
    ];

    const humedadNum = this.numero(humedad);
    clima.push(
      this.metric(
        'Humedad',
        this.formatMetric(humedad, '%', 0),
        humedadNum !== null && humedadNum >= 90
          ? 'Alta humedad: sube la vigilancia sanitaria.'
          : 'Humedad en rango de seguimiento.',
        'pi pi-percentage',
        humedadNum !== null && humedadNum >= 90 ? 'warn' : 'ok'
      )
    );

    clima.push(
      this.metric(
        'Lluvia 72 h',
        this.formatMetric(lluvia72, 'mm', 1),
        lluvia72 >= 20 ? 'Lluvia relevante para enfermedades y balance hidrico.' : 'Sin lluvia fuerte prevista.',
        'pi pi-cloud-rain',
        lluvia72 >= 20 ? 'warn' : 'ok',
        Math.min(100, (lluvia72 / 30) * 100)
      )
    );

    let tonoMinima: IResumenGerencialMetric['tono'] = 'neutral';
    let detalleMinima = 'Sin minima pronosticada disponible.';
    let progresoMinima = 0;
    if (minima !== null) {
      tonoMinima = minima <= 0 ? 'risk' : minima <= 2 ? 'warn' : 'ok';
      detalleMinima =
        minima <= 0
          ? 'Alerta de helada probable.'
          : minima <= 2
            ? 'Cerca de umbral de helada.'
            : 'Sin helada probable.';
      progresoMinima = minima <= 0 ? 100 : minima <= 2 ? 70 : 12;
    }
    clima.push(
      this.metric(
        'Minima',
        minima === null ? '--' : `${this.formatNumber(minima, 1)} C`,
        detalleMinima,
        'pi pi-snowflake',
        tonoMinima,
        progresoMinima
      )
    );

    return clima;
  }

  private esCultivoExtensivo(lote?: ILoteMapa): boolean {
    const cultivo = String(lote?.siembra?.semilla?.cultivo || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return ['trigo', 'soja', 'maiz'].some((valor) => cultivo.includes(valor));
  }

  private cultivosResumen(lotes: ILoteMapa[]): string {
    const cultivos = Array.from(
      new Set(
        lotes
          .map((lote) => lote.siembra?.semilla?.cultivo)
          .filter(Boolean)
          .map((cultivo) => this.helper.translateCultivo(cultivo as any))
      )
    );
    if (!cultivos.length) {
      return 'Cultivos activos';
    }
    return cultivos.slice(0, 3).join(', ');
  }

  private avanceFrioLote(lote: ILoteMapa): {
    lote: string;
    metric: string;
    actual: number;
    objetivo: number;
    progreso: number;
  } | null {
    const requerimiento = (lote.siembra?.semilla?.requerimientoFrio || {}) as any;
    if (
      requerimiento.estado !== 'validado' ||
      !['HF', undefined].includes(requerimiento.modeloRector)
    ) {
      return null;
    }
    const frio = (lote.dispositivos || []).map((dispositivo: any) => dispositivo?.frioAcumulado).find(Boolean) as any;
    const contadorActual =
      frio?.versionModelo === 'hf-field-preview-1.0.0' ? frio : undefined;
    const opciones = [
      {
        metric: 'HF',
        actual: this.numero(contadorActual?.horasFrio),
        objetivo: this.numero(requerimiento.horasFrio ?? requerimiento.hf),
      },
    ].filter((item) => item.actual !== null && item.objetivo !== null && item.objetivo > 0) as Array<{
      metric: string;
      actual: number;
      objetivo: number;
    }>;

    if (!opciones.length) {
      return null;
    }

    const menor = opciones
      .map((item) => ({ ...item, progreso: Math.min(100, Math.max(0, (item.actual / item.objetivo) * 100)) }))
      .reduce((min, item) => (item.progreso < min.progreso ? item : min));

    return {
      lote: lote.nombre || 'Lote sin nombre',
      metric: menor.metric,
      actual: menor.actual,
      objetivo: menor.objetivo,
      progreso: menor.progreso,
    };
  }

  private centerMapOnEstablecimiento(establecimiento: IEstablecimiento, markAsVisited = true): void {
    if (!this.map) {
      return;
    }

    const lotes = this.lotesDeEstablecimiento(establecimiento);
    const loteExtent = this.getFeatureExtent(this.lotesLayer, (feature) => {
      const lote = feature.get('lote') as ILoteMapa | undefined;
      if (!lote) {
        return false;
      }
      return lotes.some((item) => {
        const idMatch = item._id && lote._id && item._id === lote._id;
        const nombreMatch = item.nombre && lote.nombre && item.nombre === lote.nombre;
        return idMatch || nombreMatch;
      });
    });

    const establecimientoExtent = this.getFeatureExtent(this.establecimientosLayer, (feature) => {
      const featureEstablecimiento = feature.get('establecimiento') as IEstablecimiento | undefined;
      const idMatch =
        featureEstablecimiento?._id && establecimiento._id && featureEstablecimiento._id === establecimiento._id;
      const nombreMatch = featureEstablecimiento?.nombre && featureEstablecimiento.nombre === establecimiento.nombre;
      return !!idMatch || !!nombreMatch || feature.getId() === establecimiento.nombre;
    });

    const extent = loteExtent || establecimientoExtent;
    if (!extent) {
      return;
    }

    this.fitMapToExtent(extent, markAsVisited);
  }

  private getFeatureExtent(layer: VectorLayer<Vector>, predicate: (feature: Feature) => boolean): Extent | undefined {
    const source = layer.getSource();
    if (!source) {
      return undefined;
    }

    const features = source.getFeatures().filter((feature) => predicate(feature as Feature));
    return this.combineFeatureExtents(features as Feature[]);
  }

  private combineFeatureExtents(features: Feature[]): Extent | undefined {
    let combinedExtent: Extent | undefined;

    features.forEach((feature) => {
      const extent = feature.getGeometry()?.getExtent();
      if (!extent || !this.isValidExtent(extent)) {
        return;
      }
      if (!combinedExtent) {
        combinedExtent = [...extent] as Extent;
        return;
      }
      combinedExtent[0] = Math.min(combinedExtent[0], extent[0]);
      combinedExtent[1] = Math.min(combinedExtent[1], extent[1]);
      combinedExtent[2] = Math.max(combinedExtent[2], extent[2]);
      combinedExtent[3] = Math.max(combinedExtent[3], extent[3]);
    });

    return combinedExtent;
  }

  private fitMapToExtent(extent: Extent, markAsVisited = true): void {
    if (!this.map || !this.isValidExtent(extent)) {
      return;
    }

    this.map.getView().fit(extent, {
      padding: this.helper.isHandset ? [140, 24, 210, 24] : [130, 80, 230, 80],
      duration: 850,
      maxZoom: this.helper.isHandset ? 15 : 16,
    });

    if (markAsVisited) {
      this.isFirstVisit = false;
    }
  }

  private isValidExtent(extent?: Extent): extent is Extent {
    return (
      !!extent &&
      extent.length === 4 &&
      extent.every((value) => Number.isFinite(value)) &&
      extent[0] <= extent[2] &&
      extent[1] <= extent[3]
    );
  }

  private maxRiesgoEnfermedad(lote?: ILoteMapa): number | null {
    return evaluarSanidadFrontend(lote?.siembra).maximo ?? null;
  }

  private umbralesRiesgoEnfermedad(lote?: ILoteMapa): { medio: number; alto: number; escalaDirecta: boolean } {
    if (lote?.siembra?.semilla?.cultivo === 'Cebada') {
      return { medio: 35, alto: 60, escalaDirecta: true };
    }
    return { medio: 15, alto: 20, escalaDirecta: false };
  }

  private nivelRiesgoEnfermedad(lote: ILoteMapa | undefined, resultado: number): 0 | 1 | 2 {
    const umbrales = this.umbralesRiesgoEnfermedad(lote);
    if (resultado >= umbrales.alto) return 2;
    if (resultado >= umbrales.medio) return 1;
    return 0;
  }

  private progresoRiesgoEnfermedad(lote: ILoteMapa | undefined, resultado: number): number {
    const umbrales = this.umbralesRiesgoEnfermedad(lote);
    const valor = umbrales.escalaDirecta ? resultado : (resultado / 25) * 100;
    return Math.max(8, Math.min(100, valor));
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
      this.sincronizarSeleccionConDatos();
    }

    // Redibujar lotes si hay datos
    if (this.lotes?.length > 0) {
      await this.redibujarLotes();
      this.sincronizarSeleccionConDatos();

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
          center: fromLonLat(initialPosition.center),
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

      this.handleSelectLote();
      this.handleSelectEstablciemientos();
      this.handleMapDragEnd();
      this.handleMapClick();
      setTimeout(() => {
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
      case this.translate.instant('Horas frio'):
        color = this.getColorFrioLote(lote);
        break;
      case this.translate.instant('Riesgo de heladas'):
        color = this.getColorHeladaLote(lote);
        break;
    }
    return color;
  }

  private getColorFrioLote(lote: ILoteMapa): string {
    if (!this.esLotePerenne(lote)) {
      return 'rgba(255, 255, 255, 0.38)';
    }
    return this.loteTieneDatosFrio(lote) ? 'rgba(34, 197, 94, 0.64)' : 'rgba(243, 216, 64, 0.62)';
  }

  private getColorHeladaLote(lote: ILoteMapa): string {
    if (!this.esLotePerenne(lote)) {
      return 'rgba(255, 255, 255, 0.38)';
    }
    const minima = this.minimaPronosticada(lote);
    if (minima === null) {
      return 'rgba(243, 216, 64, 0.56)';
    }
    if (minima <= 0) {
      return 'rgba(244, 74, 74, 0.66)';
    }
    if (minima <= 2) {
      return 'rgba(243, 216, 64, 0.64)';
    }
    return 'rgba(34, 197, 94, 0.62)';
  }

  private esLotePerenne(lote?: ILoteMapa): boolean {
    return esCultivoPerenne(String(lote?.siembra?.semilla?.cultivo || ''));
  }

  private loteTieneDatosFrio(lote: ILoteMapa): boolean {
    const requerimiento = lote.siembra?.semilla?.requerimientoFrio || {};
    const tieneRequerimiento = [
      requerimiento.horasFrio,
      requerimiento.porcionesFrio,
    ].some((valor) => this.numero(valor) !== null) &&
      requerimiento.estado === 'validado';
    const tieneSensor = (lote.dispositivos || []).some(
      (dispositivo: any) =>
        dispositivo?.frioAcumulado?.versionModelo ===
        'hf-field-preview-1.0.0'
    );
    return tieneRequerimiento || tieneSensor;
  }

  private minimaPronosticada(lote: ILoteMapa): number | null {
    const pronosticos = ((lote as any)?.establecimiento?.prediccionClimatica?.pronosticos ||
      this.establecimientoSeleccionado?.prediccionClimatica?.pronosticos ||
      []) as any[];
    const minimas = pronosticos
      .slice(0, 5)
      .map((pronostico) =>
        this.numero(pronostico?.temperatura?.min ?? pronostico?.tempMin ?? pronostico?.temperaturaMinima)
      )
      .filter((valor): valor is number => valor !== null);
    return minimas.length ? Math.min(...minimas) : null;
  }

  private minimaPronosticadaEstablecimiento(
    establecimiento?: IEstablecimiento,
    lotes: ILoteMapa[] = []
  ): number | null {
    const pronosticos = this.getPronosticosEstablecimiento(establecimiento);
    const minimasEstablecimiento = pronosticos
      .slice(0, 5)
      .map((pronostico) =>
        this.numero(pronostico?.temperatura?.min ?? pronostico?.tempMin ?? pronostico?.temperaturaMinima)
      )
      .filter((valor): valor is number => valor !== null);

    if (minimasEstablecimiento.length) {
      return Math.min(...minimasEstablecimiento);
    }

    const minimasLotes = lotes
      .map((lote) => this.minimaPronosticada(lote))
      .filter((valor): valor is number => valor !== null);
    return minimasLotes.length ? Math.min(...minimasLotes) : null;
  }

  private getLoteIdentity(lote: ILoteMapa): string {
    return String(lote._id || (lote as any).id || `${lote.establecimiento?.nombre || 'zona'}-${lote.nombre}`);
  }

  private getEstablecimientoIdentity(lote: ILoteMapa): string {
    return String(
      lote.establecimiento?._id ||
        (lote as any).idEstablecimiento ||
        lote.establecimiento?.nombre ||
        this.establecimientoSeleccionado?._id ||
        this.establecimientoSeleccionado?.nombre ||
        'sin-establecimiento'
    );
  }

  private getCultivoKey(lote: ILoteMapa): string {
    return String(lote.siembra?.semilla?.cultivo || '')
      .trim()
      .toLowerCase();
  }

  private getVariedadKey(lote: ILoteMapa): string {
    return String(lote.siembra?.semilla?.variedad || lote.nombre || '')
      .trim()
      .toLowerCase();
  }

  private prepararGruposAmbientes(): void {
    this.gruposAmbientes.clear();
    this.grupoAmbientePorLote.clear();

    const candidatos = new globalThis.Map<string, ILoteMapa[]>();
    for (const lote of this.lotes) {
      const cultivo = this.getCultivoKey(lote);
      if (!cultivo || !esCultivoPerenne(cultivo)) continue;

      const key = `${this.getEstablecimientoIdentity(lote)}|${cultivo}`;
      const lotes = candidatos.get(key) || [];
      lotes.push(lote);
      candidatos.set(key, lotes);
    }

    candidatos.forEach((lotes, key) => {
      const variedades = Array.from(new Set(lotes.map((lote) => this.getVariedadKey(lote)).filter(Boolean)));
      if (lotes.length < 4 || variedades.length < 2) return;

      const representante = [...lotes].sort(
        (a, b) => (this.numero(b.ubicacion?.superficie) || 0) - (this.numero(a.ubicacion?.superficie) || 0)
      )[0];
      const lotesOrdenados = [...lotes].sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { numeric: true, sensitivity: 'base' })
      );

      const grupo: IGrupoAmbientesMapa = {
        key,
        cultivo: this.helper.translateCultivo(lotes[0]?.siembra?.semilla?.cultivo || undefined),
        establecimiento: lotes[0]?.establecimiento?.nombre,
        lotes: lotesOrdenados,
        variedades: Array.from(new Set(lotes.map((lote) => this.variedadAmbiente(lote)).filter(Boolean))).sort((a, b) =>
          a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
        ),
        representanteId: this.getLoteIdentity(representante),
      };

      this.gruposAmbientes.set(key, grupo);
      lotes.forEach((lote) => this.grupoAmbientePorLote.set(this.getLoteIdentity(lote), grupo));
    });
  }

  private getGrupoAmbiente(lote: ILoteMapa): IGrupoAmbientesMapa | undefined {
    return this.grupoAmbientePorLote.get(this.getLoteIdentity(lote));
  }

  private nombreMapaLote(lote: ILoteMapa): string {
    const grupo = this.getGrupoAmbiente(lote);
    if (!grupo) return lote.nombre || 'Lote';
    return grupo.representanteId === this.getLoteIdentity(lote) ? `Ambientes (${grupo.lotes.length})` : '';
  }

  private addPolygonLote(lote: ILoteMapa) {
    const geojson = lote.ubicacion?.geojson as IGeoJSONPolygon;
    const source = this.lotesLayer.getSource();
    const polygon = new Polygon(geojson.coordinates!);
    polygon.transform('EPSG:4326', 'EPSG:3857');
    const feature = new Feature(polygon);
    // Estilo del poligono
    const color = this.getColorLote(lote);
    const grupoAmbiente = this.getGrupoAmbiente(lote);
    feature.set('lote', lote);
    feature.set('nombre', lote.nombre);
    feature.set('nombreMapa', this.nombreMapaLote(lote));
    feature.set('grupoAmbiente', grupoAmbiente);
    feature.set('esResumenAmbientes', !!grupoAmbiente && grupoAmbiente.representanteId === this.getLoteIdentity(lote));
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
        text: feature.get('nombreMapa') ?? feature.get('nombre') ?? '',
        font: feature.get('esResumenAmbientes') ? '700 12px Lato, sans-serif' : '600 11px Lato, sans-serif',
        fill: new Fill({ color: this.helper.darkTheme ? '#f8fafc' : '#111827' }),
        stroke: new Stroke({
          color: this.helper.darkTheme ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)',
          width: 4,
        }),
        overflow: false,
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
        const grupoAmbiente = f.get('grupoAmbiente') as IGrupoAmbientesMapa | undefined;
        if (grupoAmbiente) {
          this.grupoAmbientesSeleccionado = grupoAmbiente;
          this.loteSeleccionado = undefined;
          const establecimiento = this.buscarEstablecimiento(undefined, grupoAmbiente.establecimiento);
          if (establecimiento) {
            this.establecimientoSeleccionado = establecimiento;
            this.guardarContextoEstablecimiento(establecimiento);
          }
        } else {
          this.grupoAmbientesSeleccionado = undefined;
          this.loteSeleccionado = lote as ILoteMapa;
          const establecimiento = this.getEstablecimientoDelLote(this.loteSeleccionado);
          if (establecimiento) {
            this.establecimientoSeleccionado = establecimiento;
            this.guardarContextoEstablecimiento(establecimiento, this.loteSeleccionado);
            this.selectEstablecimiento(establecimiento.nombre);
          }
        }
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
    this.prepararGruposAmbientes();
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
    if (markAsVisited) {
      this.isFirstVisit = false; // Marcar que ya no es primera visita
    }
  }

  private handleMapClick() {
    this.map?.on('click', (evt) => {
      // Detectar si se clickeó sobre algún feature
      const feature = this.map?.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (!feature) {
        // No se clickeó en ningún feature: deseleccionar
        this.selectInteractionLotes?.getFeatures().clear();
        this.loteSeleccionado = undefined;
        this.grupoAmbientesSeleccionado = undefined;
        if (this.establecimientoSeleccionado) {
          this.guardarContextoEstablecimiento(this.establecimientoSeleccionado);
        }
      }
    });
  }

  // Imágenes NDVI
  private getSatelliteRasterUrl(reporte?: IReporteNDVI | null): string | undefined {
    if (!this.isSatelliteRasterReliable(reporte)) {
      return undefined;
    }
    return reporte?.imagenes?.ndvi;
  }

  private isSatelliteRasterReliable(reporte?: IReporteNDVI | null): boolean {
    const metadata = reporte?.metadataImagen as any;
    const qa = metadata?.renderQa?.ndvi;
    const coverage = Number(qa?.validCoveragePct ?? metadata?.qualityMask?.validCoveragePct ?? 0);
    return metadata?.renderVersion === 'fixed-index-v3' && qa?.status === 'ok' && coverage >= 3;
  }

  private addNdviImage(reporte: IReporteNDVI) {
    const rasterUrl = this.getSatelliteRasterUrl(reporte);
    if (!rasterUrl || !reporte.metadataImagen?.geojson) return;
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
        url: rasterUrl,
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
  }

  private async redibujarImagenes() {
    this.loading.set(true);
    this.clearImagesNdvi();
    await Promise.all(
      this.reportesNDVI.map(async (reporte) => {
        if (
          this.getSatelliteRasterUrl(reporte.lastReporte) &&
          reporte.lastReporte?.metadataImagen?.geojson?.coordinates
        ) {
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
      this.sincronizarSeleccionConDatos();

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
      if (this.getSatelliteRasterUrl(reporte.lastReporte)) {
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
        this.sincronizarSeleccionConDatos();
        // Solo intentar centrar el mapa automáticamente si es primera visita
        if (this.isFirstVisit) {
          this.centerMapOnFirstVisit();
        }
      });
    await this.listado.getLastValue('establecimientos', query);
  }

  // Detalles

  public detallesLote(lote?: ILoteMapa) {
    const seleccionado = lote || this.loteSeleccionado;
    if (!seleccionado?._id) return;
    const establecimiento = this.getEstablecimientoDelLote(seleccionado);
    if (establecimiento) {
      this.guardarContextoEstablecimiento(establecimiento, seleccionado);
    }
    this.paramsService.set('detallesLote', seleccionado);
    this.router.navigate(['lotes', 'detalles', seleccionado._id]);
  }

  public async cargaInicial() {
    await Promise.all([this.listarLotes(), this.listarEstablecimientos()]);
    this.initialDataLoaded = true;
    this.centerMapOnFirstVisit();
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

        if (this.isFirstVisit) {
          this.isFirstVisit = false; // Marcar como visitado si era fallback
        }
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

        return;
      }
    }
  }

  // 🚀 NUEVO: Método para obtener ubicación sin bloquear
  private async obtenerUbicacionEnBackground() {
    try {
      this.currentPosition = await this.helper.getCurrentPosition();

      // Si es primera visita y no hay datos, usar ubicación como fallback
      if (this.initialDataLoaded && this.isFirstVisit && !this.lotes?.length && !this.establecimientos?.length) {
        this.centerOnUserLocation();
      }
    } catch (error) {
      console.warn('⚠️ No se pudo obtener ubicación del dispositivo:', error);
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

    this.permiso = this.helper.permiso;

    // Inicializar sistema de capas de clima
    await this.initClimaSystem();

    // NO llamar initMap aquí - se llamará en ngAfterViewInit

    this.activatedRoute.queryParams.subscribe(async () => {
      await this.cargaInicial();
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
