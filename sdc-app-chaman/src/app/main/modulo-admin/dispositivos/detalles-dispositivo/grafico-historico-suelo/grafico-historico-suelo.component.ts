import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
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
  x: number;
  y: number;
}

export interface SentekRainfallPoint {
  fecha: string;
  milimetros: number;
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
  gapTimestamps: number[];
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
  @Input() reportes: IReporte[] = [];
  @Input() rawFrames: ILorawanRawFrame[] = [];
  @Input() lluvias: SentekRainfallPoint[] = [];
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
    { key: 'humedad', title: 'Humedad de suelo', unit: '%', color: '#2f9fe8', decimals: 1 },
    { key: 'salinidad', title: 'Salinidad relativa', unit: 'VIC', color: '#8e44ad', decimals: 1 },
    { key: 'temperatura', title: 'Temperatura', unit: 'C', color: '#e74c3c', decimals: 1 },
  ];

  private readonly depthColors = [
    '#22d3c8',
    '#2f9fe8',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#10b981',
    '#64748b',
    '#ec4899',
    '#14b8a6',
    '#84cc16',
    '#f97316',
    '#06b6d4',
  ];

  private readonly expectedSentekDepthsCm = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
  private readonly sentekSweepToleranceMs = 6 * 60 * 1000;
  private readonly sentekContinuousProfileGapMs = 60 * 60 * 1000;
  private readonly sentekChartLeadMs = 60 * 1000;

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['reportes'] ||
      changes['rawFrames'] ||
      changes['lluvias'] ||
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

  public exportarCsv(): void {
    const rows = this.getCsvRows();
    if (!rows.length) return;

    const headers = [
      'Fecha',
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
    const series = this.cropSeriesToProfileWindow(historicalSeries, recentWindow);
    const latestPoints = recentWindow?.latestPoints || [];
    this.profileRows = this.buildProfileRows(definition, latestPoints);
    this.resumen = this.buildResumen(definition, series, latestPoints);
    this.profileCoverageNotice = this.buildProfileCoverageNotice(latestPoints);
    this.chartOptions = this.buildStackedTimeSeriesChartOptions(definition, series, recentWindow);
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
      .map(([depth, data], index) => ({
        color: this.depthColors[index % this.depthColors.length],
        data: data.sort((a, b) => a.x - b.x),
        lineWidth: 2,
        marker: { enabled: data.length <= 36, radius: 2 },
        name: `${depth} cm`,
        type: 'spline',
        turboThreshold: 0,
        custom: { decimals: definition.decimals, depthCm: depth, unit: definition.unit },
      }));
  }

  private buildStackedTimeSeriesChartOptions(
    definition: SoilMetricDefinition,
    series: any[],
    recentWindow?: ProfileRecentWindow
  ): any {
    const rainHalfDayMs = 12 * 60 * 60 * 1000;
    const rainPoints =
      definition.key === 'humedad'
        ? this.buildRainPoints().filter(
            (point) =>
              !recentWindow ||
              (point.x + rainHalfDayMs >= recentWindow.visibleStart &&
                point.x - rainHalfDayMs <= recentWindow.visibleEnd)
          )
        : [];
    const hasRain = rainPoints.some((point) => point.y > 0);
    this.profileRecentMissingDepths = recentWindow?.missingDepths || [];
    this.profileFreshnessNotice = this.buildProfileFreshnessNotice(this.profileRecentMissingDepths);
    const visibleProfileStart = recentWindow?.visibleStart;
    const visibleProfileEnd = recentWindow?.visibleEnd;
    const depthCount = Math.max(series.length, 1);
    const chartHeight = Math.min(900, Math.max(500, depthCount * 70 + 110));
    const soilAvailable = 88;
    const soilGap = 1.1;
    const soilHeight = Math.max(5.5, (soilAvailable - soilGap * Math.max(depthCount - 1, 0)) / depthCount);
    const rainMax = Math.max(1, ...rainPoints.map((point) => point.y));
    const soilAxes: any[] = [];
    const soilAxisIds = series.map((item, index) => `sentek-${definition.key}-depth-${item.custom?.depthCm ?? index}`);
    const rainAxisId = 'sentek-rain-shared';

    series.forEach((item, index) => {
      const top = index * (soilHeight + soilGap);
      soilAxes.push({
        id: soilAxisIds[index],
        max: definition.key === 'humedad' ? 100 : null,
        min: definition.key === 'humedad' ? 0 : null,
        title: {
          text: item.name,
          align: 'middle',
          margin: 6,
          rotation: 0,
          style: { color: item.color || definition.color, fontSize: '13px', fontWeight: '900' },
        },
        labels: { enabled: false },
        endOnTick: true,
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
        height: `${soilHeight}%`,
        top: `${top}%`,
        offset: 0,
      });

    });

    const rainAxis = hasRain
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
            format: '{value:.0f}',
            style: { color: '#2f9fe8', fontSize: '10px', fontWeight: '700' },
          },
          lineWidth: 0,
          tickWidth: 0,
          tickAmount: 3,
          gridLineWidth: 0,
          height: `${soilAvailable}%`,
          top: '0%',
          offset: 0,
          opposite: true,
        }
      : undefined;
    const rainSeries = hasRain
      ? [
          {
            color: 'rgba(47, 159, 232, 0.12)',
            custom: { decimals: 1, isRain: true, unit: 'mm' },
            data: rainPoints,
            id: 'sentek-rain-shared',
            name: 'Lluvia (mm)',
            pointRange: 24 * 60 * 60 * 1000,
            showInLegend: true,
            type: 'column',
            yAxis: rainAxisId,
            zIndex: 0,
          },
        ]
      : [];
    const soilSeries = series.map((item, index) => ({
      ...item,
      id: `sentek-${definition.key}-${item.custom?.depthCm ?? index}`,
      showInLegend: false,
      yAxis: soilAxisIds[index],
      zIndex: 2,
    }));
    const plottedSeries = [...rainSeries, ...soilSeries];

    return {
      chart: {
        animation: false,
        backgroundColor: 'transparent',
        height: chartHeight,
        spacingBottom: 22,
        spacingLeft: 2,
        spacingRight: 20,
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
      yAxis: [...soilAxes, ...(rainAxis ? [rainAxis] : [])],
      legend: {
        align: 'right',
        enabled: hasRain,
        itemDistance: 16,
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '700',
        },
        layout: 'horizontal',
        verticalAlign: 'top',
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        shared: false,
        shadow: true,
        xDateFormat: '%d/%m/%Y %H:%M',
        valueDecimals: definition.decimals,
        valueSuffix: ` ${definition.unit}`,
        pointFormatter: function (this: any) {
          const point = this as HistoricalPoint & { color?: string; series?: any };
          if (point.custom?.isGap) return '';
          const custom = point.series?.userOptions?.custom || {};
          const decimals = custom.decimals ?? definition.decimals;
          const unit = custom.unit || definition.unit;
          if (custom.isRain) {
            return `<br/><span style="color:#2f9fe8">&#9646;</span> Lluvia: <strong>${Number(point.y).toFixed(1)} mm</strong>`;
          }
          const raw =
            point.raw !== undefined && point.rawUnit
              ? ` <span style="color:#60708a">(crudo ${Number(point.raw).toFixed(3)} ${point.rawUnit})</span>`
              : '';
          return `<br/><span style="color:${point.color}">&bull;</span> ${point.series?.name || ''}: <strong>${Number(point.y).toFixed(decimals)} ${unit}</strong>${raw}`;
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
          lineWidth: 2.4,
          marker: {
            lineWidth: 1,
            states: {
              hover: {
                radius: 3.5,
              },
            },
          },
          states: {
            hover: {
              lineWidth: 2.4,
            },
          },
        },
        series: {
          animation: false,
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      series: plottedSeries,
      credits: { enabled: false },
      accessibility: { enabled: false },
      lang: { noData: 'Sin lecturas historicas para esta variable.' },
      noData: { style: { color: '#60708a', fontWeight: '700' } },
      time: { useUTC: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: Math.min(chartHeight, 560) },
              legend: { itemStyle: { fontSize: '12px' } },
            },
          },
        ],
      },
    };
  }

  /**
   * Un barrido Sentek llega repartido en varias tramas. Cada grupo dura como
   * maximo la misma tolerancia del agregador; no se encadena por proximidad.
   * La unica vista parte del primer barrido fisico 36/36 (12 H + 12 S + 12 T)
   * disponible desde fechaDesde. Solo grafica barridos completos posteriores;
   * los grupos parciales se representan con un hueco explicito para que una
   * linea nunca sugiera continuidad donde faltaron datos. Si todavia no existe
   * un 36/36, conserva como evidencia el ultimo grupo real.
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
    const firstCompleteIndex = groups.findIndex(isComplete);
    const hasCompleteProfile = firstCompleteIndex >= 0;
    const relevantGroups = hasCompleteProfile ? groups.slice(firstCompleteIndex) : [latestGroup];
    const completeGroups = relevantGroups.filter(isComplete);
    const latestProfileGroup = completeGroups[completeGroups.length - 1] || latestGroup;
    const allowedFrameKeys = new Set<string>();
    const gapTimestamps: number[] = [];
    let previousGroup: (typeof groups)[number] | undefined;

    for (const group of relevantGroups) {
      if (isComplete(group)) {
        group.frameKeys.forEach((key) => allowedFrameKeys.add(key));
        if (
          previousGroup &&
          isComplete(previousGroup) &&
          group.start - previousGroup.start > this.sentekContinuousProfileGapMs
        ) {
          gapTimestamps.push(previousGroup.end + Math.floor((group.start - previousGroup.end) / 2));
        }
      } else if (hasCompleteProfile) {
        gapTimestamps.push(group.start);
      } else {
        group.frameKeys.forEach((key) => allowedFrameKeys.add(key));
      }
      previousGroup = group;
    }

    const latestPoints = this.expectedSentekDepthsCm
      .map((depth) => latestProfileGroup.latestByIdentity.get(`${selectedMetric}:${depth}`))
      .filter((point): point is HistoricalPoint => !!point);
    const missingDepths = this.expectedSentekDepthsCm.filter(
      (depth) => !latestGroup.latestByIdentity.has(`${selectedMetric}:${depth}`)
    );
    const dataStart = Math.max(this.getFechaDesdeMs(), relevantGroups[0].start);
    const dataEnd = latestGroup.end;
    return {
      allowedFrameKeys,
      dataEnd,
      dataStart,
      gapTimestamps: [...new Set(gapTimestamps)].sort((a, b) => a - b),
      latestPoints,
      missingDepths,
      visibleEnd: dataEnd + this.sentekChartLeadMs,
      visibleStart: Math.max(this.getFechaDesdeMs(), dataStart - this.sentekChartLeadMs),
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
      const gaps: HistoricalPoint[] = recentWindow.gapTimestamps.map((x) => ({
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
        marker: {
          ...(item.marker || {}),
          enabled: values.length <= 36,
        },
      };
    });
  }

  private buildProfileFreshnessNotice(missingDepths: number[]): string {
    if (!missingDepths.length) return '';
    if (missingDepths.length > 4) {
      return `${missingDepths.length} niveles sin datos en el ultimo barrido.`;
    }
    const labels = missingDepths.map(String);
    const depths = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}` : labels[0];
    return `Sin datos recientes: ${depths} cm.`;
  }

  private buildProfileRows(definition: SoilMetricDefinition, latestPoints: HistoricalPoint[]): ProfileRow[] {
    return latestPoints.map((point) => ({
      profundidad: point.depth,
      formatted: `${Number(point.y).toFixed(definition.decimals)} ${definition.unit}`,
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

  private buildRainPoints(): RainPoint[] {
    const desde = this.getFechaDesdeMs();
    const lluviaExterna = this.lluvias
      .map((item) => ({
        x: this.rainTimestamp(item.fecha),
        y: Math.max(0, Number(item.milimetros)),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && (!desde || point.x >= desde));

    if (lluviaExterna.length) {
      const porDia = new Map<number, RainPoint>();
      lluviaExterna.forEach((point) => porDia.set(point.x, point));
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

  private buildResumen(definition: SoilMetricDefinition, series: any[], latestPoints: HistoricalPoint[]): string {
    const pointCount = series.reduce(
      (sum, item) => sum + (item.data || []).filter((point: HistoricalPoint) => point.y !== null).length,
      0
    );
    if (!pointCount) return 'Sin lecturas historicas para esta variable';
    const latest = latestPoints.length ? ` - ultimo perfil ${latestPoints.length}/12 niveles` : '';
    return `${series.length}/12 profundidades detectadas - ${pointCount} datos crudos${latest}`;
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
    const desde = this.getFechaDesdeMs();
    return [...(this.rawFrames || [])]
      .filter((frame) => {
        const timestamp = new Date(frame.timestamp).getTime();
        return Number.isFinite(timestamp) && (!desde || timestamp >= desde);
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
    const desde = this.getFechaDesdeMs();
    return this.sortedReports().filter((reporte) => {
      const timestamp = this.getReporteTimestamp(reporte);
      return !desde || (!!timestamp && timestamp >= desde);
    });
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
