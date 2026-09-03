import { Component, ElementRef, HostListener, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { ILorawanRawFrame, ILorawanRawReading, IReporte } from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { buildSentekChannelCoverage, buildSentekProfile, normalizarProfundidadSentek } from '../sentek-profile';

type SoilMetricKey = 'humedad' | 'salinidad' | 'temperatura';

interface SoilMetricDefinition {
  key: SoilMetricKey;
  title: string;
  unit: string;
  color: string;
  decimals: number;
  displayDecimals: number;
}

interface HistoricalPoint {
  x: number;
  y: number | null;
  depth: number;
  custom?: { isGap?: boolean };
  fCnt?: number;
  frameKey?: string;
  metric?: SoilMetricKey;
  marker?: { enabled: boolean };
  profileChannels?: number[];
  raw?: number;
  rawUnit?: string;
}

interface NapaPoint {
  x: number;
  y: number;
  unit: string;
}

interface AnalogPoint {
  x: number;
  y: number;
}

interface RainPoint {
  custom?: {
    originalDate?: string;
    originalDateOnly?: boolean;
  };
  dayEnd?: number;
  dayStart?: number;
  x: number;
  y: number;
}

export interface SentekRainfallPoint {
  fecha: string;
  milimetros: number;
}

export interface SentekDaylightPoint {
  amanecer: string;
  atardecer: string;
  fecha: string;
}

export interface SentekAgronomicThresholds {
  capacidadCampoPct: number;
  confianza?: 'high' | 'medium' | 'low' | 'unavailable';
  depthFromCm?: number;
  depthToCm?: number;
  fuente?: string;
  origen?: 'observed' | 'estimated' | 'reference' | 'unknown';
  puntoMarchitezPct: number;
  recargaPct?: number;
  stale?: boolean;
}

interface SentekAgronomicReference {
  capacidadCampoPct: number;
  confianza?: SentekAgronomicThresholds['confianza'];
  depthFromCm?: number;
  depthToCm?: number;
  fuente?: string;
  origen?: SentekAgronomicThresholds['origen'];
  puntoMarchitezPct: number;
  recargaPct: number;
}

interface SolarInterval {
  from: number;
  to: number;
}

interface ProfileRow {
  profundidad: number;
  formatted: string;
  raw?: string;
}

interface ProfileRecentWindow {
  allowedFrameKeys: Set<string>;
  dataEnd: number;
  dataStart: number;
  gapTimestampsByIdentity: Map<string, number[]>;
  latestPoints: HistoricalPoint[];
  missingDepths: number[];
  visibleEnd: number;
  visibleStart: number;
}

@Component({
  selector: 'app-grafico-historico-suelo',
  imports: [SharedModule, ChartComponent],
  templateUrl: './grafico-historico-suelo.component.html',
  styleUrl: './grafico-historico-suelo.component.scss',
})
export class GraficoHistoricoSueloComponent implements OnChanges {
  @ViewChild('depthSelector') private depthSelector?: ElementRef<HTMLDetailsElement>;

  @Input() reportes: IReporte[] = [];
  @Input() rawFrames: ILorawanRawFrame[] = [];
  @Input() lluvias: SentekRainfallPoint[] = [];
  @Input() daylight: SentekDaylightPoint[] = [];
  @Input() agronomicThresholds?: SentekAgronomicThresholds;
  @Input() agronomicThresholdsUnavailable = false;
  @Input() timeZone = 'America/Argentina/Buenos_Aires';
  @Input() periodDays = 30;
  @Input() periodEnd?: string | number;
  @Input() titulo?: string;
  @Input() subtitulo?: string;
  @Input() fechaDesde?: string;
  /** Permite usar este componente solo para el perfil Sentek. */
  @Input() mostrarNapa = true;
  /** La entrada analogica pertenece a otro dispositivo logico en el lote. */
  @Input() mostrarEntradaAnalogica = true;

  public chartOptions?: any;
  public napaChartOptions?: any;
  public analogChartOptions?: any;
  public selectedMetric: SoilMetricKey = 'humedad';
  public metricOptions: Array<{ label: string; value: SoilMetricKey }> = [];
  public profileRows: ProfileRow[] = [];
  public resumen = '';
  public napaResumen = '';
  public analogResumen = '';
  public analogActual?: number;
  public analogActualFecha?: number;
  public profileCoverageNotice = '';
  public profileFreshnessNotice = '';
  public rainfallAvailabilityNotice = '';
  public hasDaylightBands = false;
  public hasRainfallSeries = false;
  public agronomicReference?: SentekAgronomicReference;
  public readonly depthOptionsCm = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
  public selectedDepthsCm = [...this.depthOptionsCm];
  public profileRecentMissingDepths: number[] = [];
  public controllerCoverageNotice = '';
  public controllerCoverageComplete = false;
  public napaActual?: number;
  public napaActualFecha?: number;
  public napaEscalaMaxima = 10;
  public napaPosicionVisual = 50;
  public napaLineaVisual = 27;
  public assignmentNotice = '';

  private readonly definitions: SoilMetricDefinition[] = [
    {
      key: 'humedad',
      title: 'Humedad de suelo',
      unit: '%',
      color: '#2f9fe8',
      decimals: 1,
      displayDecimals: 5,
    },
    {
      key: 'salinidad',
      title: 'Salinidad relativa',
      unit: 'VIC',
      color: '#8e44ad',
      decimals: 1,
      displayDecimals: 3,
    },
    {
      key: 'temperatura',
      title: 'Temperatura',
      unit: 'C',
      color: '#e74c3c',
      decimals: 1,
      displayDecimals: 1,
    },
  ];

  private readonly depthColors = new Map<number, string>([
    [10, '#22cfc7'],
    [20, '#2f9fe8'],
    [30, '#f59e0b'],
    [40, '#ef4444'],
    [50, '#8b5cf6'],
    [60, '#10b981'],
    [70, '#64748b'],
    [80, '#ec4899'],
    [90, '#14b8a6'],
    [100, '#84cc16'],
    [110, '#f97316'],
    [120, '#06b6d4'],
  ]);

  private readonly expectedSentekDepthsCm = this.depthOptionsCm;
  private readonly fallbackTimeZone = 'America/Argentina/Buenos_Aires';
  private readonly sentekSweepToleranceMs = 6 * 60 * 1000;
  private readonly sentekFreshnessToleranceMs = 2 * 60 * 60 * 1000;
  private readonly sentekVisiblePaddingRatio = 0.04;
  private readonly sentekVisibleMaxPaddingMs = 10 * 60 * 1000;
  /**
   * Los barridos pueden llegar incompletos o con una cadencia irregular de
   * varias horas. Un corte visual se reserva para una interrupcion realmente
   * prolongada; los markers siguen identificando exclusivamente lecturas
   * observadas y no se agregan valores interpolados al dataset.
   */
  private readonly sentekContinuousProfileGapMs = 6 * 60 * 60 * 1000;
  private readonly sentekMarkerLimit = 80;

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['reportes'] ||
      changes['rawFrames'] ||
      changes['lluvias'] ||
      changes['daylight'] ||
      changes['agronomicThresholds'] ||
      changes['agronomicThresholdsUnavailable'] ||
      changes['timeZone'] ||
      changes['periodDays'] ||
      changes['periodEnd'] ||
      changes['fechaDesde'] ||
      changes['mostrarNapa'] ||
      changes['mostrarEntradaAnalogica']
    ) {
      this.prepareOptions();
    }
  }

  public onMetricChange(metric: SoilMetricKey): void {
    this.selectedMetric = metric;
    this.prepareOptions();
  }

  public get depthSelectionLabel(): string {
    if (this.selectedDepthsCm.length === this.depthOptionsCm.length) return 'Todos los niveles';
    if (this.selectedDepthsCm.length === 1) return `${this.selectedDepthsCm[0]} cm`;
    return `${this.selectedDepthsCm.length} niveles`;
  }

  public isDepthVisible(depth: number): boolean {
    return this.selectedDepthsCm.includes(depth);
  }

  public onDepthVisibilityChange(depth: number, visible: boolean): void {
    if (!this.depthOptionsCm.includes(depth)) return;
    const next = visible
      ? [...new Set([...this.selectedDepthsCm, depth])]
      : this.selectedDepthsCm.filter((candidate) => candidate !== depth);
    if (!next.length) return;
    this.selectedDepthsCm = next.sort((left, right) => left - right);
    this.prepareOptions();
  }

  public showAllDepths(): void {
    if (this.selectedDepthsCm.length === this.depthOptionsCm.length) return;
    this.selectedDepthsCm = [...this.depthOptionsCm];
    this.prepareOptions();
  }

  @HostListener('document:click', ['$event'])
  public closeDepthSelectorOnOutsideClick(event: MouseEvent): void {
    const selector = this.depthSelector?.nativeElement;
    const target = event.target;
    if (!selector?.open || !(target instanceof Node) || selector.contains(target)) return;
    selector.open = false;
  }

  public exportarCsv(): void {
    const rows = this.getCsvRows();
    if (!rows.length) return;

    const headers = [
      'Fecha',
      'DevEUI',
      'ID trama',
      'FCnt',
      'Canales SDI-12',
      'Profundidad cm',
      'Humedad suelo %',
      'Salinidad VIC',
      'Temperatura C',
      'Valor crudo',
      'Unidad cruda',
      'Calidad decoder',
      'Motivo calidad',
    ];
    const csv = [headers, ...rows].map((row) => row.map((value) => this.csvCell(value)).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-sentek-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  public get rawEvidenceFrames(): ILorawanRawFrame[] {
    return this.filteredRawFrames().slice(-20).reverse();
  }

  public rawReadingCount(frame: ILorawanRawFrame): number {
    return (frame.readings || []).length;
  }

  public rawInvalidReadingCount(frame: ILorawanRawFrame): number {
    return (frame.readings || []).filter((reading) => reading.quality === 'invalid').length;
  }

  public rawUnverifiedReadingCount(frame: ILorawanRawFrame): number {
    return (frame.readings || []).filter((reading) => reading.quality === 'unverified').length;
  }

  private prepareOptions(): void {
    this.assignmentNotice = this.buildAssignmentNotice();
    const controllerCoverage = buildSentekChannelCoverage(this.filteredRawFrames());
    this.controllerCoverageNotice = controllerCoverage?.mensaje || '';
    this.controllerCoverageComplete = controllerCoverage?.completa || false;
    const available = this.definitions.filter((definition) => this.hasMetric(definition.key));
    this.metricOptions = available.map((definition) => ({ label: definition.title, value: definition.key }));

    if (!available.some((definition) => definition.key === this.selectedMetric)) {
      this.selectedMetric = available[0]?.key || 'humedad';
    }

    if (!available.length) {
      this.chartOptions = undefined;
      this.hasDaylightBands = false;
      this.hasRainfallSeries = false;
      this.profileRows = [];
      this.resumen = '';
      this.profileCoverageNotice = '';
      this.profileFreshnessNotice = '';
      this.profileRecentMissingDepths = [];
      this.napaChartOptions = this.mostrarNapa ? this.buildNapaChartOptions() : undefined;
      this.analogChartOptions = this.mostrarEntradaAnalogica ? this.buildAnalogChartOptions() : undefined;
      return;
    }

    const definition = this.getDefinition(this.selectedMetric);
    const historicalSeriesByMetric = new Map<SoilMetricKey, any[]>(
      this.definitions.map((item) => [item.key, this.buildHistoricalSeries(item)])
    );
    const historicalSeries = historicalSeriesByMetric.get(definition.key) || [];
    const recentWindow = this.buildRecentProfileWindow(historicalSeriesByMetric, definition.key);
    const allSeries = this.cropSeriesToProfileWindow(historicalSeries, recentWindow);
    const latestPoints = recentWindow?.latestPoints || [];
    this.profileRows = this.buildProfileRows(definition, latestPoints);
    this.resumen = this.buildResumen(definition, allSeries, latestPoints);
    this.profileCoverageNotice = this.buildProfileCoverageNotice(latestPoints);
    this.chartOptions = this.buildUnifiedTimeSeriesChartOptions(definition, allSeries, recentWindow);
    this.napaChartOptions = this.mostrarNapa ? this.buildNapaChartOptions() : undefined;
    this.analogChartOptions = this.mostrarEntradaAnalogica ? this.buildAnalogChartOptions() : undefined;
  }

  private buildHistoricalSeries(definition: SoilMetricDefinition): any[] {
    const byDepth = new Map<number, HistoricalPoint[]>();

    for (const frame of this.filteredRawFrames()) {
      const timestamp = new Date(frame.timestamp).getTime();
      const frameKey = `raw:${frame.id || `${frame.timestamp}:${frame.fCnt ?? 'sin-fcnt'}`}`;
      for (const reading of this.rawReadingsForMetric(frame, definition.key)) {
        if (reading.depthCm === undefined) continue;
        // El backend ya resolvio la profundidad desde la configuracion vigente
        // del dispositivo. Solo los reportes legacy requieren normalizacion.
        const depth = reading.depthCm;
        if (!byDepth.has(depth)) byDepth.set(depth, []);
        byDepth.get(depth)!.push({
          x: timestamp,
          y: reading.value,
          depth,
          fCnt: frame.fCnt,
          frameKey,
          metric: definition.key,
          profileChannels: frame.profileChannels,
          raw: reading.rawValue,
          rawUnit: reading.rawUnit,
        });
      }
    }

    for (const reporte of this.rawFrames.length ? [] : this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;
      const frameKey = `report:${(reporte as any)._id || timestamp}`;

      const profile = buildSentekProfile(reporte);
      for (const row of profile) {
        const metric = row[definition.key];
        if (!metric || metric.actual === undefined || metric.actual === null || !Number.isFinite(metric.actual)) {
          continue;
        }

        if (!byDepth.has(row.profundidad)) {
          byDepth.set(row.profundidad, []);
        }

        byDepth.get(row.profundidad)!.push({
          x: timestamp,
          y: metric.actual,
          depth: row.profundidad,
          frameKey,
          metric: definition.key,
          raw: metric.crudo,
          rawUnit: metric.unidadCruda,
        });
      }
    }

    return [...byDepth.entries()]
      .sort(([a], [b]) => a - b)
      .map(([depth, data]) => ({
        color: this.depthColors.get(depth) || definition.color,
        data: data.sort((a, b) => a.x - b.x),
        lineWidth: 1.8,
        marker: this.buildSentekMarkerOptions(data.length),
        name: `${depth} cm`,
        type: 'spline',
        turboThreshold: 0,
        custom: {
          decimals: definition.displayDecimals,
          depthCm: depth,
          isSoil: true,
          metric: definition.key,
          unit: definition.unit,
        },
      }));
  }

  private buildUnifiedTimeSeriesChartOptions(
    definition: SoilMetricDefinition,
    series: any[],
    recentWindow?: ProfileRecentWindow
  ): any {
    const rainHalfDayMs = 12 * 60 * 60 * 1000;
    const rainPoints =
      definition.key === 'humedad'
        ? this.buildRainPoints()
            .filter(
              (point) =>
                !recentWindow ||
                (point.dayStart !== undefined && point.dayEnd !== undefined
                  ? point.dayEnd > recentWindow.visibleStart && point.dayStart < recentWindow.visibleEnd
                  : point.x + rainHalfDayMs >= recentWindow.visibleStart &&
                    point.x - rainHalfDayMs <= recentWindow.visibleEnd)
            )
            .map((point) => {
              if (!recentWindow || point.dayStart === undefined || point.dayEnd === undefined) return point;
              const intersectionStart = Math.max(point.dayStart, recentWindow.visibleStart);
              const intersectionEnd = Math.min(point.dayEnd, recentWindow.visibleEnd);
              return {
                ...point,
                x: intersectionStart + Math.max(1, Math.floor((intersectionEnd - intersectionStart) / 2)),
              };
            })
        : [];
    const showRain = rainPoints.length > 0;
    this.hasRainfallSeries = showRain;
    this.rainfallAvailabilityNotice =
      definition.key === 'humedad' && !showRain
        ? this.lluvias.length
          ? 'Sin lluvia registrada en el período'
          : 'Sin lluvia histórica disponible'
        : '';
    this.profileRecentMissingDepths = recentWindow?.missingDepths || [];
    this.profileFreshnessNotice = this.buildProfileFreshnessNotice(this.profileRecentMissingDepths);
    const visibleProfileStart = recentWindow?.visibleStart;
    const visibleProfileEnd = recentWindow?.visibleEnd;
    const rainMax = Math.max(1, ...rainPoints.map((point) => point.y));
    const metricDomain =
      definition.key === 'humedad' ? this.buildHumidityDomain(series) : this.buildMetricDomain(definition, series);
    this.agronomicReference = definition.key === 'humedad' ? this.validAgronomicReference() : undefined;
    const agronomicBands = this.buildAgronomicPlotBands(metricDomain.max);
    const agronomicLines = this.buildAgronomicPlotLines();
    const soilAxisId = `sentek-${definition.key}-shared`;
    const rainAxisId = 'sentek-rain-shared';
    const solarAxisId = 'sentek-solar-strip';
    const solarContext = this.buildSolarContextSeries(visibleProfileStart, visibleProfileEnd, solarAxisId);
    this.hasDaylightBands = solarContext.series.length > 0;
    const mainPaneHeight = this.hasDaylightBands ? '91%' : '97%';
    const soilAxis = {
      id: soilAxisId,
      max: metricDomain.max,
      min: metricDomain.min,
      title: {
        text:
          definition.key === 'humedad'
            ? 'Humedad volumétrica (% VWC)'
            : definition.key === 'temperatura'
              ? 'Temperatura (°C)'
              : 'Salinidad relativa (VIC)',
        margin: 12,
        style: { color: 'var(--p-text-color)', fontSize: '12px', fontWeight: '750' },
      },
      labels: {
        enabled: true,
        format: definition.key === 'humedad' ? '{value:.0f}%' : `{value:.${definition.decimals}f}`,
        style: { color: 'var(--p-text-muted-color)', fontSize: '11px', fontWeight: '650' },
      },
      endOnTick: false,
      startOnTick: false,
      gridLineWidth: 1,
      height: mainPaneHeight,
      top: '0%',
      offset: 0,
      plotBands: agronomicBands,
      plotLines: agronomicLines,
      ...(definition.key === 'humedad' ? { tickInterval: 10 } : {}),
    };

    const rainAxis = showRain
      ? {
          id: rainAxisId,
          max: rainMax * 1.08,
          min: 0,
          title: {
            text: 'mm',
            align: 'high',
            rotation: 0,
            style: { color: '#2f9fe8', fontSize: '11px', fontWeight: '800' },
          },
          labels: {
            enabled: true,
            format: '{value:.1f}',
            style: { color: '#2f9fe8', fontSize: '10px', fontWeight: '700' },
          },
          lineWidth: 0,
          tickWidth: 0,
          tickAmount: 3,
          gridLineWidth: 0,
          height: mainPaneHeight,
          top: '0%',
          offset: 0,
          opposite: true,
        }
      : undefined;
    const visibleSpan = Math.max(0, (visibleProfileEnd || 0) - (visibleProfileStart || 0));
    const rainPointRange = visibleSpan
      ? Math.min(24 * 60 * 60 * 1000, Math.max(15 * 60 * 1000, visibleSpan / 8))
      : 24 * 60 * 60 * 1000;
    const rainSeries = showRain
      ? [
          {
            color: 'rgba(47, 159, 232, 0.22)',
            custom: { decimals: 1, isRain: true, unit: 'mm' },
            data: rainPoints,
            id: 'sentek-rain-shared',
            name: 'Lluvia (mm)',
            pointRange: rainPointRange,
            showInLegend: false,
            type: 'column',
            yAxis: rainAxisId,
            zIndex: 1,
          },
        ]
      : [];
    const soilSeries = series.map((item) => {
      const depth = Number(item.custom?.depthCm);
      return {
        ...item,
        events: {
          legendItemClick: (event: any) => {
            this.onDepthVisibilityChange(depth, !this.isDepthVisible(depth));
            const visible = this.isDepthVisible(depth);
            event?.target?.setVisible?.(visible, false);
            event?.target?.chart?.redraw?.();
            return false;
          },
        },
        id: `sentek-${definition.key}-${depth}`,
        showInLegend: true,
        visible: this.isDepthVisible(depth),
        yAxis: soilAxisId,
        zIndex: 3,
      };
    });
    const plottedSeries = [...rainSeries, ...soilSeries, ...solarContext.series];
    const chartTimeZone = this.resolvedTimeZone;

    const formatTooltipDateTime = (timestamp: number): string =>
      new Date(timestamp).toLocaleString('es-AR', {
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        month: '2-digit',
        timeZone: chartTimeZone,
        year: 'numeric',
      });
    const sweepToleranceMs = this.sentekSweepToleranceMs;

    return {
      chart: {
        animation: false,
        backgroundColor: 'transparent',
        height: 460,
        marginLeft: 70,
        marginRight: showRain ? 56 : 20,
        spacingBottom: 12,
        spacingLeft: 4,
        spacingRight: 8,
        spacingTop: 8,
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        min: visibleProfileStart ?? null,
        max: visibleProfileEnd ?? null,
        plotBands: [],
        endOnTick: false,
        startOnTick: false,
        crosshair: {
          color: 'rgba(34, 211, 200, 0.24)',
          width: 2,
        },
        title: {
          text: 'Fecha y hora',
          style: { color: 'var(--p-text-color)', fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          format: '{value:%d/%m<br/>%H:%M}',
          style: { color: 'var(--p-text-color)', fontSize: '13px', fontWeight: '600' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis: [
        soilAxis,
        ...(rainAxis ? [rainAxis] : []),
        ...(this.hasDaylightBands
          ? [
              {
                id: solarAxisId,
                max: 1,
                min: -1,
                title: { text: undefined },
                labels: { enabled: false },
                gridLineWidth: 0,
                height: '2%',
                lineWidth: 0,
                offset: 0,
                endOnTick: false,
                startOnTick: false,
                tickLength: 0,
                tickWidth: 0,
                top: '94%',
                visible: true,
              },
            ]
          : []),
      ],
      legend: {
        align: 'center',
        enabled: soilSeries.length > 0,
        itemDistance: 8,
        itemWidth: 82,
        margin: 8,
        maxHeight: 76,
        navigation: {
          activeColor: '#0f766e',
          inactiveColor: '#94a3b8',
        },
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '12px',
          fontWeight: '750',
        },
        layout: 'horizontal',
        symbolWidth: 22,
        verticalAlign: 'bottom',
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        shared: false,
        shadow: true,
        formatter: function (this: any) {
          const point = (this.point || this) as HistoricalPoint & {
            color?: string;
            options?: { custom?: RainPoint['custom'] };
            series?: any;
          };
          if (point.custom?.isGap) return false;
          const seriesCustom = point.series?.userOptions?.custom || {};
          const pointCustom = point.options?.custom || {};
          const decimals = seriesCustom.decimals ?? definition.decimals;
          const unit = seriesCustom.unit || definition.unit;
          if (seriesCustom.isRain) {
            const dateLabel =
              pointCustom.originalDateOnly && pointCustom.originalDate
                ? pointCustom.originalDate
                : formatTooltipDateTime(point.x);
            return `<span style="font-size:12px">${dateLabel}</span><br/><span style="color:#2f9fe8">&#9646;</span> Lluvia: <strong>${Number(point.y).toFixed(1)} mm</strong>`;
          }

          const chartSeries = (point.series?.chart?.series || []).filter(
            (candidate: any) => candidate.visible !== false && candidate.userOptions?.custom?.isSoil
          );
          const profileRows = chartSeries
            .map((candidate: any) => {
              const candidatePoints = (candidate.points || candidate.data || []).filter(
                (candidatePoint: any) =>
                  Number.isFinite(candidatePoint?.x) &&
                  Number.isFinite(candidatePoint?.y) &&
                  !candidatePoint?.custom?.isGap
              );
              const nearest = candidatePoints.reduce((best: any, candidatePoint: any) => {
                if (!best) return candidatePoint;
                return Math.abs(candidatePoint.x - point.x) < Math.abs(best.x - point.x) ? candidatePoint : best;
              }, undefined);
              const distance = nearest ? Math.abs(nearest.x - point.x) : Number.POSITIVE_INFINITY;
              if (!nearest || distance > sweepToleranceMs) return undefined;
              const custom = candidate.userOptions?.custom || {};
              return {
                color: candidate.color || candidate.userOptions?.color || '#22cfc7',
                decimals: custom.decimals ?? decimals,
                depthCm: Number(custom.depthCm),
                name: candidate.name || candidate.userOptions?.name || '',
                unit: custom.unit || unit,
                value: Number(nearest.y),
              };
            })
            .filter(Boolean)
            .sort((left: any, right: any) => left.depthCm - right.depthCm);

          if (!profileRows.length) {
            return `<span style="font-size:12px">${formatTooltipDateTime(point.x)}</span><br/><span style="color:${point.color}">&bull;</span> ${point.series?.name || ''}: <strong>${Number(point.y).toFixed(decimals)} ${unit}</strong>`;
          }

          const values = profileRows
            .map(
              (row: any) =>
                `<br/><span style="color:${row.color}">&bull;</span> ${row.name}: <strong>${row.value.toFixed(row.decimals)} ${row.unit}</strong>`
            )
            .join('');
          return `<span style="font-size:12px">${formatTooltipDateTime(point.x)}</span>${values}`;
        },
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
      },
      plotOptions: {
        column: {
          animation: false,
          borderWidth: 0,
          groupPadding: 0,
          grouping: false,
          pointPadding: 0.04,
        },
        spline: {
          animation: false,
          enableMouseTracking: true,
          lineWidth: 1.8,
          marker: {
            enabled: true,
            lineWidth: 0.8,
            radius: 1.8,
            states: {
              hover: {
                enabled: true,
                radius: 3.2,
              },
            },
          },
          states: {
            hover: {
              lineWidth: 2.2,
            },
          },
        },
        series: {
          animation: false,
          connectNulls: false,
          states: { inactive: { opacity: 0.32 } },
          turboThreshold: 0,
        },
      },
      series: plottedSeries,
      credits: { enabled: false },
      accessibility: { enabled: false },
      lang: { noData: 'Sin lecturas historicas para esta variable.' },
      noData: { style: { color: '#60708a', fontWeight: '700' } },
      time: { timezone: chartTimeZone },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: 410, marginLeft: 62, marginRight: showRain ? 48 : 12 },
              legend: { itemStyle: { fontSize: '11px' }, itemWidth: 74, maxHeight: 84 },
            },
          },
        ],
      },
    };
  }

  /**
   * Un barrido Sentek llega repartido en varias tramas. Cada grupo dura como
   * maximo la misma tolerancia del agregador; no se encadena por proximidad.
   * El barrido 36/36 (12 H + 12 S + 12 T) se usa solamente para describir el
   * ultimo perfil coherente. La curva conserva cada lectura valida observada
   * dentro del periodo solicitado, aunque pertenezca a un barrido parcial. No
   * completa ni promedia identidades ausentes. Solo agrega un null cuando dos
   * observaciones reales quedan separadas por una interrupcion prolongada.
   */
  private buildRecentProfileWindow(
    seriesByMetric: Map<SoilMetricKey, any[]>,
    selectedMetric: SoilMetricKey
  ): ProfileRecentWindow | undefined {
    const points = [...seriesByMetric.entries()]
      .flatMap(([metric, series]) =>
        series.flatMap((item) =>
          (Array.isArray(item?.data) ? (item.data as HistoricalPoint[]) : []).map((point) => ({
            ...point,
            metric: point.metric || metric,
          }))
        )
      )
      .filter(
        (point) =>
          Number.isFinite(point?.x) &&
          Number.isFinite(point?.depth) &&
          !!point.metric &&
          this.expectedSentekDepthsCm.includes(point.depth)
      );
    if (!points.length) return undefined;

    const framesByKey = new Map<
      string,
      {
        channels: Set<number>;
        fCnt?: number;
        points: HistoricalPoint[];
        timestamp: number;
      }
    >();
    for (const point of points) {
      const key = point.frameKey || `point:${point.x}`;
      if (!framesByKey.has(key)) {
        framesByKey.set(key, {
          channels: new Set<number>(),
          fCnt: point.fCnt,
          points: [],
          timestamp: point.x,
        });
      }
      const frame = framesByKey.get(key)!;
      frame.timestamp = Math.min(frame.timestamp, point.x);
      frame.points.push(point);
      (point.profileChannels || []).forEach((channel) => frame.channels.add(channel));
    }
    const frames = [...framesByKey.values()].sort((a, b) => a.timestamp - b.timestamp);
    const groups: Array<{
      channels: Set<number>;
      end: number;
      fCnts: Set<number>;
      frameKeys: Set<string>;
      latestByIdentity: Map<string, HistoricalPoint>;
      start: number;
    }> = [];

    for (const frame of frames) {
      let group = groups[groups.length - 1];
      const identities = new Set(frame.points.map((point) => `${point.metric}:${point.depth}`));
      const sameCounter = frame.fCnt !== undefined && !!group?.fCnts.has(frame.fCnt);
      const repeatedChannel = [...frame.channels].some((channel) => group?.channels.has(channel));
      const repeatedIdentity = [...identities].some((identity) => group?.latestByIdentity.has(identity));
      const startsNewCycle =
        !!group &&
        !sameCounter &&
        (frame.timestamp - group.start > this.sentekSweepToleranceMs || repeatedChannel || repeatedIdentity);

      if (!group || startsNewCycle) {
        group = {
          channels: new Set<number>(),
          end: frame.timestamp,
          fCnts: new Set<number>(),
          frameKeys: new Set<string>(),
          latestByIdentity: new Map<string, HistoricalPoint>(),
          start: frame.timestamp,
        };
        groups.push(group);
      }
      group.end = Math.max(group.end, ...frame.points.map((point) => point.x));
      if (frame.fCnt !== undefined) group.fCnts.add(frame.fCnt);
      frame.points.forEach((point) => group.frameKeys.add(point.frameKey || `point:${point.x}`));
      frame.channels.forEach((channel) => group.channels.add(channel));
      frame.points.forEach((point) => group.latestByIdentity.set(`${point.metric}:${point.depth}`, point));
    }

    const isComplete = (group: { latestByIdentity: Map<string, HistoricalPoint> }): boolean =>
      this.definitions.every((definition) =>
        this.expectedSentekDepthsCm.every((depth) => group.latestByIdentity.has(`${definition.key}:${depth}`))
      );
    const latestGroup = groups[groups.length - 1];
    const relevantGroups = groups;
    const completeGroups = relevantGroups.filter(isComplete);
    const latestProfileGroup = completeGroups[completeGroups.length - 1] || latestGroup;
    const allowedFrameKeys = new Set<string>();
    const gapTimestampsByIdentity = new Map<string, number[]>();
    const addGap = (identity: string, timestamp: number): void => {
      if (!gapTimestampsByIdentity.has(identity)) gapTimestampsByIdentity.set(identity, []);
      gapTimestampsByIdentity.get(identity)!.push(timestamp);
    };

    for (const group of relevantGroups) {
      group.frameKeys.forEach((key) => allowedFrameKeys.add(key));
    }

    const observedByIdentity = new Map<string, HistoricalPoint[]>();
    points
      .filter((point) => allowedFrameKeys.has(point.frameKey || `point:${point.x}`))
      .forEach((point) => {
        const identity = `${point.metric}:${point.depth}`;
        if (!observedByIdentity.has(identity)) observedByIdentity.set(identity, []);
        observedByIdentity.get(identity)!.push(point);
      });
    observedByIdentity.forEach((observed, identity) => {
      const ordered = observed.sort((left, right) => left.x - right.x);
      for (let index = 1; index < ordered.length; index++) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (current.x - previous.x > this.sentekContinuousProfileGapMs) {
          addGap(identity, previous.x + Math.floor((current.x - previous.x) / 2));
        }
      }
    });

    const latestPoints = this.expectedSentekDepthsCm
      .map((depth) => latestProfileGroup.latestByIdentity.get(`${selectedMetric}:${depth}`))
      .filter((point): point is HistoricalPoint => !!point);
    const period = this.getRequestedPeriodBounds();
    const dataStart = period.start;
    const dataEnd = period.end;
    const selectedMetricPoints = points.filter(
      (point) =>
        point.metric === selectedMetric &&
        Number.isFinite(point.y) &&
        point.x >= dataStart &&
        point.x <= dataEnd
    );
    if (!selectedMetricPoints.length) return undefined;
    const latestMetricTimestamp = Math.max(...selectedMetricPoints.map((point) => point.x));
    const latestTimestampByDepth = new Map<number, number>();
    selectedMetricPoints.forEach((point) => {
      latestTimestampByDepth.set(point.depth, Math.max(latestTimestampByDepth.get(point.depth) || 0, point.x));
    });
    const missingDepths = this.expectedSentekDepthsCm.filter((depth) => {
      const latestDepthTimestamp = latestTimestampByDepth.get(depth);
      return (
        latestDepthTimestamp === undefined ||
        latestMetricTimestamp - latestDepthTimestamp > this.sentekFreshnessToleranceMs
      );
    });
    const observedStart = Math.min(...selectedMetricPoints.map((point) => point.x));
    const observedEnd = latestMetricTimestamp;
    const observedSpan = Math.max(0, observedEnd - observedStart);
    const padding =
      observedSpan > 0
        ? Math.max(
            1,
            Math.min(this.sentekVisibleMaxPaddingMs, Math.floor(observedSpan * this.sentekVisiblePaddingRatio))
          )
        : Math.min(this.sentekVisibleMaxPaddingMs, Math.max(30_000, Math.floor((dataEnd - dataStart) * 0.005)));
    const visibleStart = Math.max(dataStart, observedStart - padding);
    return {
      allowedFrameKeys,
      dataEnd,
      dataStart,
      gapTimestampsByIdentity: new Map(
        [...gapTimestampsByIdentity.entries()].map(([identity, timestamps]) => [
          identity,
          [...new Set(timestamps)].sort((a, b) => a - b),
        ])
      ),
      latestPoints,
      missingDepths,
      visibleEnd: dataEnd,
      visibleStart,
    };
  }

  private cropSeriesToProfileWindow(series: any[], recentWindow?: ProfileRecentWindow): any[] {
    if (!recentWindow) return series;

    return series.map((item) => {
      const values = ((item.data || []) as HistoricalPoint[]).filter((point) => {
        const frameKey = point.frameKey || `point:${point.x}`;
        return (
          point.x >= recentWindow.dataStart &&
          point.x <= recentWindow.dataEnd &&
          recentWindow.allowedFrameKeys.has(frameKey)
        );
      });
      const depth = item.custom?.depthCm;
      const identity = `${item.custom?.metric}:${depth}`;
      const gaps: HistoricalPoint[] = (recentWindow.gapTimestampsByIdentity.get(identity) || []).map((x) => ({
        x,
        y: null,
        depth,
        custom: { isGap: true },
        marker: { enabled: false },
      }));
      const data = [...values, ...gaps].sort((a, b) => a.x - b.x);
      return {
        ...item,
        data,
        marker: this.buildSentekMarkerOptions(values.length),
      };
    });
  }

  private buildSentekMarkerOptions(realPointCount: number): any {
    return {
      enabled: realPointCount <= this.sentekMarkerLimit,
      lineWidth: 0.8,
      radius: 1.8,
      states: {
        hover: {
          enabled: true,
          radius: 3.2,
        },
      },
    };
  }

  private buildMetricDomain(
    definition: SoilMetricDefinition,
    series: Array<{ data?: HistoricalPoint[] }>
  ): { max: number; min: number } {
    const values = series
      .flatMap((item) => item.data || [])
      .map((point) => point.y)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (!values.length) {
      return definition.key === 'humedad' ? { max: 100, min: 0 } : { max: 1, min: 0 };
    }

    const observedMin = Math.min(...values);
    const observedMax = Math.max(...values);
    const observedSpan = observedMax - observedMin;
    const padding = observedSpan > 0 ? observedSpan * 0.12 : Math.max(Math.abs(observedMax) * 0.04, 1);
    let min = observedMin - padding;
    let max = observedMax + padding;
    if (definition.key === 'humedad') {
      min = Math.max(0, min);
      max = Math.min(100, max);
    }
    if (max <= min) max = min + 1;

    return { max, min };
  }

  private buildHumidityDomain(series: Array<{ data?: HistoricalPoint[] }>): { max: number; min: number } {
    const observedMax = Math.max(
      0,
      ...series
        .flatMap((item) => item.data || [])
        .map((point) => point.y)
        .filter((value): value is number => value !== null && Number.isFinite(value))
    );
    const referenceMax = this.validAgronomicReference()?.capacidadCampoPct || 0;
    const max = Math.min(100, Math.max(60, Math.ceil(Math.max(observedMax, referenceMax) / 10) * 10));
    return { max, min: 0 };
  }

  private validAgronomicReference(): SentekAgronomicReference | undefined {
    const source = this.agronomicThresholds;
    const capacidadCampoPct = Number(source?.capacidadCampoPct);
    const puntoMarchitezPct = Number(source?.puntoMarchitezPct);
    if (
      !source ||
      source.stale === true ||
      source.confianza === 'unavailable' ||
      !Number.isFinite(capacidadCampoPct) ||
      !Number.isFinite(puntoMarchitezPct) ||
      puntoMarchitezPct < 0 ||
      capacidadCampoPct > 100 ||
      puntoMarchitezPct >= capacidadCampoPct
    ) {
      return undefined;
    }

    const fallbackRecarga = puntoMarchitezPct + (capacidadCampoPct - puntoMarchitezPct) * 0.5;
    const requestedRecarga = Number(source.recargaPct);
    const recargaPct =
      Number.isFinite(requestedRecarga) && requestedRecarga > puntoMarchitezPct && requestedRecarga < capacidadCampoPct
        ? requestedRecarga
        : fallbackRecarga;
    return {
      capacidadCampoPct,
      confianza: source.confianza,
      depthFromCm: source.depthFromCm,
      depthToCm: source.depthToCm,
      fuente: source.fuente,
      origen: source.origen,
      puntoMarchitezPct,
      recargaPct,
    };
  }

  private buildAgronomicPlotBands(axisMax: number): any[] {
    const reference = this.agronomicReference;
    if (!reference) return [];
    return [
      {
        className: 'sentek-zone-deficit',
        color: 'rgba(239, 68, 68, 0.16)',
        from: 0,
        id: 'sentek-zone-deficit',
        to: Math.min(reference.recargaPct, axisMax),
        zIndex: 0,
      },
      {
        className: 'sentek-zone-target',
        color: 'rgba(250, 204, 21, 0.18)',
        from: Math.min(reference.recargaPct, axisMax),
        id: 'sentek-zone-target',
        to: Math.min(reference.capacidadCampoPct, axisMax),
        zIndex: 0,
      },
      {
        className: 'sentek-zone-excess',
        color: 'rgba(56, 169, 232, 0.15)',
        from: Math.min(reference.capacidadCampoPct, axisMax),
        id: 'sentek-zone-excess',
        to: axisMax,
        zIndex: 0,
      },
    ].filter((band) => band.to > band.from);
  }

  private buildAgronomicPlotLines(): any[] {
    const reference = this.agronomicReference;
    if (!reference) return [];
    return [
      {
        className: 'sentek-threshold-wilting',
        color: 'rgba(153, 27, 27, 0.62)',
        dashStyle: 'ShortDash',
        id: 'sentek-threshold-wilting',
        value: reference.puntoMarchitezPct,
        width: 1,
        zIndex: 2,
      },
      {
        className: 'sentek-threshold-refill',
        color: 'rgba(161, 98, 7, 0.68)',
        dashStyle: 'ShortDash',
        id: 'sentek-threshold-refill',
        value: reference.recargaPct,
        width: 1,
        zIndex: 2,
      },
      {
        className: 'sentek-threshold-field-capacity',
        color: 'rgba(3, 105, 161, 0.7)',
        id: 'sentek-threshold-field-capacity',
        value: reference.capacidadCampoPct,
        width: 1,
        zIndex: 2,
      },
    ];
  }

  private buildProfileFreshnessNotice(missingDepths: number[]): string {
    if (!missingDepths.length) return '';
    if (missingDepths.length > 4) {
      return `${missingDepths.length} niveles sin lectura dentro de las 2 h previas al dato más reciente.`;
    }
    const labels = missingDepths.map(String);
    const depths = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}` : labels[0];
    return `Sin lectura dentro de las 2 h previas al dato más reciente: ${depths} cm.`;
  }

  private buildProfileRows(definition: SoilMetricDefinition, latestPoints: HistoricalPoint[]): ProfileRow[] {
    return latestPoints.map((point) => ({
      profundidad: point.depth,
      formatted: `${Number(point.y).toFixed(definition.displayDecimals)} ${definition.unit}`,
      raw: point.raw !== undefined && point.rawUnit ? `${Number(point.raw).toFixed(3)} ${point.rawUnit}` : undefined,
    }));
  }

  private buildNapaChartOptions(): any | undefined {
    const points = this.buildNapaPoints();

    if (!points.length) {
      this.napaResumen = '';
      this.napaActual = undefined;
      this.napaActualFecha = undefined;
      return undefined;
    }

    const unit = points.find((point) => !!point.unit)?.unit || 'm';
    const latest = points[points.length - 1];
    this.napaActual = Number(latest.y);
    this.napaActualFecha = latest.x;
    this.napaEscalaMaxima = Math.max(5, Math.ceil(Math.max(...points.map((point) => point.y), 0) + 1));
    // Reserva la franja superior para representar el terreno y escala la
    // distancia vertical hasta el agua dentro del perfil visible.
    this.napaPosicionVisual = Math.min(88, Math.max(30, (this.napaActual / this.napaEscalaMaxima) * 58 + 30));
    this.napaLineaVisual = Math.max(4, this.napaPosicionVisual - 23);
    this.napaResumen = `${points.length} lecturas crudas - actual ${this.napaActual.toFixed(2)} ${unit} bajo el terreno`;

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 360,
        spacingBottom: 18,
        spacingLeft: 8,
        spacingRight: 18,
        spacingTop: 10,
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        crosshair: {
          color: 'rgba(34, 211, 200, 0.24)',
          width: 2,
        },
        type: 'datetime',
        title: {
          text: 'Fecha y hora',
          style: { color: 'var(--p-text-color)', fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '14px' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis: {
        max: this.napaEscalaMaxima,
        min: 0,
        reversed: true,
        title: {
          text: `Profundidad de napa desde el terreno (${unit})`,
          style: { color: '#0f766e', fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '14px' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
        plotLines: [
          {
            color: '#6b4f35',
            dashStyle: 'Solid',
            label: {
              align: 'left',
              style: { color: '#6b4f35', fontSize: '12px', fontWeight: '800' },
              text: 'Nivel del terreno · 0 m',
              x: 8,
              y: -6,
            },
            value: 0,
            width: 2,
            zIndex: 5,
          },
        ],
      },
      legend: {
        enabled: true,
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '700',
        },
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        formatter: function (this: any) {
          const point = this.point as NapaPoint;
          const date = new Date(point.x).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          return `${date}<br/><strong>${Number(point.y).toFixed(2)} ${point.unit || unit}</strong>`;
        },
        shadow: true,
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
      },
      plotOptions: {
        spline: {
          animation: { duration: 500 },
          dataLabels: { enabled: false },
          enableMouseTracking: true,
          lineWidth: 3,
          marker: {
            enabled: points.length <= 80,
            radius: 3.5,
          },
          states: {
            hover: {
              lineWidth: 2.6,
            },
          },
        },
        series: {
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      series: [
        {
          color: '#1297c4',
          data: points,
          name: 'Profundidad de napa',
          type: 'spline',
        },
      ],
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private buildNapaPoints(): NapaPoint[] {
    const points: NapaPoint[] = [];

    for (const frame of this.filteredRawFrames()) {
      for (const reading of frame.readings.filter(
        (item) => item.variable === 'nivel_napa' && (!item.serviceId || item.serviceId === 'nivel-napa')
      )) {
        points.push({
          x: new Date(frame.timestamp).getTime(),
          y: this.normalizarNapa(reading.value, reading.unit),
          unit: 'm',
        });
      }
    }

    for (const reporte of this.rawFrames.length ? [] : this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;

      const rawNapa = (reporte?.datos as any)?.valores?.Napa;
      const napaRows = Array.isArray(rawNapa) ? rawNapa : rawNapa ? [rawNapa] : [];

      for (const row of napaRows) {
        const valores = row?.valores || row;
        const rawValue = this.toNumber(
          valores?.actual ?? valores?.altura ?? valores?.nivel ?? valores?.value ?? valores?.valor
        );
        if (rawValue === undefined) continue;
        const normalized = this.normalizarNapa(rawValue, valores?.unidad || row?.unidad);

        points.push({
          x: timestamp,
          y: normalized,
          unit: 'm',
        });
      }
    }

    return points.sort((a, b) => a.x - b.x);
  }

  private buildAnalogChartOptions(): any | undefined {
    const points = this.buildAnalogPoints();
    if (!points.length) {
      this.analogResumen = '';
      this.analogActual = undefined;
      this.analogActualFecha = undefined;
      return undefined;
    }

    const latest = points[points.length - 1];
    this.analogActual = latest.y;
    this.analogActualFecha = latest.x;
    this.analogResumen = `${points.length} lecturas crudas - actual ${latest.y.toFixed(3)} mA`;

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 320,
        spacingBottom: 18,
        spacingLeft: 8,
        spacingRight: 18,
        spacingTop: 10,
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        crosshair: { color: 'rgba(34, 211, 200, 0.24)', width: 2 },
        title: {
          text: 'Fecha y hora',
          style: { color: 'var(--p-text-color)', fontSize: '14px', fontWeight: '700' },
        },
        labels: { style: { color: 'var(--p-text-color)', fontSize: '13px' } },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis: {
        softMin: 4,
        softMax: 20,
        title: {
          text: 'Corriente del transductor (mA)',
          style: { color: '#7c3aed', fontSize: '14px', fontWeight: '700' },
        },
        labels: { style: { color: 'var(--p-text-color)', fontSize: '13px' } },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
        plotLines: [
          { color: '#94a3b8', dashStyle: 'ShortDash', value: 4, width: 1 },
          { color: '#94a3b8', dashStyle: 'ShortDash', value: 20, width: 1 },
        ],
      },
      legend: { enabled: false },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        xDateFormat: '%d/%m/%Y %H:%M',
        valueDecimals: 3,
        valueSuffix: ' mA',
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
      },
      plotOptions: {
        spline: {
          lineWidth: 3,
          marker: { enabled: points.length <= 80, radius: 3.5 },
        },
        series: { connectNulls: false, turboThreshold: 0 },
      },
      series: [{ color: '#7c3aed', data: points, name: 'Señal 4-20 mA', type: 'spline' }],
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private buildAnalogPoints(): AnalogPoint[] {
    const points: AnalogPoint[] = [];

    for (const frame of this.filteredRawFrames()) {
      for (const reading of frame.readings || []) {
        if (reading.variable !== 'corriente_analogica' || reading.quality === 'invalid') continue;
        if (!Number.isFinite(reading.value)) continue;
        points.push({ x: new Date(frame.timestamp).getTime(), y: reading.value });
      }
    }

    for (const reporte of this.rawFrames.length ? [] : this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;
      const raw = (reporte?.datos as any)?.valores?.['Entrada Analógica'];
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const row of rows) {
        const valores = row?.valores || row;
        const value = this.toNumber(valores?.actual ?? valores?.value ?? valores?.valor);
        if (value !== undefined) points.push({ x: timestamp, y: value });
      }
    }

    return points.sort((a, b) => a.x - b.x);
  }

  /**
   * La franja solar usa solamente amanecer/atardecer observados o calculados
   * para las coordenadas del lote. Cada fecha se recorta a su propio dia civil;
   * una fecha sin contexto solar queda neutra y nunca se pinta como noche.
   */
  private buildSolarContextSeries(
    visibleStart: number | undefined,
    visibleEnd: number | undefined,
    solarAxisId: string
  ): { dayIntervals: SolarInterval[]; nightIntervals: SolarInterval[]; series: any[] } {
    if (!Number.isFinite(visibleStart) || !Number.isFinite(visibleEnd) || visibleStart! >= visibleEnd!) {
      return { dayIntervals: [], nightIntervals: [], series: [] };
    }

    const byDate = new Map<string, SentekDaylightPoint>();
    this.daylight.forEach((item) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(item.fecha)) byDate.set(item.fecha, item);
    });

    const dayIntervals: SolarInterval[] = [];
    const nightIntervals: SolarInterval[] = [];
    const addInterval = (target: SolarInterval[], from: number, to: number): void => {
      const clippedFrom = Math.max(from, visibleStart!);
      const clippedTo = Math.min(to, visibleEnd!);
      if (clippedTo > clippedFrom) target.push({ from: clippedFrom, to: clippedTo });
    };
    for (const [date, item] of [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const sunrise = this.solarTimestamp(date, item.amanecer);
      const sunset = this.solarTimestamp(date, item.atardecer);
      const dayStart = this.zonedDateTimeTimestamp(date, '00:00');
      const dayEnd = this.zonedDateTimeTimestamp(this.shiftDateKey(date, 1), '00:00');
      if (
        sunrise === undefined ||
        sunset === undefined ||
        dayStart === undefined ||
        dayEnd === undefined ||
        sunset <= sunrise ||
        sunrise < dayStart ||
        sunset > dayEnd
      ) {
        continue;
      }

      addInterval(nightIntervals, dayStart, sunrise);
      addInterval(dayIntervals, sunrise, sunset);
      addInterval(nightIntervals, sunset, dayEnd);
    }

    const mergeAdjacentIntervals = (intervals: SolarInterval[]): SolarInterval[] =>
      [...intervals]
        .sort((left, right) => left.from - right.from)
        .reduce<SolarInterval[]>((merged, interval) => {
          const previous = merged[merged.length - 1];
          if (previous && interval.from <= previous.to + 1) {
            previous.to = Math.max(previous.to, interval.to);
          } else {
            merged.push({ ...interval });
          }
          return merged;
        }, []);
    const mergedDayIntervals = mergeAdjacentIntervals(dayIntervals);
    const mergedNightIntervals = mergeAdjacentIntervals(nightIntervals);
    const buildStripSeries = (id: string, name: string, color: string, intervals: SolarInterval[]): any | undefined => {
      if (!intervals.length) return undefined;
      return {
        color,
        connectNulls: false,
        custom: { isTemporalContext: true, solarState: id },
        data: intervals.flatMap((interval, index) => {
          const points: Array<{ x: number; y: number | null }> = [
            { x: interval.from, y: 0 },
            { x: interval.to, y: 0 },
          ];
          const next = intervals[index + 1];
          if (next && next.from > interval.to + 1) points.push({ x: interval.to + 1, y: null });
          return points;
        }),
        enableMouseTracking: false,
        id: `sentek-solar-${id}`,
        lineWidth: 8,
        marker: { enabled: false },
        name,
        showInLegend: false,
        type: 'line',
        yAxis: solarAxisId,
        zIndex: 5,
      };
    };
    const series = [
      buildStripSeries('night', 'Noche', '#111827', mergedNightIntervals),
      buildStripSeries('day', 'Día', '#facc15', mergedDayIntervals),
    ].filter((item): item is any => !!item);
    return { dayIntervals: mergedDayIntervals, nightIntervals: mergedNightIntervals, series };
  }

  private shiftDateKey(date: string, days: number): string {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  private get resolvedTimeZone(): string {
    const candidate = String(this.timeZone || '').trim() || this.fallbackTimeZone;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
      return candidate;
    } catch {
      return this.fallbackTimeZone;
    }
  }

  private solarTimestamp(date: string, value: string): number | undefined {
    const normalized = String(value || '').trim();
    if (/^\d{1,2}:\d{2}$/.test(normalized)) return this.zonedDateTimeTimestamp(date, normalized);

    const localDateTime = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(normalized);
    if (localDateTime) return this.zonedDateTimeTimestamp(localDateTime[1], localDateTime[2]);

    const timestamp = new Date(normalized).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  private zonedDateTimeTimestamp(date: string, time: string): number | undefined {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
    if (!dateMatch || !timeMatch) return undefined;
    const [, yearText, monthText, dayText] = dateMatch;
    const [, hourText, minuteText] = timeMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (hour > 23 || minute > 59) return undefined;

    const expectedWallClock = Date.UTC(year, month - 1, day, hour, minute);
    let timestamp = expectedWallClock;
    const formatter = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone: this.resolvedTimeZone,
      year: 'numeric',
    });

    for (let iteration = 0; iteration < 3; iteration++) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(timestamp))
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, Number(part.value)])
      ) as Record<string, number>;
      const renderedWallClock = Date.UTC(
        parts['year'],
        parts['month'] - 1,
        parts['day'],
        parts['hour'],
        parts['minute']
      );
      const correction = expectedWallClock - renderedWallClock;
      timestamp += correction;
      if (correction === 0) break;
    }
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  private buildRainPoints(): RainPoint[] {
    const desde = this.getFechaDesdeMs();
    const lluviaExterna = this.lluvias
      .map((item) => this.externalRainPoint(item))
      .filter(
        (point) =>
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          (!desde || (point.dayEnd !== undefined ? point.dayEnd > desde : point.x >= desde))
      );

    if (lluviaExterna.length) {
      const porDia = new Map<number, RainPoint>();
      lluviaExterna.forEach((point) => porDia.set(point.dayStart ?? point.x, point));
      return [...porDia.values()].sort((a, b) => a.x - b.x);
    }

    const points: RainPoint[] = [];

    for (const reporte of this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;

      const value = this.extractRainValue(reporte);
      if (value === undefined) continue;

      points.push({
        x: timestamp,
        y: Math.max(0, value),
      });
    }

    return points.sort((a, b) => a.x - b.x);
  }

  private rainTimestamp(fecha: string): number {
    const value = String(fecha || '').trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
    return new Date(normalized).getTime();
  }

  private externalRainPoint(item: SentekRainfallPoint): RainPoint {
    const fecha = String(item.fecha || '').trim();
    const y = Math.max(0, Number(item.milimetros));
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const dayStart = this.zonedDateTimeTimestamp(fecha, '00:00')!;
      const dayEnd = this.zonedDateTimeTimestamp(this.shiftDateKey(fecha, 1), '00:00')!;
      return {
        custom: {
          originalDate: fecha,
          originalDateOnly: true,
        },
        dayEnd,
        dayStart,
        x: dayStart + Math.floor((dayEnd - dayStart) / 2),
        y,
      };
    }
    return {
      custom: {
        originalDate: fecha,
        originalDateOnly: false,
      },
      x: this.rainTimestamp(fecha),
      y,
    };
  }

  private buildResumen(definition: SoilMetricDefinition, series: any[], latestPoints: HistoricalPoint[]): string {
    const pointCount = series.reduce(
      (sum, item) => sum + (item.data || []).filter((point: HistoricalPoint) => point.y !== null).length,
      0
    );
    if (!pointCount) return 'Sin lecturas historicas para esta variable';
    const latest = latestPoints.length ? ` - ultimo perfil ${latestPoints.length}/12 niveles` : '';
    const source = this.rawFrames.length ? 'lecturas crudas' : 'valores de reportes agregados';
    const period = this.periodDays === 1 ? '24 h' : `${this.periodDays} dias`;
    return `${series.length}/12 profundidades detectadas - ${pointCount} ${source} en ${period}${latest}`;
  }

  private buildProfileCoverageNotice(latestPoints: HistoricalPoint[]): string {
    const count = new Set(latestPoints.map((point) => point.depth)).size;
    if (!count) return '';
    if (count >= 12) {
      const depths = latestPoints.map((point) => point.depth).sort((a, b) => a - b);
      return `Perfil completo: 12/12 niveles recibidos entre ${depths[0]} y ${depths[depths.length - 1]} cm.`;
    }
    return `Cobertura recibida: ${count}/12 niveles. Chaman no completa ni promedia los ${12 - count} niveles faltantes.`;
  }

  private hasMetric(key: SoilMetricKey): boolean {
    if (this.rawFrames.length) {
      return this.filteredRawFrames().some((frame) => this.rawReadingsForMetric(frame, key).length > 0);
    }
    return this.filteredReports().some((reporte) => buildSentekProfile(reporte).some((row) => !!row[key]));
  }

  private rawReadingsForMetric(frame: ILorawanRawFrame, key: SoilMetricKey): ILorawanRawReading[] {
    const variable = {
      humedad: 'humedad_suelo',
      salinidad: 'salinidad_suelo',
      temperatura: 'temperatura_suelo',
    }[key];
    return (frame.readings || []).filter(
      (reading) =>
        reading.variable === variable &&
        reading.quality !== 'invalid' &&
        (!reading.serviceId || reading.serviceId === 'perfil-suelo-sentek')
    );
  }

  private filteredRawFrames(): ILorawanRawFrame[] {
    const period = this.getRequestedPeriodBounds();
    return [...(this.rawFrames || [])]
      .filter((frame) => {
        const timestamp = new Date(frame.timestamp).getTime();
        return Number.isFinite(timestamp) && timestamp >= period.start && timestamp <= period.end;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  private getDefinition(key: SoilMetricKey): SoilMetricDefinition {
    return this.definitions.find((definition) => definition.key === key) || this.definitions[0];
  }

  private sortedReports(): IReporte[] {
    return [...(this.reportes || [])].sort((a, b) => this.getReporteTimestamp(a) - this.getReporteTimestamp(b));
  }

  private filteredReports(): IReporte[] {
    const period = this.getRequestedPeriodBounds();
    return this.sortedReports().filter((reporte) => {
      const timestamp = this.getReporteTimestamp(reporte);
      return !!timestamp && timestamp >= period.start && timestamp <= period.end;
    });
  }

  private getRequestedPeriodBounds(): { start: number; end: number } {
    const configuredEnd =
      typeof this.periodEnd === 'number' ? this.periodEnd : this.periodEnd ? new Date(this.periodEnd).getTime() : NaN;
    const end = Number.isFinite(configuredEnd) ? configuredEnd : Date.now();
    const days = Math.max(1, Math.min(Number(this.periodDays) || 30, 365));
    return {
      start: Math.max(this.getFechaDesdeMs(), end - days * 86_400_000),
      end,
    };
  }

  private getFechaDesdeMs(): number {
    if (!this.fechaDesde) return 0;
    const timestamp = new Date(this.fechaDesde).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private buildAssignmentNotice(): string {
    const timestamp = this.getFechaDesdeMs();
    if (!timestamp) return '';

    const fecha = new Date(timestamp).toLocaleString('es-AR', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
    return `Tramo operativo actual desde ${fecha}. El historico tecnico completo queda conservado por DevEUI.`;
  }

  private getReporteTimestamp(reporte: IReporte): number {
    return new Date(reporte.fecha || reporte.fechaCreacion || '').getTime() || 0;
  }

  private getCsvRows(): unknown[][] {
    const rows: unknown[][] = [];

    if (this.rawFrames.length) {
      for (const frame of this.filteredRawFrames()) {
        for (const reading of frame.readings || []) {
          rows.push([
            frame.timestamp,
            frame.devEUI,
            frame.id || '',
            frame.fCnt ?? '',
            (frame.profileChannels || []).join(','),
            reading.depthCm === undefined ? '' : reading.depthCm,
            reading.variable === 'humedad_suelo' ? reading.value : '',
            reading.variable === 'salinidad_suelo' ? reading.value : '',
            reading.variable === 'temperatura_suelo' ? reading.value : '',
            reading.rawValue ?? reading.value,
            reading.rawUnit ?? reading.unit,
            reading.quality || 'legacy-sin-validacion',
            reading.qualityReason || '',
          ]);
        }
      }
      return rows;
    }

    for (const reporte of this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;
      const fecha = new Date(timestamp).toISOString();
      for (const row of buildSentekProfile(reporte)) {
        rows.push([
          fecha,
          '',
          '',
          '',
          '',
          row.profundidad,
          row.humedad?.actual ?? '',
          row.salinidad?.actual ?? '',
          row.temperatura?.actual ?? '',
          row.humedad?.crudo ?? '',
          row.humedad?.unidadCruda ?? '',
          'legacy-validado-al-leer',
          '',
        ]);
      }
    }

    return rows;
  }

  private extractRainValue(reporte: IReporte): number | undefined {
    const valores = (reporte?.datos as any)?.valores || {};
    const keys = ['Pluviometro', 'Lluvia', 'Precipitacion', 'Rain', 'Rainfall'];

    for (const key of keys) {
      const value = this.extractRainValueFromRows(valores[key]);
      if (value !== undefined) {
        return value;
      }
    }

    for (const [key, raw] of Object.entries(valores)) {
      const normalizedKey = this.normalizeKey(key);
      if (
        normalizedKey.includes('pluvio') ||
        normalizedKey.includes('lluvia') ||
        normalizedKey.includes('precipitacion') ||
        normalizedKey.includes('rain')
      ) {
        const value = this.extractRainValueFromRows(raw);
        if (value !== undefined) {
          return value;
        }
      }
    }

    return undefined;
  }

  private extractRainValueFromRows(raw: unknown): number | undefined {
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];

    for (const row of rows) {
      const rowValues = (row as any)?.valores || row;
      const value = this.toNumber(
        (rowValues as any)?.suma ??
          (rowValues as any)?.acumulado ??
          (rowValues as any)?.actual ??
          (rowValues as any)?.promedio ??
          (rowValues as any)?.value ??
          (rowValues as any)?.valor
      );
      if (value !== undefined) {
        return value;
      }
    }

    return undefined;
  }

  private normalizeKey(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private toNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private normalizarNapa(value: number, unit?: string): number {
    const normalizedUnit = String(unit || '').toLowerCase();
    if (normalizedUnit.includes('cm')) {
      return this.round(value / 100, 2);
    }
    return this.round(value, 2);
  }

  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  }
}
