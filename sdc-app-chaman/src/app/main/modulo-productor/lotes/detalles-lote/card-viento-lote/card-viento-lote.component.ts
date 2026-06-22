import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { Feature, Map, View } from 'ol';
import { defaults as defaultControls } from 'ol/control';
import { defaults as defaultInteractions } from 'ol/interaction';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat } from 'ol/proj';
import { Vector as VectorSource, XYZ } from 'ol/source';
import { Fill, Stroke, Style } from 'ol/style';
import { Polygon } from 'ol/geom';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import type { IDetallesLote } from '../detalles-lote.component';

type VientoTono = 'ok' | 'warn' | 'risk' | 'danger' | 'neutral';

interface VientoDecision {
  velocidad: number | null;
  rafaga: number | null;
  direccion: number | null;
  direccionLabel: string;
  tono: VientoTono;
  titulo: string;
  detalle: string;
  ventana: string;
  deriva: string;
  color: string;
}

interface VientoMetric {
  label: string;
  value: string;
  detail: string;
}

interface VientoForecast {
  label: string;
  viento: string;
  estado: string;
  tone: VientoTono;
}

interface WindStream {
  id: number;
  left: number;
  top: number;
  width: number;
  delay: number;
  duration: number;
}

@Component({
  selector: 'app-card-viento-lote',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-viento-lote.component.html',
  styleUrl: './card-viento-lote.component.scss',
})
export class CardVientoLoteComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() public lote?: IDetallesLote;
  @ViewChild('windMapTarget') private windMapTarget?: ElementRef<HTMLElement>;

  public decision: VientoDecision = this.crearDecision();
  public metricas: VientoMetric[] = [];
  public pronostico: VientoForecast[] = [];

  public readonly streams: WindStream[] = Array.from({ length: 24 }, (_, index) => ({
    id: index,
    left: (index * 17 + 7) % 100,
    top: (index * 29 + 11) % 100,
    width: 52 + ((index * 13) % 46),
    delay: -((index * 0.37) % 3.8),
    duration: 3.2 + ((index * 0.23) % 1.8),
  }));

  private map?: Map;
  private loteLayer?: VectorLayer<VectorSource>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      this.prepararVista();
      this.renderizarMapa();
    }
  }

  ngAfterViewInit(): void {
    this.renderizarMapa();
  }

  ngOnDestroy(): void {
    this.map?.setTarget(undefined);
  }

  public get windAngleCss(): string {
    return `${((this.decision.direccion ?? 225) + 90) % 360}deg`;
  }

  public get mapToneClass(): string {
    return `tone-${this.decision.tono}`;
  }

  private prepararVista(): void {
    this.decision = this.crearDecision();
    this.metricas = this.crearMetricas();
    this.pronostico = this.crearPronostico();
  }

  private crearDecision(): VientoDecision {
    const datos = this.getDatosViento();
    const referencia =
      datos.velocidad === null && datos.rafaga === null ? null : Math.max(datos.velocidad ?? 0, datos.rafaga ?? datos.velocidad ?? 0);
    const tono = this.getTonoViento(referencia);
    const textos: Record<VientoTono, Pick<VientoDecision, 'titulo' | 'detalle' | 'ventana' | 'deriva' | 'color'>> = {
      ok: {
        titulo: 'Aplicacion recomendada',
        detalle: 'Viento bajo y estable. Validar marbete, humedad y cultivos vecinos antes de aplicar.',
        ventana: 'Ventana operativa favorable',
        deriva: 'Riesgo bajo',
        color: '#22c55e',
      },
      warn: {
        titulo: 'Aplicar con precaucion',
        detalle: 'Viento moderado. Usar gota mas gruesa, boquillas antideriva y verificar rafagas.',
        ventana: 'Ventana condicionada',
        deriva: 'Riesgo medio',
        color: '#f59e0b',
      },
      risk: {
        titulo: 'Riesgo alto de deriva',
        detalle: 'El viento supera un rango confortable. Conviene esperar una ventana mas calma.',
        ventana: 'No recomendado para pulverizacion fina',
        deriva: 'Riesgo alto',
        color: '#f97316',
      },
      danger: {
        titulo: 'No aplicar',
        detalle: 'Viento o rafagas fuera de rango seguro para pulverizar.',
        ventana: 'Esperar nueva ventana',
        deriva: 'Riesgo critico',
        color: '#ef4444',
      },
      neutral: {
        titulo: 'Sin lectura de viento',
        detalle: 'No hay datos suficientes para estimar deriva en este establecimiento.',
        ventana: 'Actualizar clima',
        deriva: 'Sin dato',
        color: '#64748b',
      },
    };

    return {
      velocidad: datos.velocidad,
      rafaga: datos.rafaga,
      direccion: datos.direccion,
      direccionLabel: datos.direccion === null ? '--' : `${this.getDireccionCardinal(datos.direccion)} ${Math.round(datos.direccion)} deg`,
      tono,
      ...textos[tono],
    };
  }

  private crearMetricas(): VientoMetric[] {
    const humedad = this.numero(this.getClimaActual()?.humedad?.last ?? this.getClimaActual()?.humedad?.avg);
    const temperatura = this.numero(this.getClimaActual()?.temperatura?.last ?? this.getClimaActual()?.temperatura?.avg);
    const vpd = this.numero(this.getPronosticos()[0]?.vpd ?? this.calcularVpd(temperatura, humedad));

    return [
      {
        label: 'Viento actual',
        value: this.formatear(this.decision.velocidad, 'km/h', 0),
        detail: 'Lectura del establecimiento',
      },
      {
        label: 'Rafaga',
        value: this.formatear(this.decision.rafaga, 'km/h', 0),
        detail: 'Control de deriva',
      },
      {
        label: 'Direccion',
        value: this.decision.direccionLabel,
        detail: 'Sentido predominante',
      },
      {
        label: 'HR / VPD',
        value: `${this.formatear(humedad, '%', 0)} / ${this.formatear(vpd, 'kPa', 1)}`,
        detail: 'Calidad de aplicacion',
      },
    ];
  }

  private crearPronostico(): VientoForecast[] {
    return this.getPronosticos()
      .slice(0, 3)
      .map((item, index) => {
        const viento = this.numero(item?.velocidadViento?.max ?? item?.velocidadViento?.avg);
        const tono = this.getTonoViento(viento);
        return {
          label: index === 0 ? '24 h' : index === 1 ? '48 h' : '72 h',
          viento: this.formatear(viento, 'km/h', 0),
          estado: tono === 'ok' ? 'Favorable' : tono === 'warn' ? 'Precaucion' : tono === 'neutral' ? 'Sin dato' : 'Evitar',
          tone: tono,
        };
      });
  }

  private renderizarMapa(): void {
    const target = this.windMapTarget?.nativeElement;
    const ring = this.coordenadasLote();
    if (!target || ring.length < 3) {
      return;
    }

    const polygon = new Polygon([ring.map((coord) => fromLonLat(coord))]);
    const feature = new Feature({ geometry: polygon });
    feature.setStyle(
      new Style({
        fill: new Fill({ color: 'rgba(255, 255, 255, 0.08)' }),
        stroke: new Stroke({ color: 'rgba(18, 37, 59, 0.82)', width: 2 }),
      })
    );

    const source = new VectorSource({ features: [feature] });
    if (!this.map) {
      this.loteLayer = new VectorLayer({ source });
      this.map = new Map({
        target,
        controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
        interactions: defaultInteractions({
          altShiftDragRotate: false,
          doubleClickZoom: false,
          dragPan: false,
          keyboard: false,
          mouseWheelZoom: false,
          pinchRotate: false,
          pinchZoom: false,
        }),
        layers: [
          new TileLayer({
            source: new XYZ({
              url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              attributions: '',
              maxZoom: 19,
            }),
          }),
          this.loteLayer,
        ],
        view: new View({
          center: fromLonLat(ring[0]),
          zoom: 14,
        }),
      });
    } else {
      this.map.setTarget(target);
      this.loteLayer?.setSource(source);
    }

    setTimeout(() => {
      this.map?.updateSize();
      this.map?.getView().fit(polygon.getExtent(), {
        padding: [44, 44, 44, 44],
        maxZoom: 17,
        duration: 0,
      });
    });
  }

  private coordenadasLote(): Array<[number, number]> {
    const geojson = (this.lote as any)?.ubicacion?.geojson;
    const coordinates = geojson?.type === 'MultiPolygon' ? geojson?.coordinates?.[0]?.[0] : geojson?.coordinates?.[0];
    if (!Array.isArray(coordinates)) {
      return [];
    }
    return coordinates
      .map((coord: unknown) => {
        if (!Array.isArray(coord) || coord.length < 2) {
          return null;
        }
        const lng = Number(coord[0]);
        const lat = Number(coord[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? ([lng, lat] as [number, number]) : null;
      })
      .filter((coord): coord is [number, number] => !!coord);
  }

  private getDatosViento(): { velocidad: number | null; rafaga: number | null; direccion: number | null } {
    const actual = this.getClimaActual();
    const pronostico = this.getPronosticos()[0] || null;
    return {
      velocidad: this.numero(
        actual?.velocidadViento?.last ??
          actual?.velocidadViento?.avg ??
          pronostico?.velocidadViento?.avg ??
          pronostico?.velocidadViento?.max
      ),
      rafaga: this.numero(
        actual?.rafagaViento?.last ??
          actual?.rafagaViento?.max ??
          actual?.rafagaViento?.avg ??
          pronostico?.rafagaViento?.max ??
          pronostico?.rafagaViento?.avg ??
          pronostico?.velocidadViento?.max
      ),
      direccion: this.numero(
        actual?.direccionViento?.last ??
          actual?.direccionViento?.avg ??
          actual?.direccionViento ??
          pronostico?.direccionViento?.last ??
          pronostico?.direccionViento?.avg ??
          pronostico?.direccionViento
      ),
    };
  }

  private getClimaActual(): any {
    const actual = this.lote?.establecimiento?.climaActual as any;
    const clima = actual?.clima || actual;
    return Array.isArray(clima) ? clima[clima.length - 1] : clima;
  }

  private getPronosticos(): any[] {
    const prediccion = this.lote?.establecimiento?.prediccionClimatica as any;
    const pronosticos = prediccion?.pronosticos || prediccion?.clima?.pronosticos || [];
    return Array.isArray(pronosticos) ? pronosticos : [];
  }

  private getTonoViento(valor: number | null): VientoTono {
    if (valor === null) return 'neutral';
    if (valor >= 35) return 'danger';
    if (valor >= 20) return 'risk';
    if (valor >= 10) return 'warn';
    return 'ok';
  }

  private getDireccionCardinal(grados: number): string {
    const direcciones = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const index = Math.round((((grados % 360) + 360) % 360) / 45) % 8;
    return direcciones[index];
  }

  private calcularVpd(temp: number | null, hr: number | null): number | null {
    if (temp === null || hr === null) {
      return null;
    }
    const svp = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
    return this.redondear(svp * (1 - hr / 100));
  }

  private numero(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private redondear(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatear(value: number | null, unit: string, decimals = 1): string {
    if (value === null) {
      return '--';
    }
    return `${value.toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} ${unit}`;
  }
}
