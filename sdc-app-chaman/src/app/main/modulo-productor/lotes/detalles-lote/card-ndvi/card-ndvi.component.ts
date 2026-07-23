import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import Highcharts from 'highcharts';
import { Feature, Map, View } from 'ol';
import { defaults as defaultControls } from 'ol/control';
import { defaults as defaultInteractions } from 'ol/interaction';
import { Extent } from 'ol/extent';
import { MultiPolygon, Polygon } from 'ol/geom';
import ImageLayer from 'ol/layer/Image';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat } from 'ol/proj';
import { Vector as VectorSource, XYZ } from 'ol/source';
import Static from 'ol/source/ImageStatic';
import { Fill, Stroke, Style } from 'ol/style';
import RenderEvent from 'ol/render/Event';
import { apply as applyTransform, multiply as multiplyTransform } from 'ol/transform';
import {
  esCultivoPerenne,
  getEtapasPerennesReferencia,
  getNombreImplantacion,
  IFilter,
  IListado,
  ILote,
  IPronosticoEstacionMeteorologica,
  IQueryParam,
  IReporteNDVI,
  ISiembra,
  SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT,
  obtenerRegistroFenologicoDecisorioEnFecha,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { DialogHandlerService } from '../../../../../auxiliares/servicios/dialog-handler.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { NdviLegendComponent } from '../../ndvi-legend/ndvi-legend.component';
import { colorForSatelliteIndex, legendForSatelliteIndex, SatelliteLegendItem } from './satellite-index-palettes';
import {
  buildSatelliteIndexHistory,
  operationalSatelliteIndexKeys,
  SatelliteIndexHistoryPoint,
  SatelliteStageAtDate,
  parseSatelliteCalendarDate,
  satelliteReportIsOperational,
  satelliteIndexValue,
} from './satellite-index-history';

interface NdviAnalisis {
  estado: string;
  tono: 'ok' | 'warn' | 'risk';
  resumen: string;
  recomendacion: string;
  contexto: string;
  contextoAgronomico: string;
  tendencia: string;
  balance72: string;
}

interface ExpectativaIndiceSatelital {
  rango: string;
  comparacion: string;
  nota: string;
  tono: 'ok' | 'warn' | 'risk';
}

interface SatelliteIndicator {
  key: keyof NonNullable<IReporteNDVI['indices']>;
  label: string;
  value: string;
  detail: string;
  source: string;
  image?: string;
  lectura: string;
  status: 'activo' | 'preparado' | 'contexto';
}

type FaseSatelital = 'reposo' | 'implantacion' | 'vegetativo' | 'reproductivo' | 'madurez' | 'cosecha' | 'monitoreo';

interface ContextoAgronomicoSatelital {
  cultivo: string;
  variedad?: string;
  ciclo?: string;
  etapa: string;
  fase: FaseSatelital;
  esPerenne: boolean;
  diasDesdeImplantacion?: number;
  implantacionLabel: 'Siembra' | 'Plantacion';
  texto: string;
}

interface RangoIndiceSatelital {
  min: number;
  max: number;
  etiqueta: string;
  nota: string;
}

@Component({
  selector: 'app-card-ndvi',
  imports: [CommonModule, SharedModule, ChartComponent],
  templateUrl: './card-ndvi.component.html',
  styleUrl: './card-ndvi.component.scss',
})
export class CardNDVIComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @Input() public lote?: ILote;
  @Input() public siembra?: ISiembra;
  @ViewChild('satelliteMapTarget') private satelliteMapTarget?: ElementRef<HTMLElement>;

  public hoy: Date = new Date();
  public fecha: Date = this.hoy;
  public fechaMinima: Date = this.hoy;

  public reporte?: IReporteNDVI;
  public ndvis: IReporteNDVI[] = [];
  public generandoSatelital = false;
  public detalleCapasVisible = false;
  public graficoSatelitalVisible = false;
  public capaSatelitalActiva: SatelliteIndicator['key'] = 'ndvi';
  public historialIndice: SatelliteIndexHistoryPoint[] = [];
  public historialIndiceOptions?: Highcharts.Options;

  private ndvi$?: Subscription;
  private refreshTimeout?: ReturnType<typeof setTimeout>;
  private satelliteMap?: Map;
  private satelliteLoteLayer?: VectorLayer<VectorSource>;
  private satelliteRasterLayer?: ImageLayer<Static>;
  private satelliteClipGeometry?: Polygon | MultiPolygon;
  private satelliteClipActive = false;
  public satelliteRasterVisible = false;
  public satelliteRasterBlockedReason = '';
  private readonly ventanaPreferenciaSentinelDias = 6;
  private seleccionManual = false;
  private ultimoLoteListado?: string;

  constructor(
    public helper: HelperService,
    private listados: ListadosService,
    private dialogHandler: DialogHandlerService,
    private loteService: LoteService
  ) {}

  public onSelect(reporte: IReporteNDVI): void {
    if (!this.reporteValidoParaLote(reporte)) {
      this.helper.notifWarn('La escena satelital no pertenece al lote actual y fue bloqueada.');
      return;
    }
    this.seleccionManual = true;
    this.reporte = reporte;
    this.asegurarCapaOperativa(reporte);
    this.fecha = reporte.fechaDeLaImagen
      ? parseSatelliteCalendarDate(reporte.fechaDeLaImagen)
      : this.hoy;
    this.actualizarHistorialIndice();
    this.programarRenderMapaSatelital();
  }

  public fechaEscena(reporte: IReporteNDVI): Date {
    return parseSatelliteCalendarDate(
      reporte.fechaDeLaImagen || reporte.fechaCreacion,
    );
  }

  public valorNdviEscena(reporte: IReporteNDVI): number | null {
    return satelliteIndexValue(reporte, 'ndvi');
  }

  public abrirDetalleCapas(): void {
    this.detalleCapasVisible = true;
  }

  public abrirGraficoSatelital(): void {
    if (!this.historialIndiceOptions) return;
    this.graficoSatelitalVisible = true;
  }

  public get analisis(): NdviAnalisis {
    const ndvi = this.valorIndice('ndvi');
    const lluvia72 = this.suma(this.pronosticos.slice(0, 3).map((p) => this.numero(p.lluvia)));
    const et072 = this.suma(this.pronosticos.slice(0, 3).map((p) => this.numero(p.et0)));
    const balance = this.redondear(lluvia72 - et072);
    const balanceTxt = `${this.formatear(balance)} mm`;
    const contextoAgronomico = this.contextoAgronomico;

    if (ndvi == null) {
      return {
        estado: 'Sin imagen activa',
        tono: 'warn',
        resumen: 'Todavia no hay una imagen NDVI seleccionada para interpretar.',
        recomendacion: this.recomendacionSinImagen(contextoAgronomico),
        contexto: `Pronostico 72 h: lluvia ${this.formatear(lluvia72)} mm, ET0 ${this.formatear(et072)} mm.`,
        contextoAgronomico: contextoAgronomico.texto,
        tendencia: 'Sin tendencia',
        balance72: balanceTxt,
      };
    }

    const base = this.estadoNdvi(ndvi, contextoAgronomico);
    const tendencia = this.tendenciaNdvi();
    const recomendacion = this.recomendacionSatelital(ndvi, balance, lluvia72, contextoAgronomico);

    return {
      estado: base.estado,
      tono: base.tono,
      resumen: base.resumen,
      recomendacion,
      contexto: `Pronostico 72 h: lluvia ${this.formatear(lluvia72)} mm, ET0 ${this.formatear(et072)} mm.`,
      contextoAgronomico: contextoAgronomico.texto,
      tendencia,
      balance72: balanceTxt,
    };
  }

  public get fechaImagenResumen(): string {
    if (!this.reporte?.fechaDeLaImagen) {
      return 'Sin imagen satelital activa';
    }
    const fechaImagen = parseSatelliteCalendarDate(this.reporte.fechaDeLaImagen);
    const fecha = fechaImagen.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    });
    return `Escena limpia ${fecha}`;
  }

  public get subtituloSatelital(): string {
    if (!this.reporte?.fechaDeLaImagen) {
      return 'Linea de tiempo e indices satelitales del lote';
    }
    const dias = this.diasDesde(parseSatelliteCalendarDate(this.reporte.fechaDeLaImagen));
    const sufijo = dias > 0 ? `, hace ${dias} dias` : ', procesada hoy';
    return `Analisis por escena limpia - ${this.fechaImagenResumen}${sufijo}`;
  }

  public get estadoEscenaSatelital(): string {
    if (!this.reporte?.fechaDeLaImagen) {
      return 'Sin escena';
    }
    return this.imagenAtrasada ? 'Sin escena limpia reciente' : this.analisis.estado;
  }

  public get notaEscenaSatelital(): string {
    if (!this.reporte?.fechaDeLaImagen) {
      return 'El modulo se habilita automaticamente cuando encuentra una imagen limpia y util para el lote.';
    }
    if (this.imagenAtrasada) {
      return 'La base mantiene la ultima escena limpia. Al actualizar se vuelve a consultar STAC y se guarda una nueva solo si cubre el lote con calidad suficiente.';
    }
    if (this.correccionVisualLegadoActiva) {
      return 'Escena sin auditoria visual completa: se corrige con una escala fija para que el color acompane el valor real del indice.';
    }
    return 'Escena util para analisis semanal; comparar siempre con recorrida, clima, suelo y manejo reciente.';
  }

  public get imagenAtrasada(): boolean {
    if (!this.reporte?.fechaDeLaImagen) {
      return false;
    }
    return this.diasDesde(parseSatelliteCalendarDate(this.reporte.fechaDeLaImagen)) > 10;
  }

  public get satelliteIndicators(): SatelliteIndicator[] {
    const ndvi = this.valorIndice('ndvi');
    const imagenes = this.reporte?.imagenes;
    const indexValue = (key: keyof NonNullable<IReporteNDVI['indices']>) => {
      const value = this.valorIndice(key);
      return value == null ? (this.reporte ? 'Pendiente' : 'Preparado') : this.formatear(value);
    };
    const indexStatus = (...keys: (keyof NonNullable<IReporteNDVI['indices']>)[]) =>
      keys.some((key) => this.valorIndice(key) != null) ? 'activo' : 'preparado';
    return [
      {
        key: 'ndvi',
        label: 'NDVI',
        value: indexValue('ndvi'),
        detail: this.detalleIndice('ndvi'),
        source: this.reporte?.coleccion || 'Sentinel-2 B08/B04',
        image: imagenes?.ndvi,
        lectura: this.lecturaIndice('ndvi', ndvi),
        status: ndvi != null ? 'activo' : 'preparado',
      },
      {
        key: 'ndmi',
        label: 'NDMI',
        value: indexValue('ndmi'),
        detail: this.detalleIndice('ndmi'),
        source: 'Sentinel-2 B08/B11',
        image: imagenes?.ndmi,
        lectura: this.lecturaIndice('ndmi', this.valorIndice('ndmi')),
        status: indexStatus('ndmi'),
      },
      {
        key: 'ndwi',
        label: 'NDWI',
        value: indexValue('ndwi'),
        detail: this.detalleIndice('ndwi'),
        source: 'Sentinel-2 B03/B08',
        image: imagenes?.ndwi,
        lectura: this.lecturaIndice('ndwi', this.valorIndice('ndwi')),
        status: indexStatus('ndwi'),
      },
      {
        key: 'ndre',
        label: 'NDRE',
        value: indexValue('ndre'),
        detail: this.detalleIndice('ndre'),
        source: 'Sentinel-2 B08/B05',
        image: imagenes?.ndre,
        lectura: this.lecturaIndice('ndre', this.valorIndice('ndre')),
        status: indexStatus('ndre'),
      },
      {
        key: 'savi',
        label: 'SAVI',
        value: indexValue('savi'),
        detail: this.detalleIndice('savi'),
        source: 'Sentinel-2 multibanda',
        image: imagenes?.savi,
        lectura: this.lecturaIndice('savi', this.valorIndice('savi')),
        status: indexStatus('savi'),
      },
      {
        key: 'evi',
        label: 'EVI',
        value: indexValue('evi'),
        detail: this.detalleIndice('evi'),
        source: 'Sentinel-2 multibanda',
        image: imagenes?.evi,
        lectura: this.lecturaIndice('evi', this.valorIndice('evi')),
        status: indexStatus('evi'),
      },
    ];
  }

  public get capaActiva(): SatelliteIndicator {
    return (
      this.satelliteIndicators.find((indicator) => indicator.key === this.capaSatelitalActiva) ||
      this.satelliteIndicators[0]
    );
  }

  public get imagenCapaActiva(): string | undefined {
    return this.urlImagenSatelital(this.capaActiva?.image, this.capaActiva?.key);
  }

  private urlImagenSatelital(url?: string, key?: string): string | undefined {
    if (!url || url.startsWith('data:')) {
      return url;
    }

    const reporte = this.reporte as any;
    const version = [
      reporte?._id,
      reporte?.fechaDeLaImagen,
      reporte?.fechaDelReporte,
      reporte?.fechaCreacion,
      reporte?.updatedAt,
      key,
    ]
      .filter(Boolean)
      .join('-');

    if (!version) {
      return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(version)}`;
  }

  public get valorCapaActiva(): number | undefined {
    return this.valorIndice(this.capaActiva.key);
  }

  public get expectativaCapaActiva(): ExpectativaIndiceSatelital {
    const value = this.valorCapaActiva;
    const contexto = this.contextoAgronomico;
    const rango = this.rangoEsperadoIndice(this.capaActiva.key, contexto);

    if (value == null || !rango) {
      return {
        rango: 'Referencia pendiente',
        comparacion: 'La capa todavia no tiene una referencia suficiente para comparar contra etapa.',
        nota: 'Usar como tendencia visual y validar con recorrida.',
        tono: 'warn',
      };
    }

    const valor = this.redondear(value);
    const margen = 0.02;
    const rangoTxt = `${this.formatear(rango.min)} a ${this.formatear(rango.max)}`;

    if (valor >= rango.min - margen && valor <= rango.max + margen) {
      return {
        rango: rangoTxt,
        comparacion: `Dentro del rango esperado para ${contexto.cultivo} en ${contexto.etapa}.`,
        nota: rango.nota,
        tono: 'ok',
      };
    }

    if (valor < rango.min - margen) {
      const desvio = this.formatear(this.redondear(rango.min - valor));
      return {
        rango: rangoTxt,
        comparacion: `${desvio} puntos por debajo de la referencia operativa de la etapa.`,
        nota: `${rango.nota} Priorizar recorrida en sectores de menor vigor y cruzar con clima, suelo y manejo reciente.`,
        tono: valor < rango.min - 0.12 ? 'risk' : 'warn',
      };
    }

    const desvio = this.formatear(this.redondear(valor - rango.max));
    return {
      rango: rangoTxt,
      comparacion: `${desvio} puntos por encima de la referencia operativa de la etapa.`,
      nota: `${rango.nota} Revisar si corresponde a cobertura real, malezas, exceso de humedad o saturacion del indice.`,
      tono: 'warn',
    };
  }

  public get leyendaCapaActiva(): SatelliteLegendItem[] {
    return legendForSatelliteIndex(this.capaActiva.key);
  }

  public get correccionVisualLegadoActiva(): boolean {
    return (
      this.reporteValidoParaLote(this.reporte) &&
      !!this.reporte?.fechaDeLaImagen &&
      !this.renderSatelitalConfiable &&
      this.valorCapaActiva != null
    );
  }

  public get renderSatelitalConfiable(): boolean {
    if (!this.reporteValidoParaLote(this.reporte)) {
      return false;
    }
    const metadataLoteId = (this.reporte?.metadataImagen as any)?.loteId;
    if (metadataLoteId && String(metadataLoteId) !== String(this.lote?._id || '')) {
      return false;
    }
    const metadata = this.reporte?.metadataImagen as any;
    const qa = this.qaCapaActiva;
    const coverage = Number(qa?.validCoveragePct ?? metadata?.qualityMask?.validCoveragePct ?? 0);
    return (
      metadata?.renderVersion === 'fixed-index-v3' &&
      qa?.status === 'ok' &&
      coverage >= SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT
    );
  }

  public get satelliteRasterWarningTitle(): string {
    return this.satelliteRasterBlockedReason ? 'Raster bloqueado' : 'Raster no disponible';
  }

  public get satelliteRasterWarningMessage(): string {
    const coverage = Number(
      this.qaCapaActiva?.validCoveragePct ??
        (this.reporte?.metadataImagen as any)?.qualityMask?.validCoveragePct,
    );
    if (
      Number.isFinite(coverage) &&
      coverage < SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT
    ) {
      return `Escena archivada para auditoria: solo ${this.formatear(coverage)}% del lote tiene pixeles validos. No se usa para interpretar el cultivo.`;
    }
    return (
      this.satelliteRasterBlockedReason ||
      'Esta capa necesita una escena satelital procesada pixel a pixel para este lote.'
    );
  }

  public get qaCapaActiva(): any {
    const metadata = this.reporte?.metadataImagen as any;
    return metadata?.renderQa?.[this.capaActiva.key];
  }

  public get statsCapaActiva(): any {
    const metadata = this.reporte?.metadataImagen as any;
    return metadata?.indicesStats?.[this.capaActiva.key];
  }

  public get resumenQaCapaActiva(): string {
    const coverage = Number(this.qaCapaActiva?.validCoveragePct ?? this.statsCapaActiva?.validCoveragePct);
    return Number.isFinite(coverage) && coverage > 0 ? `QA ${this.formatear(coverage)}%` : '';
  }

  public get historialLecturasValidas(): number {
    return this.historialIndice.filter((point) => point.value != null).length;
  }

  public get historialIndiceResumen(): string {
    if (!this.historialIndice.length) {
      return 'Sin escenas fechadas para construir la serie';
    }

    const first = this.historialIndice[0];
    const last = this.historialIndice[this.historialIndice.length - 1];
    const rango =
      first.timestamp === last.timestamp
        ? this.formatearFechaHistorial(first.timestamp, true)
        : `${this.formatearFechaHistorial(first.timestamp)} – ${this.formatearFechaHistorial(last.timestamp, true)}`;
    return `${this.historialLecturasValidas} de ${this.historialIndice.length} escenas con lectura · ${rango}`;
  }

  public get mensajeHistorialIndice(): string {
    if (!this.historialIndice.length || this.historialLecturasValidas === 0) {
      return `Las escenas guardadas todavía no contienen valores válidos de ${this.capaActiva.label}.`;
    }
    if (this.historialLecturasValidas === 1) {
      return 'Hay una sola lectura: se muestra el punto, pero todavía no existe una tendencia temporal.';
    }
    if (this.historialLecturasValidas < 4) {
      return 'Serie corta: la unión entre puntos ayuda a leer el cambio, pero no representa mediciones continuas.';
    }
    const faltantes = this.historialIndice.length - this.historialLecturasValidas;
    return faltantes > 0
      ? `${faltantes} escena${faltantes === 1 ? '' : 's'} sin lectura válida interrumpe${faltantes === 1 ? '' : 'n'} la curva.`
      : 'Cada marcador es una escena satelital real; la línea solo conecta observaciones discretas.';
  }

  public get puntoHistorialSeleccionado(): SatelliteIndexHistoryPoint | undefined {
    const reporteId = this.reporte?._id;
    const fecha = this.fechaReporteMs(this.reporte || {});
    return this.historialIndice.find((point) => (reporteId ? point.reportId === reporteId : point.timestamp === fecha));
  }

  public seleccionarCapa(indicator: SatelliteIndicator): void {
    if (indicator.status === 'activo') {
      this.capaSatelitalActiva = indicator.key;
      this.actualizarHistorialIndice();
      this.programarRenderMapaSatelital();
    }
  }

  private actualizarHistorialIndice(): void {
    this.historialIndice = buildSatelliteIndexHistory(this.ndvis, this.capaSatelitalActiva, (date) =>
      this.etapaParaFechaHistorica(date)
    );
    this.historialIndiceOptions = this.crearOpcionesHistorialIndice();
  }

  private crearOpcionesHistorialIndice(): Highcharts.Options | undefined {
    const valid = this.historialIndice.filter(
      (point): point is SatelliteIndexHistoryPoint & { value: number } => point.value != null
    );
    if (!valid.length) {
      return undefined;
    }

    const label = this.capaActiva.label;
    const selectedId = this.reporte?._id;
    const [min, max] = this.rangoEjeHistorial(valid.map((point) => point.value));
    const data = this.historialIndice.map((point) => {
      const selected = selectedId
        ? point.reportId === selectedId
        : point.timestamp === this.fechaReporteMs(this.reporte || {});
      const custom = {
        reportId: point.reportId,
        date: this.formatearFechaHistorial(point.timestamp, true),
        stage: this.escapeHtml(point.stage.name),
        stageSource: this.escapeHtml(point.stage.source),
        collection: this.escapeHtml(point.collection),
        quality: point.qualityCoveragePct == null ? '' : `${this.formatear(point.qualityCoveragePct)}%`,
        invalidReason: point.invalidReason,
      };
      return {
        x: point.timestamp,
        y: point.value,
        custom,
        marker: {
          enabled: point.value != null,
          fillColor: selected ? '#071827' : '#22cfc7',
          lineColor: '#ffffff',
          lineWidth: selected ? 3 : 2,
          radius: selected ? 6 : 4,
        },
        dataLabels:
          selected && point.value != null
            ? {
                enabled: true,
                format: `${label} {point.y:.2f}`,
                backgroundColor: 'rgba(7, 24, 39, 0.9)',
                borderRadius: 6,
                color: '#ffffff',
                crop: false,
                overflow: 'allow',
                padding: 5,
                style: { fontSize: '11px', fontWeight: '700', textOutline: 'none' },
                y: -14,
              }
            : { enabled: false },
      } as Highcharts.PointOptionsObject;
    });

    return {
      chart: {
        type: 'line',
        height: 220,
        marginTop: 22,
        marginRight: 12,
        spacingBottom: 4,
        zooming: { type: 'x' },
      },
      title: { text: undefined },
      subtitle: { text: undefined },
      xAxis: {
        type: 'datetime',
        title: { text: undefined },
        dateTimeLabelFormats: {
          day: '%e %b',
          week: '%e %b',
          month: '%b %Y',
        },
        plotBands: this.crearBandasFenologicas(this.historialIndice),
      },
      yAxis: {
        min,
        max,
        endOnTick: false,
        startOnTick: false,
        tickAmount: 4,
        title: { text: undefined },
        plotLines: [
          {
            value: 0,
            color: 'rgba(100, 116, 139, 0.45)',
            dashStyle: 'ShortDash',
            width: 1,
            zIndex: 1,
          },
        ],
      },
      legend: { enabled: false },
      tooltip: {
        useHTML: true,
        formatter: function () {
          const custom = (this.point.options as any).custom || {};
          const value =
            typeof this.y === 'number' ? this.y.toLocaleString('es-AR', { maximumFractionDigits: 3 }) : 'Sin lectura';
          const quality = custom.quality ? `<br><span>Área útil QA: <b>${custom.quality}</b></span>` : '';
          return [
            `<b>${label} ${value}</b>`,
            `<br><span>${custom.date}</span>`,
            `<br><span>Etapa: <b>${custom.stage}</b></span>`,
            `<br><span>Fenología: ${custom.stageSource}</span>`,
            `<br><span>Escena: ${custom.collection}</span>`,
            quality,
          ].join('');
        },
      },
      plotOptions: {
        line: {
          lineWidth: valid.length > 1 ? 2.5 : 0,
          marker: { enabled: true },
        },
        series: {
          connectNulls: false,
          cursor: 'pointer',
          point: {
            events: {
              click: (event) => {
                const reportId = ((event.point.options as any).custom || {}).reportId;
                const report = this.ndvis.find((item) => item._id === reportId);
                if (report) {
                  this.onSelect(report);
                }
              },
            },
          },
        },
      },
      series: [
        {
          type: 'line',
          name: label,
          color: '#22cfc7',
          data,
        },
      ],
    };
  }

  private crearBandasFenologicas(points: SatelliteIndexHistoryPoint[]): Highcharts.XAxisPlotBandsOptions[] {
    if (!points.length) return [];
    const day = 86400000;
    const segments = points.map((point, index) => {
      const previous = points[index - 1]?.timestamp;
      const next = points[index + 1]?.timestamp;
      const from =
        previous == null
          ? point.timestamp - Math.max(day, ((next || point.timestamp + day) - point.timestamp) / 2)
          : (previous + point.timestamp) / 2;
      const to =
        next == null
          ? point.timestamp + Math.max(day, (point.timestamp - (previous || point.timestamp - day)) / 2)
          : (point.timestamp + next) / 2;
      return { from, to, stage: point.stage };
    });

    const grouped: Array<{ from: number; to: number; stage: SatelliteStageAtDate }> = [];
    segments.forEach((segment) => {
      const last = grouped[grouped.length - 1];
      if (last && last.stage.name === segment.stage.name && last.stage.source === segment.stage.source) {
        last.to = segment.to;
      } else {
        grouped.push({ ...segment });
      }
    });

    return grouped.map((segment, index) => ({
      from: segment.from,
      to: segment.to,
      color: segment.stage.confirmed
        ? index % 2 === 0
          ? 'rgba(34, 207, 199, 0.08)'
          : 'rgba(56, 169, 232, 0.07)'
        : 'rgba(148, 163, 184, 0.07)',
      label: {
        text: this.abreviarEtapa(segment.stage.name),
        align: 'center',
        verticalAlign: 'top',
        y: 4,
        style: {
          color: '#52637a',
          fontSize: '10px',
          fontWeight: '700',
          textOutline: 'none',
        },
      },
      zIndex: 0,
    }));
  }

  private rangoEjeHistorial(values: number[]): [number, number] {
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const center = (dataMin + dataMax) / 2;
    const span = Math.max(0.3, dataMax - dataMin + 0.16);
    let min = Math.max(-1, center - span / 2);
    let max = Math.min(1, center + span / 2);
    if (max - min < 0.3) {
      if (min <= -1) max = Math.min(1, min + 0.3);
      if (max >= 1) min = Math.max(-1, max - 0.3);
    }
    return [Math.floor(min * 20) / 20, Math.ceil(max * 20) / 20];
  }

  private formatearFechaHistorial(timestamp: number, includeYear = false): string {
    return new Date(timestamp).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      ...(includeYear ? { year: 'numeric' as const } : {}),
    });
  }

  private abreviarEtapa(value: string): string {
    return value.length > 28 ? `${value.slice(0, 27)}…` : value;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private programarRenderMapaSatelital(): void {
    setTimeout(() => this.renderizarMapaSatelital());
  }

  private renderizarMapaSatelital(): void {
    const target = this.satelliteMapTarget?.nativeElement;
    const polygon = this.geometriaDesdeGeojson((this.lote as any)?.ubicacion?.geojson);
    if (!target || !polygon) {
      return;
    }

    const polygonExtent = polygon.getExtent();
    const imageExtent = this.extentImagenSatelital();
    this.satelliteRasterVisible = this.rasterSatelitalSeguro(imageExtent, polygonExtent);
    this.satelliteClipGeometry = polygon;

    const feature = new Feature({ geometry: polygon });
    feature.setStyle(this.estiloMapaSatelital());
    const source = new VectorSource({ features: [feature] });

    if (!this.satelliteMap) {
      this.satelliteLoteLayer = new VectorLayer({ source, zIndex: 20 });
      this.satelliteMap = new Map({
        target,
        controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
        interactions: defaultInteractions({
          altShiftDragRotate: false,
          doubleClickZoom: false,
          dragPan: false,
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
            zIndex: 0,
          }),
          this.satelliteLoteLayer,
        ],
        view: new View({
          center: [(polygonExtent[0] + polygonExtent[2]) / 2, (polygonExtent[1] + polygonExtent[3]) / 2],
          zoom: 14,
        }),
      });
    } else {
      this.satelliteMap.setTarget(target);
      this.satelliteLoteLayer?.setSource(source);
    }

    this.actualizarRasterSatelital(this.satelliteRasterVisible ? imageExtent : undefined);

    setTimeout(() => {
      this.satelliteMap?.updateSize();
      this.satelliteMap?.getView().fit(polygon.getExtent(), {
        padding: [10, 10, 10, 10],
        maxZoom: 18,
        duration: 0,
      });
    });
  }

  private actualizarRasterSatelital(extent?: Extent): void {
    if (!this.satelliteMap) {
      return;
    }

    if (this.satelliteRasterLayer) {
      this.satelliteMap.removeLayer(this.satelliteRasterLayer);
      this.satelliteRasterLayer = undefined;
    }

    const imageUrl = this.imagenCapaActiva;
    if (!imageUrl || !extent || extent.some((value) => !Number.isFinite(value))) {
      return;
    }

    this.satelliteRasterLayer = new ImageLayer({
      source: new Static({
        url: imageUrl,
        imageExtent: extent,
        projection: this.satelliteMap.getView().getProjection(),
      }),
      opacity: this.correccionVisualLegadoActiva ? 0.22 : 1,
      zIndex: 10,
      extent,
    });
    this.satelliteRasterLayer.on('prerender', this.aplicarRecorteRaster);
    this.satelliteRasterLayer.on('postrender', this.restaurarRecorteRaster);
    this.satelliteMap.addLayer(this.satelliteRasterLayer);
  }

  private extentImagenSatelital(): Extent | undefined {
    return this.extentDesdeGeojson((this.reporte?.metadataImagen as any)?.geojson);
  }

  private rasterSatelitalSeguro(extent: Extent | undefined, loteExtent: Extent): boolean {
    this.satelliteRasterBlockedReason = '';
    if (!this.reporteValidoParaLote(this.reporte)) {
      this.satelliteRasterBlockedReason = 'La escena recibida no coincide con el lote actual.';
      return false;
    }

    const metadataLoteId = (this.reporte?.metadataImagen as any)?.loteId;
    if (metadataLoteId && String(metadataLoteId) !== String(this.lote?._id || '')) {
      this.satelliteRasterBlockedReason = 'La metadata de la escena pertenece a otro lote.';
      return false;
    }

    if (!this.imagenCapaActiva) {
      this.satelliteRasterBlockedReason = 'La capa no tiene imagen raster disponible.';
      return false;
    }

    if (!this.renderSatelitalConfiable) {
      const coverage = Number(
        this.qaCapaActiva?.validCoveragePct ??
          (this.reporte?.metadataImagen as any)?.qualityMask?.validCoveragePct,
      );
      this.satelliteRasterBlockedReason =
        Number.isFinite(coverage) &&
        coverage < SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT
          ? `Cobertura valida insuficiente (${this.formatear(coverage)}%). La escena queda archivada, pero no se usa para interpretar el lote.`
          : 'La escena no tiene auditoria visual y QA completo. Se bloquea para evitar lecturas cruzadas.';
      return false;
    }

    if (!extent || !this.extentFinito(extent) || !this.extentFinito(loteExtent)) {
      this.satelliteRasterBlockedReason = 'La metadata geoespacial de la escena no es valida.';
      return false;
    }

    const loteArea = this.extentArea(loteExtent);
    const imageArea = this.extentArea(extent);
    const overlap = this.extentIntersectionArea(extent, loteExtent);
    if (loteArea <= 0 || imageArea <= 0 || overlap <= 0) {
      this.satelliteRasterBlockedReason = 'La imagen procesada no se superpone con el lote.';
      return false;
    }

    const overlapRatio = overlap / loteArea;
    const areaRatio = imageArea / loteArea;
    if (overlapRatio < 0.65 || areaRatio < 0.35 || areaRatio > 3.5) {
      this.satelliteRasterBlockedReason = 'La geometria de la imagen no coincide con el marco del lote.';
      return false;
    }

    return true;
  }

  private reporteValidoParaLote(reporte?: IReporteNDVI, idLote = this.lote?._id): boolean {
    if (!reporte || !idLote) {
      return false;
    }
    return String((reporte as any).idLote || '') === String(idLote);
  }

  private extentDesdeGeojson(geojson: any): Extent | undefined {
    return this.geometriaDesdeGeojson(geojson)?.getExtent();
  }

  private extentFinito(extent: Extent): boolean {
    return extent.every((value) => Number.isFinite(value)) && extent[2] > extent[0] && extent[3] > extent[1];
  }

  private extentArea(extent: Extent): number {
    return Math.max(0, extent[2] - extent[0]) * Math.max(0, extent[3] - extent[1]);
  }

  private extentIntersectionArea(a: Extent, b: Extent): number {
    const width = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const height = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    return width * height;
  }

  private estiloMapaSatelital(): Style[] {
    const fillColor = this.correccionVisualLegadoActiva ? this.colorCapaActiva(0.72) : 'rgba(255, 255, 255, 0)';
    return [
      new Style({
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.72)', width: 2.6 }),
      }),
      new Style({
        stroke: new Stroke({ color: 'rgba(18, 37, 59, 0.9)', width: 1.2 }),
      }),
    ];
  }

  private valorIndice(key: SatelliteIndicator['key']): number | undefined {
    if (!this.reporte) {
      return undefined;
    }
    return satelliteIndexValue(this.reporte, key) ?? undefined;
  }

  private colorCapaActiva(opacity: number): string {
    const color = colorForSatelliteIndex(this.capaActiva.key, this.valorCapaActiva);
    return color.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/, `rgba($1, $2, $3, ${opacity})`);
  }

  private readonly aplicarRecorteRaster = (event: RenderEvent): void => {
    const context = event.context as CanvasRenderingContext2D | undefined;
    const frameState = event.frameState;
    const inversePixelTransform = event.inversePixelTransform;
    const geometry = this.satelliteClipGeometry;
    if (!context || !frameState || !inversePixelTransform || !geometry || typeof context.clip !== 'function') {
      return;
    }

    const transform = multiplyTransform(inversePixelTransform.slice(), frameState.coordinateToPixelTransform);
    const polygons = geometry instanceof MultiPolygon ? geometry.getCoordinates() : [geometry.getCoordinates()];

    context.save();
    context.beginPath();
    for (const polygon of polygons) {
      for (const ring of polygon) {
        ring.forEach((coordinate, index) => {
          const pixel = applyTransform(transform, coordinate.slice());
          if (index === 0) {
            context.moveTo(pixel[0], pixel[1]);
          } else {
            context.lineTo(pixel[0], pixel[1]);
          }
        });
        context.closePath();
      }
    }
    context.clip('evenodd');
    this.satelliteClipActive = true;
  };

  private readonly restaurarRecorteRaster = (event: RenderEvent): void => {
    if (!this.satelliteClipActive) {
      return;
    }
    const context = event.context as CanvasRenderingContext2D | undefined;
    context?.restore();
    this.satelliteClipActive = false;
  };

  private geometriaDesdeGeojson(geojson: any): Polygon | MultiPolygon | undefined {
    const geometry = geojson?.type === 'Feature' ? geojson.geometry : geojson;
    const proyectarPoligono = (polygon: unknown): Array<Array<[number, number]>> => {
      if (!Array.isArray(polygon)) {
        return [];
      }
      return polygon.map((ring) => this.proyectarAnillo(ring)).filter((ring) => ring.length >= 4);
    };

    if (geometry?.type === 'MultiPolygon') {
      const polygons = (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
        .map((polygon: unknown) => proyectarPoligono(polygon))
        .filter((polygon: Array<Array<[number, number]>>) => polygon.length > 0);
      return polygons.length ? new MultiPolygon(polygons) : undefined;
    }

    const polygon = proyectarPoligono(geometry?.coordinates);
    return polygon.length ? new Polygon(polygon) : undefined;
  }

  private proyectarAnillo(ring: unknown): Array<[number, number]> {
    if (!Array.isArray(ring)) {
      return [];
    }
    const coordinates = ring
      .map((coord: unknown) => {
        if (!Array.isArray(coord) || coord.length < 2) {
          return null;
        }
        const lng = Number(coord[0]);
        const lat = Number(coord[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? (fromLonLat([lng, lat]) as [number, number]) : null;
      })
      .filter((coord): coord is [number, number] => !!coord);

    if (coordinates.length < 3) {
      return [];
    }
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coordinates.push([...first] as [number, number]);
    }
    return coordinates;
  }

  private get contextoAgronomico(): ContextoAgronomicoSatelital {
    const semilla = this.siembra?.semilla;
    const cultivo = this.canonicalCultivo(semilla?.cultivo);
    const esPerenne = esCultivoPerenne(cultivo);
    const etapa = this.etapaParaFechaHistorica(new Date()).name;
    const fase = this.faseSatelital(cultivo, etapa, esPerenne);
    const diasDesdeImplantacion = this.diasDesdeImplantacion();
    const implantacionLabel = getNombreImplantacion(cultivo);
    const atributos = [cultivo];

    if (semilla?.variedad) {
      atributos.push(semilla.variedad);
    }
    if (semilla?.ciclo) {
      atributos.push(`ciclo ${semilla.ciclo}`);
    }
    atributos.push(etapa);
    atributos.push(esPerenne ? 'perenne' : 'anual');

    return {
      cultivo,
      variedad: semilla?.variedad,
      ciclo: semilla?.ciclo,
      etapa,
      fase,
      esPerenne,
      diasDesdeImplantacion,
      implantacionLabel,
      texto: atributos.filter(Boolean).join(' - '),
    };
  }

  private etapaParaFechaHistorica(fecha: Date): SatelliteStageAtDate {
    const siembra = this.siembra;
    const cultivo = this.canonicalCultivo(siembra?.semilla?.cultivo);
    if (!Number.isFinite(fecha.getTime())) {
      return { name: 'Sin etapa confirmada', source: 'Fecha de escena inválida', confirmed: false };
    }

    const registro = obtenerRegistroFenologicoDecisorioEnFecha(
      siembra,
      fecha,
    );
    if (registro?.etapa) {
      const puntual =
        registro.tipoEvento === 'observacion' ||
        (registro.accion === 'observacion' && !registro.fechaInicioEtapa);
      return {
        name: registro.etapa,
        source: `${puntual ? 'Observación' : 'Inicio de etapa'} de campo · confianza ${registro.confianza || 'media'}`,
        confirmed: true,
      };
    }

    if (!siembra) {
      return { name: 'Sin etapa confirmada', source: 'No hay una siembra asociada', confirmed: false };
    }

    if (esCultivoPerenne(cultivo)) {
      return {
        name: this.etapaSatelitalPerenne(cultivo, fecha),
        source: 'Referencia de campaña perenne',
        confirmed: false,
      };
    }

    const fechaSiembra = siembra.fechaSiembra ? new Date(siembra.fechaSiembra) : undefined;
    if (!fechaSiembra || !Number.isFinite(fechaSiembra.getTime())) {
      return { name: 'Sin etapa confirmada', source: 'Falta fecha de siembra', confirmed: false };
    }
    const dias = Math.floor((fecha.getTime() - fechaSiembra.getTime()) / 86400000);
    if (dias < 0) {
      return { name: 'Pre-siembra', source: 'Fecha anterior a la siembra', confirmed: false };
    }

    if (siembra.crono) {
      const iso = fecha.toISOString();
      if (cultivo === 'Trigo') {
        return {
          name: this.nombreEtapaTrigo(HelperService.getEtapaPorFechaTrigo(siembra, iso, siembra.crono)),
          source: 'Cronología de la siembra',
          confirmed: false,
        };
      }
      if (cultivo === 'Cebada') {
        return {
          name: HelperService.getEtapaPorFechaCebada(siembra, iso, siembra.crono) || 'Etapa cebada',
          source: 'Cronología de la siembra',
          confirmed: false,
        };
      }
      if (cultivo === 'Soja') {
        return {
          name: HelperService.getEtapaPorFechaSoja(siembra, iso, siembra.crono) || 'Etapa soja',
          source: 'Cronología de la siembra',
          confirmed: false,
        };
      }
      if (cultivo === 'Maiz') {
        return {
          name: HelperService.getEtapaPorFechaMaiz(siembra, iso, siembra.crono) || 'Etapa maíz',
          source: 'Cronología de la siembra',
          confirmed: false,
        };
      }
    }

    const referencia = siembra.semilla?.fenologiaReferencia;
    if (referencia?.unidadEtapas === 'dias' && referencia.etapas) {
      const etapas = this.normalizarEtapasSatelitales(referencia.etapas).sort((a, b) => a.dia - b.dia);
      let etapa = etapas[0]?.nombre;
      etapas.forEach((item) => {
        if (dias >= item.dia) etapa = item.nombre;
      });
      if (etapa) {
        return { name: etapa, source: 'Referencia fenológica de la variedad', confirmed: false };
      }
    }

    if (referencia?.unidadEtapas === 'grados_dia') {
      return {
        name: `Etapa térmica sin confirmar · día ${dias}`,
        source: 'Requiere GDD histórico o registro de campo',
        confirmed: false,
      };
    }

    return {
      name: this.etapaCalendarioReferencia(cultivo, dias),
      source: 'Referencia calendario operativa',
      confirmed: false,
    };
  }

  private etapaCalendarioReferencia(cultivo: string, dias: number): string {
    if (cultivo === 'Soja') {
      if (dias < 10) return 'Implantacion';
      if (dias < 45) return 'Vegetativo';
      if (dias < 92) return 'Reproductivo';
      if (dias < 130) return 'Llenado';
      return 'Madurez';
    }
    if (cultivo === 'Maiz') {
      if (dias < 10) return 'Implantacion';
      if (dias < 65) return 'Vegetativo';
      if (dias < 110) return 'Floracion y llenado';
      return 'Madurez';
    }
    if (cultivo === 'Trigo') {
      if (dias < 18) return 'Implantacion';
      if (dias < 75) return 'Macollaje y encanazon';
      if (dias < 105) return 'Espigazon y floracion';
      return 'Llenado y madurez';
    }
    if (cultivo === 'Cebada') {
      if (dias < 15) return 'Implantacion';
      if (dias < 82) return 'Macollaje y encanazon';
      if (dias < 120) return 'Espigazon y floracion';
      return 'Llenado y madurez';
    }
    return dias > 0 ? `Dia ${dias} del ciclo` : 'Etapa no definida';
  }

  private nombreEtapaTrigo(etapa: unknown): string {
    const nombres = [
      'Siembra',
      'Emergencia',
      'Macollaje',
      'Encanazon',
      'Hoja bandera',
      'Espigazon',
      'Floracion',
      'Llenado',
    ];
    if (typeof etapa === 'number') {
      return nombres[Math.max(0, Math.min(nombres.length - 1, etapa))] || `Etapa ${etapa}`;
    }
    return typeof etapa === 'string' && etapa ? etapa : 'Etapa trigo';
  }

  private etapaSatelitalPerenne(cultivo: string, fecha: Date): string {
    const etapasSemilla = this.siembra?.semilla?.fenologiaReferencia?.etapas;
    const etapas =
      etapasSemilla && Object.keys(etapasSemilla).length
        ? this.normalizarEtapasSatelitales(etapasSemilla)
        : getEtapasPerennesReferencia(cultivo).map((etapa) => ({
            nombre: etapa.nombre,
            dia: etapa.dia,
          }));

    if (!etapas.length) {
      return 'Campania perenne';
    }

    const inicio = this.inicioCampaniaPerenne(fecha);
    const diaCampania = Math.max(0, Math.min(365, Math.floor((fecha.getTime() - inicio.getTime()) / 86400000)));
    let actual = etapas[0].nombre;
    etapas
      .sort((a, b) => a.dia - b.dia)
      .forEach((etapa) => {
        if (diaCampania >= etapa.dia) {
          actual = etapa.nombre;
        }
      });
    return actual;
  }

  private normalizarEtapasSatelitales(etapas: Record<string, number | string>): Array<{ nombre: string; dia: number }> {
    const entries = Object.entries(etapas)
      .map(([nombre, value]) => ({
        nombre: nombre.replace(/_/g, ' '),
        dia: Number(String(value).replace(',', '.')),
      }))
      .filter((item) => Number.isFinite(item.dia));

    if (!entries.length) return [];
    const valores = entries.map((item) => item.dia);
    const sonDiasCampania = valores.every((valor, index) => index === 0 || valor >= valores[index - 1]);
    let acumulado = 0;

    return entries.map((item, index) => {
      if (sonDiasCampania) {
        return { nombre: item.nombre, dia: Math.max(0, Math.min(365, Math.round(item.dia))) };
      }
      acumulado += index === 0 ? 0 : Math.max(0, item.dia);
      return { nombre: item.nombre, dia: Math.max(0, Math.min(365, Math.round(acumulado))) };
    });
  }

  private faseSatelital(cultivo: string, etapa: string, esPerenne: boolean): FaseSatelital {
    const texto = this.normalizarTexto(`${cultivo} ${etapa}`);
    if (texto.includes('dormancia') || texto.includes('reposo')) return 'reposo';
    if (texto.includes('cosecha')) return 'cosecha';
    if (texto.includes('madurez')) return 'madurez';
    if (
      texto.includes('floracion') ||
      texto.includes('cuaje') ||
      texto.includes('llenado') ||
      texto.includes('espig') ||
      texto.includes('reproduct') ||
      texto.includes('poliniz') ||
      texto.includes('envero') ||
      texto.includes('gel') ||
      texto.includes('masa') ||
      texto.includes('fruto') ||
      texto.includes('nuez')
    ) {
      return 'reproductivo';
    }
    if (
      texto.includes('siembra') ||
      texto.includes('implantacion') ||
      texto.includes('emergencia') ||
      texto.includes('nacimiento')
    ) {
      return 'implantacion';
    }
    if (esPerenne || texto.includes('vegetativo') || texto.includes('brotacion') || texto.includes('macoll')) {
      return 'vegetativo';
    }
    return 'monitoreo';
  }

  private inicioCampaniaPerenne(fecha = new Date()): Date {
    const year = fecha.getMonth() + 1 >= 7 ? fecha.getFullYear() : fecha.getFullYear() - 1;
    return new Date(year, 6, 1);
  }

  private inicioMonitoreoPerenne(fecha = new Date()): Date {
    const year = fecha.getMonth() + 1 >= 5 ? fecha.getFullYear() : fecha.getFullYear() - 1;
    return new Date(year, 4, 1);
  }

  private diasDesdeImplantacion(fecha = new Date()): number | undefined {
    if (!this.siembra?.fechaSiembra) {
      return undefined;
    }
    return Math.max(0, Math.floor((fecha.getTime() - new Date(this.siembra.fechaSiembra).getTime()) / 86400000));
  }

  private canonicalCultivo(cultivo?: string): string {
    const normalizado = this.normalizarTexto(cultivo || '');
    const cultivos: Record<string, string> = {
      trigo: 'Trigo',
      cebada: 'Cebada',
      arveja: 'Arveja',
      soja: 'Soja',
      maiz: 'Maiz',
      papa: 'Papa',
      vid: 'Vid',
      peral: 'Peral',
      pecan: 'Pecan',
      manzano: 'Manzano',
    };
    return cultivos[normalizado] || cultivo || 'Cultivo';
  }

  private rangoEsperadoIndice(
    key: SatelliteIndicator['key'],
    contexto: ContextoAgronomicoSatelital
  ): RangoIndiceSatelital | undefined {
    const fase = contexto.fase;
    const rangosPorIndice: Record<SatelliteIndicator['key'], Partial<Record<FaseSatelital, [number, number]>>> = {
      ndvi: {
        reposo: [0.1, 0.35],
        implantacion: [0.1, 0.35],
        vegetativo: [0.35, 0.7],
        reproductivo: [0.5, 0.85],
        madurez: [0.25, 0.6],
        cosecha: [0.1, 0.4],
        monitoreo: [0.35, 0.7],
      },
      ndmi: {
        reposo: [-0.25, 0.05],
        implantacion: [-0.2, 0.1],
        vegetativo: [-0.05, 0.3],
        reproductivo: [0, 0.35],
        madurez: [-0.2, 0.15],
        cosecha: [-0.25, 0.1],
        monitoreo: [-0.05, 0.25],
      },
      ndwi: {
        reposo: [-0.35, 0.05],
        implantacion: [-0.35, 0.05],
        vegetativo: [-0.3, 0.08],
        reproductivo: [-0.25, 0.12],
        madurez: [-0.35, 0.05],
        cosecha: [-0.4, 0.02],
        monitoreo: [-0.3, 0.08],
      },
      ndre: {
        reposo: [0, 0.15],
        implantacion: [0, 0.15],
        vegetativo: [0.12, 0.35],
        reproductivo: [0.18, 0.45],
        madurez: [0.08, 0.28],
        cosecha: [0, 0.18],
        monitoreo: [0.1, 0.34],
      },
      savi: {
        reposo: [0.02, 0.25],
        implantacion: [0.05, 0.3],
        vegetativo: [0.25, 0.65],
        reproductivo: [0.35, 0.75],
        madurez: [0.18, 0.55],
        cosecha: [0.04, 0.28],
        monitoreo: [0.22, 0.62],
      },
      evi: {
        reposo: [0.02, 0.22],
        implantacion: [0.05, 0.25],
        vegetativo: [0.2, 0.55],
        reproductivo: [0.3, 0.7],
        madurez: [0.14, 0.45],
        cosecha: [0.02, 0.22],
        monitoreo: [0.18, 0.55],
      },
    };
    const rango = rangosPorIndice[key]?.[fase] || rangosPorIndice[key]?.monitoreo;
    if (!rango) return undefined;
    return {
      min: rango[0],
      max: rango[1],
      etiqueta: fase,
      nota: this.notaRangoIndice(key, contexto),
    };
  }

  private notaRangoIndice(key: SatelliteIndicator['key'], contexto: ContextoAgronomicoSatelital): string {
    if (contexto.fase === 'implantacion') {
      return 'En implantacion pesa mucho el suelo expuesto; el valor absoluto no debe reemplazar la recorrida.';
    }
    if (contexto.esPerenne && contexto.fase === 'reposo') {
      return 'En reposo se evalua uniformidad, cobertura y malezas; no diagnosticar demanda hidrica activa.';
    }
    const notas: Record<SatelliteIndicator['key'], string> = {
      ndvi: 'Referencia operativa de vigor/cobertura para el estadio actual.',
      ndmi: 'Referencia operativa de humedad en canopia; confirmar con humedad de suelo si existe.',
      ndwi: 'Referencia de superficie y agua/suelo; interpretar junto con lluvia y textura.',
      ndre: 'Referencia de clorofila y hoja funcional; mejora cuando hay cobertura desarrollada.',
      savi: 'Referencia de vigor corregido por suelo expuesto.',
      evi: 'Referencia de biomasa activa, util cuando NDVI se acerca a saturacion.',
    };
    return notas[key];
  }

  private normalizarTexto(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private detalleIndice(key: SatelliteIndicator['key']): string {
    const contexto = this.contextoAgronomico;
    if (contexto.esPerenne && contexto.fase === 'reposo') {
      const detalles: Record<SatelliteIndicator['key'], string> = {
        ndvi: 'Actividad verde en reposo; lectura orientada a uniformidad, cobertura y malezas.',
        ndmi: 'Humedad relativa con baja canopia; no usar sola como diagnostico hidrico del cultivo.',
        ndwi: 'Contraste de superficie y agua/suelo durante baja actividad foliar.',
        ndre: 'Clorofila limitada por reposo; esperar hoja funcional para interpretar nutricion.',
        savi: 'Vigor corregido cuando domina suelo expuesto o cobertura parcial.',
        evi: 'Biomasa activa limitada; util solo como tendencia entre escenas comparables.',
      };
      return detalles[key];
    }

    const detalles: Record<SatelliteIndicator['key'], string> = {
      ndvi: `Vigor verde y cobertura activa para ${contexto.cultivo} en ${contexto.etapa}.`,
      ndmi: `Agua en canopia activa y demanda del cultivo en ${contexto.etapa}.`,
      ndwi: 'Humedad superficial y contraste agua/suelo del lote.',
      ndre: 'Clorofila y hoja funcional, mas util cuando hay cobertura desarrollada.',
      savi: 'Vigor corregido para suelo expuesto o cobertura parcial.',
      evi: 'Vigor mejorado para biomasa alta o NDVI cercano a saturacion.',
    };
    return detalles[key];
  }

  private recomendacionSinImagen(contexto: ContextoAgronomicoSatelital): string {
    return `Esperar una escena limpia para ${contexto.texto}. La lectura satelital se debe validar contra recorrida, clima reciente y manejo del lote.`;
  }

  private recomendacionSatelital(
    ndvi: number,
    balance: number,
    lluvia72: number,
    contexto: ContextoAgronomicoSatelital
  ): string {
    if (contexto.esPerenne && contexto.fase === 'reposo') {
      return `${contexto.cultivo} en ${contexto.etapa}: usar la escena para uniformidad, cobertura de suelo y malezas. No diagnosticar estres hidrico del cultivo sin brotacion u hoja activa.`;
    }

    if (contexto.fase === 'implantacion') {
      if (ndvi < 0.35) {
        return `${contexto.cultivo} en ${contexto.etapa}: priorizar recorrida de emergencia, stand, fallas de implantacion y costras o sectores compactados.`;
      }
      return `${contexto.cultivo} en ${contexto.etapa}: seguir cierre de surco y uniformidad antes de tomar decisiones por vigor absoluto.`;
    }

    if (ndvi < 0.35 && balance < -2) {
      return `${contexto.cultivo} en ${contexto.etapa}: vigor bajo con balance seco; confirmar con humedad de suelo, riego disponible y sintomas reales antes de accionar.`;
    }
    if (ndvi < 0.35 && lluvia72 > 12) {
      return `${contexto.cultivo} en ${contexto.etapa}: vigor bajo con humedad alta; revisar anegamiento, sanidad y compactacion por ambientes.`;
    }
    if (ndvi < 0.55 && balance < -2) {
      return `${contexto.cultivo} en ${contexto.etapa}: vigor medio con demanda atmosferica; recorrer sectores de menor vigor y cruzar con sensores/riego.`;
    }
    if (ndvi < 0.55 && lluvia72 > 12) {
      return `${contexto.cultivo} en ${contexto.etapa}: vigor medio con lluvias; mirar sanidad, exceso de humedad y nutricion segun etapa.`;
    }
    if (contexto.fase === 'reproductivo') {
      return `${contexto.cultivo} en ${contexto.etapa}: sostener monitoreo de canopia funcional, sanidad y agua disponible porque el impacto productivo es alto.`;
    }
    return `${contexto.cultivo} en ${contexto.etapa}: cobertura activa estable; monitorear cambios por ambiente y validar con recorrida.`;
  }

  private lecturaContextualIndice(
    key: SatelliteIndicator['key'],
    value: number,
    contexto: ContextoAgronomicoSatelital,
    sufijo: string
  ): string | undefined {
    if (contexto.esPerenne && contexto.fase === 'reposo') {
      if (key === 'ndvi' || key === 'savi' || key === 'evi') {
        return `${contexto.cultivo} en ${contexto.etapa}: baja actividad verde puede ser esperada. Usar para ver uniformidad, cobertura, malezas o cambios contra escenas previas.${sufijo}`;
      }
      if (key === 'ndmi') {
        return `En reposo y con baja canopia, NDMI no diagnostica por si solo demanda de agua del ${contexto.cultivo}. Cruzar con humedad de suelo y estado de yemas.${sufijo}`;
      }
      if (key === 'ndwi') {
        return `NDWI en ${contexto.etapa}: lectura mas ligada a superficie/suelo que a planta activa; revisar bajos, agua libre o cobertura.${sufijo}`;
      }
      if (key === 'ndre') {
        return `NDRE tiene baja sensibilidad agronomica en reposo; retomar lectura de clorofila cuando haya hoja funcional.${sufijo}`;
      }
    }

    if (contexto.fase === 'implantacion') {
      if (key === 'ndvi' && value < 0.35) {
        return `${contexto.cultivo} en ${contexto.etapa}: vigor bajo puede corresponder a cobertura inicial; revisar emergencia, stand y uniformidad.${sufijo}`;
      }
      if (key === 'ndmi' || key === 'ndwi') {
        return `${contexto.cultivo} con cobertura inicial: interpretar ${key.toUpperCase()} con cautela porque pesa suelo expuesto. Confirmar con recorrida y humedad medida.${sufijo}`;
      }
    }

    if (contexto.esPerenne && key === 'ndvi' && value < 0.35) {
      return `${contexto.cultivo} en ${contexto.etapa}: vigor bajo; revisar brotacion/hoja activa, dano por helada, sanidad y agua disponible por sectores.${sufijo}`;
    }
    if (contexto.esPerenne && key === 'ndmi' && value < -0.05) {
      return `${contexto.cultivo} en ${contexto.etapa}: senal seca de canopia; confirmar con suelo, riego, carga y sintomas antes de concluir estres hidrico.${sufijo}`;
    }
    if (contexto.fase === 'reproductivo' && (key === 'ndvi' || key === 'ndre') && value < 0.45) {
      return `${contexto.cultivo} en ${contexto.etapa}: senal baja en etapa sensible; priorizar recorrida sanitaria, agua disponible y nutricion.${sufijo}`;
    }

    return undefined;
  }

  private lecturaIndice(key: SatelliteIndicator['key'], value?: number): string {
    if (value == null) {
      return 'La capa queda preparada y se completa cuando el worker procese una escena con las bandas necesarias.';
    }

    const contexto = this.contextoAgronomico;
    const tendencia = this.tendenciaIndice(key);
    const sufijo = tendencia ? ` ${tendencia}` : '';
    const contextual = this.lecturaContextualIndice(key, value, contexto, sufijo);
    if (contextual) {
      return contextual;
    }

    if (key === 'ndvi') {
      if (value < 0.35)
        return `Vigor bajo: revisar cobertura, suelo expuesto, sanidad y agua disponible segun etapa.${sufijo}`;
      if (value < 0.55)
        return `Vigor medio: conviene recorrer ambientes y comparar con lluvia, riego y fertilizacion.${sufijo}`;
      return `Cobertura activa buena: sostener monitoreo y buscar cambios por ambiente.${sufijo}`;
    }

    if (key === 'ndmi') {
      if (value < -0.05)
        return `Senal seca en canopia: confirmar con humedad de suelo, cobertura y estado del cultivo.${sufijo}`;
      if (value > 0.25)
        return `Canopia con buena humedad: vigilar enfermedades si coincide con HR alta y lluvias.${sufijo}`;
      return `Humedad de canopia intermedia: usar junto con riego, NDVI y pronostico.${sufijo}`;
    }

    if (key === 'ndwi') {
      if (value < -0.15)
        return `Superficie seca o suelo expuesto: revisar balance de agua y sectores de bajo vigor.${sufijo}`;
      if (value > 0.1) return `Senal humeda: revisar anegamiento, bajos o exceso de agua reciente.${sufijo}`;
      return `Humedad superficial moderada: comparar con lluvia acumulada y textura de suelo.${sufijo}`;
    }

    if (key === 'ndre') {
      if (value < 0.12)
        return `Baja senal de clorofila: revisar nutricion, estado fenologico y sanidad foliar.${sufijo}`;
      if (value > 0.32) return `Buena respuesta de clorofila: util para seguir nutricion y hoja funcional.${sufijo}`;
      return `Clorofila intermedia: mirar tendencia antes de recomendar correcciones.${sufijo}`;
    }

    if (key === 'savi') {
      if (value < 0.25)
        return `Vigor ajustado bajo con peso de suelo expuesto: revisar nacimiento y cobertura.${sufijo}`;
      return `Vigor ajustado estable: buena capa para comparar lotes con cobertura parcial.${sufijo}`;
    }

    if (value < 0.25) return `EVI bajo: posible baja biomasa; confirmar con NDVI, etapa y recorrida.${sufijo}`;
    return `EVI acompana biomasa activa; util cuando NDVI empieza a saturarse en coberturas altas.${sufijo}`;
  }

  private tendenciaIndice(key: SatelliteIndicator['key']): string {
    if (!this.reporte || this.ndvis.length < 2) {
      return '';
    }
    const actual = satelliteIndexValue(this.reporte, key);
    if (actual == null) {
      return '';
    }
    const index = this.ndvis.findIndex((item) => item._id === this.reporte?._id);
    const previo = this.ndvis[index >= 0 ? index + 1 : 1];
    const previoValue = previo ? satelliteIndexValue(previo, key) : null;
    if (previoValue == null) {
      return '';
    }
    const delta = this.redondear(actual - previoValue);
    if (Math.abs(delta) < 0.03) {
      return 'Sin cambio importante contra la escena anterior.';
    }
    return delta > 0
      ? `Mejora ${this.formatear(delta)} contra la escena anterior.`
      : `Cae ${this.formatear(Math.abs(delta))} contra la escena anterior.`;
  }

  private calcularFechaMinima(): void {
    const cultivo = this.canonicalCultivo(this.siembra?.semilla?.cultivo);
    if (esCultivoPerenne(cultivo)) {
      this.fechaMinima = this.inicioMonitoreoPerenne(
        this.siembra?.fechaCosecha ? new Date(this.siembra.fechaCosecha) : this.hoy
      );
      return;
    }

    const fechaSiembra = this.siembra?.fechaSiembra ? new Date(this.siembra.fechaSiembra) : undefined;
    if (fechaSiembra && Number.isFinite(fechaSiembra.getTime())) {
      this.fechaMinima = new Date(fechaSiembra.getFullYear(), fechaSiembra.getMonth(), fechaSiembra.getDate() - 1);
      return;
    }

    this.fechaMinima = new Date(this.hoy.getFullYear(), this.hoy.getMonth() - 6, this.hoy.getDate());
  }

  private reportePreferido(reportes: IReporteNDVI[]): IReporteNDVI {
    const ordenados = [...reportes].sort((a, b) => this.fechaReporteMs(b) - this.fechaReporteMs(a));
    const operativos = ordenados.filter((reporte) =>
      satelliteIndexValue(reporte, 'ndvi') != null,
    );
    const base = operativos.length ? operativos : ordenados;
    const masNuevo = base[0];
    const limite = this.fechaReporteMs(masNuevo) - this.ventanaPreferenciaSentinelDias * 24 * 60 * 60 * 1000;
    const candidatos = base.filter((reporte) => this.fechaReporteMs(reporte) >= limite);
    return (
      candidatos.sort((a, b) => {
        const prioridad = this.prioridadColeccion(a) - this.prioridadColeccion(b);
        return prioridad || this.fechaReporteMs(b) - this.fechaReporteMs(a);
      })[0] || masNuevo
    );
  }

  private prioridadColeccion(reporte: IReporteNDVI): number {
    const coleccion = (reporte.coleccion || '').toLowerCase();
    if (coleccion.includes('sentinel')) return 0;
    if (coleccion.includes('landsat')) return 1;
    return 2;
  }

  private fechaReporteMs(reporte: IReporteNDVI): number {
    const fecha = parseSatelliteCalendarDate(
      reporte.fechaDeLaImagen || reporte.fechaCreacion,
    ).getTime();
    return Number.isFinite(fecha) ? fecha : 0;
  }

  private async listarNDVIs(): Promise<void> {
    const idLote = this.lote?._id;
    if (!idLote) {
      this.ndvi$?.unsubscribe();
      this.ndvis = [];
      this.reporte = undefined;
      this.actualizarHistorialIndice();
      this.satelliteRasterVisible = false;
      this.satelliteRasterBlockedReason = 'Esperando identificador del lote para consultar escenas.';
      return;
    }

    const filter: IFilter<IReporteNDVI> = {
      idLote,
      fechaDeLaImagen: {
        $gte: this.fechaMinima.toISOString(),
      },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 0,
      sort: '-fechaDeLaImagen',
    };

    this.ndvi$?.unsubscribe();
    this.ndvi$ = this.listados.subscribe<IListado<IReporteNDVI>>('reportendvis', query).subscribe((data) => {
      this.ndvis = (data.datos || [])
        .filter((reporte) => this.reporteValidoParaLote(reporte, idLote))
        .filter((reporte) => satelliteReportIsOperational(reporte))
        .sort((a, b) => this.fechaReporteMs(b) - this.fechaReporteMs(a));
      if (this.ndvis.length > 0) {
        const estaEnLista = this.reporte && this.ndvis.some((n) => n._id === this.reporte!._id);
        const preferido = this.reportePreferido(this.ndvis);
        if (!estaEnLista || !this.seleccionManual) {
          this.reporte = preferido;
          this.fecha = parseSatelliteCalendarDate(
            preferido.fechaDeLaImagen || preferido.fechaCreacion || new Date(),
          );
        }
        this.asegurarCapaOperativa(this.reporte);
      } else {
        this.reporte = undefined;
        this.seleccionManual = false;
      }
      this.actualizarHistorialIndice();
      this.programarRenderMapaSatelital();
    });

    this.ultimoLoteListado = String(idLote);
    await this.listados.getLastValue('reportendvis', query);
  }

  private asegurarCapaOperativa(reporte?: IReporteNDVI): void {
    if (!reporte) return;
    const disponibles = operationalSatelliteIndexKeys(reporte);
    if (!disponibles.includes(this.capaSatelitalActiva)) {
      this.capaSatelitalActiva = disponibles[0] || 'ndvi';
    }
  }

  public mostrarLeyenda(): void {
    this.dialogHandler.open(NdviLegendComponent, {
      header: 'Leyenda NDVI',
      width: '250px',
      data: {
        orientation: 'vertical',
      },
    });
  }

  public async generarNdviSatelital(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.lote?._id || this.generandoSatelital) return;

    this.generandoSatelital = true;
    this.seleccionManual = false;
    try {
      const response = await this.loteService.generarNdvi(this.lote._id);
      if (response.encolado) {
        this.helper.notifSuccess(response.mensaje || 'NDVI satelital encolado');
        this.programarRefrescosSatelitales(6, this.ndvis[0]?._id);
      } else {
        this.helper.notifWarn(response.mensaje || 'No se pudo encolar NDVI');
      }
    } catch (error) {
      this.helper.notifError(error);
    }
    this.generandoSatelital = false;
  }

  private get pronosticos(): IPronosticoEstacionMeteorologica[] {
    return ((this.lote as any)?.establecimiento?.prediccionClimatica?.pronosticos ||
      []) as IPronosticoEstacionMeteorologica[];
  }

  private estadoNdvi(
    ndvi: number,
    contexto: ContextoAgronomicoSatelital
  ): Pick<NdviAnalisis, 'estado' | 'tono' | 'resumen'> {
    if (contexto.esPerenne && contexto.fase === 'reposo') {
      if (ndvi < 0.35) {
        return {
          estado: 'Reposo vegetativo',
          tono: 'ok',
          resumen: `${contexto.cultivo} esta en ${contexto.etapa}; una baja senal verde puede ser fenologicamente esperable.`,
        };
      }
      return {
        estado: 'Actividad verde en reposo',
        tono: 'warn',
        resumen: `Hay senal verde aun con ${contexto.cultivo} en ${contexto.etapa}; revisar cobertura, malezas o diferencias por ambiente.`,
      };
    }

    if (contexto.fase === 'implantacion' && ndvi < 0.35) {
      return {
        estado: 'Cobertura inicial',
        tono: 'warn',
        resumen: `${contexto.cultivo} esta en ${contexto.etapa}; interpretar vigor absoluto con foco en nacimiento y uniformidad.`,
      };
    }

    if (ndvi >= 0.72) {
      return {
        estado: 'Vigor alto',
        tono: 'ok',
        resumen: 'Cobertura activa y uniforme para una siembra en buen estado.',
      };
    }
    if (ndvi >= 0.55) {
      return {
        estado: 'Vigor bueno',
        tono: 'ok',
        resumen: 'El lote mantiene actividad verde, conviene seguir la evolucion por ambientes.',
      };
    }
    if (ndvi >= 0.35) {
      return {
        estado: 'Vigor medio',
        tono: 'warn',
        resumen: 'Hay senales de heterogeneidad o cobertura parcial que justifican recorrida.',
      };
    }
    return {
      estado: 'Vigor bajo',
      tono: 'risk',
      resumen: 'Puede indicar estres, suelo descubierto, fallas de implantacion o problemas sanitarios.',
    };
  }

  private tendenciaNdvi(): string {
    if (!this.reporte || this.ndvis.length < 2) {
      return 'Sin comparativo previo';
    }
    const actual = satelliteIndexValue(this.reporte, 'ndvi');
    if (actual == null) {
      return 'Sin comparativo previo';
    }
    const index = this.ndvis.findIndex((item) => item._id === this.reporte?._id);
    const previo = this.ndvis[index >= 0 ? index + 1 : 1];
    const previoValue = previo ? satelliteIndexValue(previo, 'ndvi') : null;
    if (previoValue == null) {
      return 'Sin comparativo previo';
    }
    const delta = this.redondear(actual - previoValue);
    if (Math.abs(delta) < 0.03) {
      return 'Estable respecto al reporte anterior';
    }
    return delta > 0 ? `Sube ${this.formatear(delta)}` : `Baja ${this.formatear(Math.abs(delta))}`;
  }

  private suma(values: Array<number | null | undefined>): number {
    return this.redondear(values.reduce<number>((acc, value) => acc + (value || 0), 0));
  }

  private numero(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return value;
  }

  private redondear(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatear(value: number): string {
    return value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }

  private diasDesde(fecha: Date): number {
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
    const fin = new Date(this.hoy.getFullYear(), this.hoy.getMonth(), this.hoy.getDate()).getTime();
    return Math.max(0, Math.round((fin - inicio) / 86400000));
  }

  private programarRefrescosSatelitales(intentos = 4, ultimoReporteId?: string): void {
    if (intentos <= 0) return;
    clearTimeout(this.refreshTimeout);
    this.refreshTimeout = setTimeout(async () => {
      await this.listarNDVIs();
      const nuevoReporteId = this.ndvis[0]?._id;
      if (!nuevoReporteId || nuevoReporteId === ultimoReporteId) {
        this.programarRefrescosSatelitales(intentos - 1, ultimoReporteId);
      }
    }, 12000);
  }

  async ngOnInit(): Promise<void> {
    this.calcularFechaMinima();
    const idLote = this.lote?._id ? String(this.lote._id) : undefined;
    if (idLote && idLote !== this.ultimoLoteListado) {
      await this.listarNDVIs();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const loteCambio = !!changes['lote'];
    const siembraCambio = !!changes['siembra'];
    if (!loteCambio && !siembraCambio) {
      return;
    }

    const idLote = this.lote?._id ? String(this.lote._id) : undefined;
    if (idLote === this.ultimoLoteListado && !siembraCambio) {
      return;
    }

    if (loteCambio && idLote !== this.ultimoLoteListado) {
      this.seleccionManual = false;
      this.reporte = undefined;
      this.ndvis = [];
      this.satelliteRasterVisible = false;
    }
    this.calcularFechaMinima();
    this.actualizarHistorialIndice();
    void this.listarNDVIs();
    this.programarRenderMapaSatelital();
  }

  ngAfterViewInit(): void {
    this.renderizarMapaSatelital();
  }

  ngOnDestroy(): void {
    this.ndvi$?.unsubscribe();
    clearTimeout(this.refreshTimeout);
    this.satelliteMap?.setTarget(undefined);
  }
}
