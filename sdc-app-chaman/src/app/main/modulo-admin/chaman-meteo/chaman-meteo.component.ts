import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import Highcharts from 'highcharts';
import {
  IChamanMeteoAdminStatus,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoImportJob,
} from 'modelos/src';
import { ChartComponent } from '../../../auxiliares/componentes/chart/chart.component';
import { ChamanMeteoHistoryQuery, ChamanMeteoService } from '../../../auxiliares/http/chaman-meteo.service';
import { SharedModule } from '../../../auxiliares/shared.module';
import {
  buildDailyCsvRows,
  buildHourlyCsvRows,
  chronological,
  compassDirection,
  csvCell,
  dominantWindDirectionLabel,
  finite,
  layerValue,
  localDateAtInstant,
  localDatesTouched,
  localMidnightUtc,
  mapUniqueByKey,
  seriesWithGaps,
  tailRows,
  validCalendarDate,
} from './chaman-meteo-series';

type HistoryPeriod = '24h' | '7d' | '30d' | 'custom';
type HistoryView = 'daily' | 'hourly' | 'soil';

interface HistoryRange {
  from: string;
  toExclusive: string;
  dailyFrom: string;
  dailyToExclusive: string;
}

@Component({
  selector: 'app-chaman-meteo',
  imports: [SharedModule, ChartComponent],
  templateUrl: './chaman-meteo.component.html',
  styleUrl: './chaman-meteo.component.scss',
})
export class ChamanMeteoComponent implements OnInit {
  public status?: IChamanMeteoAdminStatus;
  public gridPoints: IChamanMeteoGridPoint[] = [];
  public jobs: IChamanMeteoImportJob[] = [];
  public hourly: IChamanMeteoHourlyDerived[] = [];
  public daily: IChamanMeteoDaily[] = [];
  public selectedGridPoint = '';
  public period: HistoryPeriod = '30d';
  public view: HistoryView = 'daily';
  public customFrom = '';
  public customTo = '';
  public hourlyTotal = 0;
  public dailyTotal = 0;
  public loading = false;
  public error = '';
  public historyTruncated = false;
  public historyInconsistent = false;
  public activeRange?: HistoryRange;
  public loadedGridPoint = '';
  public loadedTimezone = 'UTC';
  public hourlyChartRowsShown = 0;

  public dailyAtmosphereOptions?: Highcharts.Options;
  public dailyWaterOptions?: Highcharts.Options;
  public dailyWindOptions?: Highcharts.Options;
  public hourlyAtmosphereOptions?: Highcharts.Options;
  public hourlyWindOptions?: Highcharts.Options;
  public hourlyRadiationOptions?: Highcharts.Options;
  public soilTemperatureOptions?: Highcharts.Options;
  public soilWaterOptions?: Highcharts.Options;

  public readonly periods: Array<{ value: HistoryPeriod; label: string }> = [
    { value: '24h', label: '24 h' },
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: 'custom', label: 'Personalizado' },
  ];
  public readonly views: Array<{ value: HistoryView; label: string }> = [
    { value: 'daily', label: 'Resumen diario' },
    { value: 'hourly', label: 'Detalle horario' },
    { value: 'soil', label: 'Suelo ERA5-Land' },
  ];
  public readonly layerLabels = ['0–7 cm', '7–28 cm', '28–100 cm', '100–289 cm'];

  private requestSequence = 0;
  private readonly pageSize = 500;
  private readonly maximumRows = 25_000;
  public readonly hourlyChartLimit = 744;

  constructor(
    private readonly service: ChamanMeteoService,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  public volver(): void {
    this.router.navigateByUrl('/dashboard-admin');
  }

  public async refresh(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const status = await this.service.status();
      this.status = status;
      // Older API versions did not include configurationValid. Only an
      // explicit false means the protected v2 data routes must be skipped.
      if (status.configurationValid === false) {
        this.gridPoints = [];
        this.jobs = [];
        this.selectedGridPoint = '';
        this.invalidateHistorySnapshot('UTC');
        return;
      }
      const [gridPoints, jobPage] = await Promise.all([
        this.fetchAllGridPoints(),
        this.service.jobs(),
      ]);
      this.gridPoints = gridPoints;
      this.jobs = jobPage.datos || [];
      if (!this.gridPoints.some((point) => point.key === this.selectedGridPoint)) {
        this.selectedGridPoint = this.gridPoints[0]?.key || '';
      }
      await this.loadValues();
    } catch (error: any) {
      this.error = this.errorMessage(error, 'No se pudo consultar Chaman-Meteo.');
    } finally {
      this.loading = false;
    }
  }

  public async changeGridPoint(): Promise<void> {
    await this.reloadHistory();
  }

  public async selectPeriod(period: HistoryPeriod): Promise<void> {
    this.period = period;
    if (period !== 'custom') await this.reloadHistory();
  }

  public async applyCustomRange(): Promise<void> {
    if (this.period !== 'custom') this.period = 'custom';
    await this.reloadHistory();
  }

  public selectView(view: HistoryView): void {
    this.view = view;
  }

  public get latestHourly(): IChamanMeteoHourlyDerived | undefined {
    return this.hourly[this.hourly.length - 1];
  }

  public get selectedPoint(): IChamanMeteoGridPoint | undefined {
    return this.gridPoints.find((point) => point.key === this.selectedGridPoint);
  }

  public get dailyDescending(): IChamanMeteoDaily[] {
    return [...this.daily].reverse();
  }

  public get recentHourly(): IChamanMeteoHourlyDerived[] {
    return [...this.hourly].reverse().slice(0, 72);
  }

  public get rangeLabel(): string {
    if (!this.activeRange) return 'Sin cobertura cargada';
    return `${this.activeRange.dailyFrom} → ${this.previousDate(this.activeRange.dailyToExclusive)}`;
  }

  public get canExportCsv(): boolean {
    const hasRows = this.view === 'daily' ? this.daily.length > 0 : this.hourly.length > 0;
    return (
      !this.loading &&
      !this.historyTruncated &&
      Boolean(this.activeRange) &&
      this.loadedGridPoint === this.selectedGridPoint &&
      hasRows
    );
  }

  public get exportUnavailableReason(): string {
    if (this.historyInconsistent)
      return 'Los datos cambiaron durante la carga. Reintentá antes de exportar.';
    if (this.historyTruncated) return 'Acotá el rango: una exportación parcial está bloqueada.';
    if (this.loading || this.loadedGridPoint !== this.selectedGridPoint)
      return 'Esperá a que termine la consulta actual.';
    return 'No hay datos de esta vista para exportar.';
  }

  public get hourlyChartsLimited(): boolean {
    return this.hourlyChartRowsShown < this.hourly.length;
  }

  public stateLabel(): string {
    switch (this.status?.state) {
      case 'AVAILABLE':
        return 'Datos disponibles';
      case 'IMPORTING':
        return 'Importando';
      case 'READY':
        return 'Listo para importar';
      case 'ERROR':
        return 'Revisar importación';
      default:
        return 'Integración desactivada';
    }
  }

  public stateClass(): string {
    return String(this.status?.state || 'DISABLED').toLowerCase();
  }

  public importEnabledLabel(): string {
    if (this.status?.importEnabled === true) return 'Habilitada';
    if (this.status?.importEnabled === false) return 'Deshabilitada';
    return 'Sin información';
  }

  public credentialStatusLabel(): string {
    if (this.status?.credentialConfigured === true) return 'Reportado, no validado';
    if (this.status?.credentialConfigured === false) return 'No confirmado';
    return 'Sin información';
  }

  public licenseRequired(): boolean {
    const message = String(this.status?.lastError || this.status?.latestJob?.lastError || '').toLowerCase();
    return message.includes('licence') || message.includes('licencia');
  }

  public number(value?: number | null, decimals = 1): string {
    return finite(value) ? Number(value).toFixed(decimals) : '-';
  }

  public expectedHours(row: IChamanMeteoDaily): number {
    const expected = Number(row.hoursExpected);
    return Number.isFinite(expected) && expected >= 23 && expected <= 25 ? expected : 24;
  }

  public isPartial(row: IChamanMeteoDaily): boolean {
    return row.hoursAvailable < this.expectedHours(row) || row.qualityFlags.some((flag) => flag.includes('incomplete'));
  }

  public isAdjusted(row: IChamanMeteoDaily): boolean {
    return row.qualityFlags.some((flag) =>
      /(correction|clamped|omitted|outlier|fallback|outside_valid|negative)/i.test(flag)
    );
  }

  public qualityLabel(row: IChamanMeteoDaily): string {
    if (this.isPartial(row)) return 'Parcial';
    if (this.isAdjusted(row)) return 'Ajustado';
    return 'Completo';
  }

  public qualityObservation(row: IChamanMeteoDaily): string {
    const observations: string[] = [];
    if (row.qualityFlags.some((flag) => flag.includes('precipitation_negative_correction'))) {
      observations.push('lluvia negativa mínima corregida a 0');
    }
    if (row.qualityFlags.some((flag) => flag.includes('precipitation_unavailable_negative_outlier'))) {
      observations.push('lluvia omitida por valor fuera de tolerancia');
    }
    if (row.qualityFlags.some((flag) => flag.includes('snow_cover_outside_valid_range'))) {
      observations.push('cobertura de nieve inválida omitida');
    }
    if (row.qualityFlags.some((flag) => flag.includes('snow_depth_negative'))) {
      observations.push('profundidad de nieve inválida omitida');
    }
    if (row.qualityFlags.some((flag) => flag.includes('timezone_fallback'))) {
      observations.push('agregado diario calculado en UTC');
    }
    const incompleteMetrics = row.qualityFlags.filter((flag) => flag.includes('daily_incomplete_')).length;
    if (incompleteMetrics) observations.push(`${incompleteMetrics} métricas con horas faltantes`);
    return observations.join('; ');
  }

  public windMean2m(row: IChamanMeteoDaily): number | undefined {
    return row.values.windSpeed2mMeanMs ?? row.values.windSpeedMeanMs;
  }

  public windMax2m(row: IChamanMeteoDaily): number | undefined {
    return row.values.windSpeed2mMaxMs ?? row.values.windSpeedMaxMs;
  }

  public compass(value?: number): string {
    return compassDirection(value);
  }

  public dailyWindDirection(row: IChamanMeteoDaily): string {
    return dominantWindDirectionLabel(
      row.values.windDirectionDominantDeg,
      row.values.windDirectionResultantRatio,
      row.values.windSpeed10mMeanMs ?? this.windMean2m(row)
    );
  }

  public soilValue(values: Array<number | null> | undefined, layer: number): string {
    return this.number(layerValue(values, layer), 3);
  }

  public soilPercent(values: Array<number | null> | undefined, layer: number): string {
    const value = layerValue(values, layer);
    return this.number(finite(value) ? value * 100 : undefined, 1);
  }

  public dateAtPoint(value?: string): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    try {
      return new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone:
          this.loadedGridPoint === this.selectedGridPoint ? this.loadedTimezone : this.selectedPoint?.timezone || 'UTC',
      }).format(parsed);
    } catch {
      return parsed.toLocaleString('es-AR');
    }
  }

  public utcDate(value?: string): string {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : `${parsed.toISOString().replace('.000Z', 'Z')} UTC`;
  }

  public date(value?: string): string {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-AR');
  }

  public exportCsv(): void {
    if (!this.canExportCsv) return;
    const rows = this.view === 'daily' ? buildDailyCsvRows(this.daily) : buildHourlyCsvRows(this.hourly);
    if (!rows.length) return;
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chaman-meteo-${this.loadedGridPoint}-${this.view}-${this.activeRange?.dailyFrom || 'historico'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async reloadHistory(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      await this.loadValues();
    } catch (error: any) {
      this.error = this.errorMessage(error, 'No se pudieron cargar los valores históricos.');
    } finally {
      this.loading = false;
    }
  }

  private async loadValues(): Promise<void> {
    const sequence = ++this.requestSequence;
    const requestedGridPoint = this.selectedGridPoint;
    const requestedTimezone = this.gridPoints.find((point) => point.key === requestedGridPoint)?.timezone || 'UTC';
    this.invalidateHistorySnapshot(requestedTimezone);
    if (!requestedGridPoint) {
      return;
    }

    const range = await this.resolveRange(requestedGridPoint, requestedTimezone);
    const hourlyQuery: ChamanMeteoHistoryQuery = {
      gridPointKey: requestedGridPoint,
      from: range.from,
      toExclusive: range.toExclusive,
    };
    const dailyQuery: ChamanMeteoHistoryQuery = {
      gridPointKey: requestedGridPoint,
      from: range.dailyFrom,
      toExclusive: range.dailyToExclusive,
    };
    const [hourlyResult, dailyResult] = await Promise.all([
      this.fetchAllHourly(hourlyQuery),
      this.fetchAllDaily(dailyQuery),
    ]);
    if (sequence !== this.requestSequence || requestedGridPoint !== this.selectedGridPoint) return;
    this.activeRange = range;
    this.loadedGridPoint = requestedGridPoint;
    this.loadedTimezone = requestedTimezone;
    this.hourly = chronological(hourlyResult.rows, (row) => row.timestamp);
    this.daily = chronological(dailyResult.rows, (row) => localMidnightUtc(row.date, requestedTimezone));
    this.hourlyTotal = hourlyResult.total;
    this.dailyTotal = dailyResult.total;
    this.historyTruncated = hourlyResult.truncated || dailyResult.truncated;
    this.historyInconsistent = hourlyResult.inconsistent || dailyResult.inconsistent;
    this.buildCharts();
  }

  private async resolveRange(gridPointKey: string, timezone: string): Promise<HistoryRange> {
    if (this.period === 'custom') return this.customRange(timezone);
    const [hourlyPage, dailyPage] = await Promise.all([
      this.service.hourlyHistory({ gridPointKey, limit: 1, offset: 0 }),
      this.service.dailyHistory({ gridPointKey, limit: 1, offset: 0 }),
    ]);
    const latestHourly = hourlyPage.datos?.[0]?.timestamp;
    const latestDaily = dailyPage.datos?.[0]?.date ||
      (latestHourly ? localDateAtInstant(latestHourly, timezone) : undefined);
    if (!latestDaily) {
      const today = new Date().toISOString().slice(0, 10);
      return this.dateRange(today, this.period === '7d' ? 7 : this.period === '24h' ? 1 : 30, timezone);
    }
    if (this.period === '24h' && latestHourly) {
      const end = new Date(latestHourly);
      end.setUTCHours(end.getUTCHours() + 1);
      const start = new Date(end);
      start.setUTCHours(start.getUTCHours() - 24);
      const touchedDates = localDatesTouched(start.toISOString(), end.toISOString(), timezone);
      return {
        from: start.toISOString(),
        toExclusive: end.toISOString(),
        dailyFrom: touchedDates.from,
        dailyToExclusive: touchedDates.toExclusive,
      };
    }
    return this.dateRange(latestDaily, this.period === '7d' ? 7 : 30, timezone);
  }

  private dateRange(latestDate: string, days: number, timezone: string): HistoryRange {
    const fromDate = this.addDays(latestDate, -(days - 1));
    const toExclusiveDate = this.addDays(latestDate, 1);
    return {
      from: localMidnightUtc(fromDate, timezone),
      toExclusive: localMidnightUtc(toExclusiveDate, timezone),
      dailyFrom: fromDate,
      dailyToExclusive: toExclusiveDate,
    };
  }

  private customRange(timezone: string): HistoryRange {
    if (!validCalendarDate(this.customFrom) || !validCalendarDate(this.customTo)) {
      throw new Error('Seleccioná las fechas Desde y Hasta para consultar el histórico.');
    }
    const from = new Date(`${this.customFrom}T00:00:00.000Z`);
    const to = new Date(`${this.customTo}T00:00:00.000Z`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      throw new Error('El rango histórico no es válido.');
    }
    const toExclusive = this.addDays(this.customTo, 1);
    return {
      from: localMidnightUtc(this.customFrom, timezone),
      toExclusive: localMidnightUtc(toExclusive, timezone),
      dailyFrom: this.customFrom,
      dailyToExclusive: toExclusive,
    };
  }

  private async fetchAllHourly(query: ChamanMeteoHistoryQuery) {
    return this.fetchAll(
      query,
      (pageQuery) => this.service.hourlyHistory(pageQuery),
      (row) => row.timestamp
    );
  }

  private async fetchAllGridPoints(): Promise<IChamanMeteoGridPoint[]> {
    const rows: IChamanMeteoGridPoint[] = [];
    const seen = new Set<string>();
    let total: number | undefined;

    while (total === undefined || rows.length < total) {
      const page = await this.service.gridPoints(this.pageSize, rows.length);
      const pageTotal = Number(page.total);
      const pageRows = page.datos || [];
      if (!Number.isInteger(pageTotal) || pageTotal < 0) {
        throw new Error('La cantidad de puntos meteorológicos no es válida.');
      }
      if (total === undefined) total = pageTotal;
      if (pageTotal !== total) {
        throw new Error('Los puntos meteorológicos cambiaron durante la carga. Reintentá la consulta.');
      }
      const expectedPageSize = Math.min(this.pageSize, total - rows.length);
      if (pageRows.length !== expectedPageSize) {
        throw new Error('No se pudieron recuperar todos los puntos meteorológicos.');
      }
      for (const point of pageRows) {
        const key = String(point?.key || '');
        if (!key || seen.has(key)) {
          throw new Error('La lista de puntos meteorológicos contiene claves inválidas o repetidas.');
        }
        seen.add(key);
        rows.push(point);
      }
    }

    return rows;
  }

  private async fetchAllDaily(query: ChamanMeteoHistoryQuery) {
    return this.fetchAll(
      query,
      (pageQuery) => this.service.dailyHistory(pageQuery),
      (row) => row.date
    );
  }

  private async fetchAll<T>(
    query: ChamanMeteoHistoryQuery,
    request: (query: ChamanMeteoHistoryQuery) => Promise<{ datos: T[]; total: number }>,
    key: (row: T) => string
  ): Promise<{ rows: T[]; total: number; truncated: boolean; inconsistent: boolean }> {
    const rows: T[] = [];
    const seen = new Set<string>();
    let total: number | undefined;
    let cursor = query.toExclusive;
    let inconsistent = false;

    while (rows.length < this.maximumRows) {
      const expectedRemaining = total === undefined ? undefined : total - rows.length;
      const page = await request({
        ...query,
        toExclusive: cursor,
        limit: Math.min(this.pageSize, this.maximumRows - rows.length),
        offset: 0,
      });
      const pageTotal = Number(page.total);
      const pageRows = page.datos || [];
      if (!Number.isInteger(pageTotal) || pageTotal < 0) {
        inconsistent = true;
        break;
      }
      if (total === undefined) total = pageTotal;
      if (expectedRemaining !== undefined && pageTotal !== expectedRemaining) {
        inconsistent = true;
        break;
      }
      const expectedPageSize = Math.min(pageTotal, this.pageSize, this.maximumRows - rows.length);
      if (pageRows.length !== expectedPageSize) {
        inconsistent = true;
        break;
      }
      let previous = cursor;
      for (const row of pageRows) {
        const current = String(key(row) || '');
        if (!current || (previous && current >= previous) || seen.has(current)) {
          inconsistent = true;
          break;
        }
        seen.add(current);
        rows.push(row);
        previous = current;
      }
      if (inconsistent || !pageRows.length || rows.length >= total) break;
      cursor = String(key(pageRows[pageRows.length - 1]) || '');
    }
    const initialTotal = total || 0;
    return {
      rows,
      total: initialTotal,
      truncated: inconsistent || initialTotal > rows.length,
      inconsistent,
    };
  }

  private buildCharts(): void {
    const dailyTimestamps = mapUniqueByKey(
      this.daily,
      (row) => row.date,
      (row) => localMidnightUtc(row.date, this.loadedTimezone),
    );
    const day = (row: IChamanMeteoDaily) => dailyTimestamps.get(row.date)!;
    const hour = (row: IChamanMeteoHourlyDerived) => row.timestamp;
    const hourlyChartRows = tailRows(this.hourly, this.hourlyChartLimit);
    this.hourlyChartRowsShown = hourlyChartRows.length;
    const dailySeries = (value: (row: IChamanMeteoDaily) => number | undefined) =>
      seriesWithGaps(this.daily, day, value, 86_400_000, true);
    const hourlySeries = (value: (row: IChamanMeteoHourlyDerived) => number | undefined) =>
      seriesWithGaps(hourlyChartRows, hour, value, 3_600_000, true);

    this.dailyAtmosphereOptions = this.chart(
      'Temperatura y humedad',
      [
        this.line(
          'Temp. mínima',
          dailySeries((row) => row.values.temperatureMinC),
          0,
          '#38a9e8'
        ),
        this.line(
          'Temp. media',
          dailySeries((row) => row.values.temperatureMeanC),
          0,
          '#e6b84f'
        ),
        this.line(
          'Temp. máxima',
          dailySeries((row) => row.values.temperatureMaxC),
          0,
          '#e05246'
        ),
        this.line(
          'HR media',
          dailySeries((row) => row.values.relativeHumidityMeanPct),
          1,
          '#22cfc7'
        ),
      ],
      ['°C', '%']
    );
    this.dailyWaterOptions = this.chart(
      'Precipitación total y ET₀ estimada',
      [
        this.column(
          'Precipitación total',
          dailySeries((row) => row.values.precipitationMm),
          0,
          '#38a9e8'
        ),
        this.line(
          'ET₀ estimada',
          dailySeries((row) => row.values.et0Mm),
          0,
          '#e6b84f'
        ),
      ],
      ['mm']
    );
    this.dailyWindOptions = this.chart(
      'Viento histórico',
      [
        this.line(
          'Viento medio 2 m',
          dailySeries((row) => this.windMean2m(row)),
          0,
          '#22cfc7'
        ),
        this.line(
          'Viento máx. horario 2 m',
          dailySeries((row) => this.windMax2m(row)),
          0,
          '#e05246'
        ),
        this.line(
          'Viento medio 10 m',
          dailySeries((row) => row.values.windSpeed10mMeanMs),
          0,
          '#38a9e8'
        ),
      ],
      ['m/s']
    );
    this.hourlyAtmosphereOptions = this.chart(
      'Atmósfera por hora',
      [
        this.line(
          'Temperatura',
          hourlySeries((row) => row.values.temperatureC),
          0,
          '#e6b84f'
        ),
        this.line(
          'Punto de rocío',
          hourlySeries((row) => row.values.dewPointC),
          0,
          '#38a9e8'
        ),
        this.line(
          'Humedad relativa',
          hourlySeries((row) => row.values.relativeHumidityPct),
          1,
          '#22cfc7'
        ),
      ],
      ['°C', '%']
    );
    this.hourlyWindOptions = this.chart(
      'Viento por hora',
      [
        this.line(
          'Viento 2 m estimado',
          hourlySeries((row) => row.values.windSpeed2Ms),
          0,
          '#22cfc7'
        ),
        this.line(
          'Viento 10 m nativo',
          hourlySeries((row) => row.values.windSpeed10Ms),
          0,
          '#38a9e8'
        ),
      ],
      ['m/s']
    );
    this.hourlyRadiationOptions = this.chart(
      'Radiación y demanda atmosférica',
      [
        this.line(
          'Radiación solar',
          hourlySeries((row) => row.values.shortwaveRadiationMjM2),
          0,
          '#e6b84f'
        ),
        this.line(
          'Radiación neta',
          hourlySeries((row) => row.values.netRadiationMjM2),
          0,
          '#36b56b'
        ),
        this.line(
          'VPD',
          hourlySeries((row) => row.values.vpdKpa),
          1,
          '#e05246'
        ),
      ],
      ['MJ/m²', 'kPa']
    );
    this.soilTemperatureOptions = this.chart(
      'Temperatura del suelo por capa',
      this.layerLabels.map((label, index) =>
        this.line(
          label,
          hourlySeries((row) => layerValue(row.values.soilTemperatureC, index)),
          0
        )
      ),
      ['°C']
    );
    this.soilWaterOptions = this.chart(
      'Agua volumétrica del suelo por capa',
      this.layerLabels.map((label, index) =>
        this.line(
          label,
          hourlySeries((row) => layerValue(row.values.soilWaterM3M3, index)),
          0
        )
      ),
      ['m³/m³']
    );
  }

  private chart(title: string, series: Highcharts.SeriesOptionsType[], units: string[]): Highcharts.Options {
    return {
      chart: { type: 'line', height: 310, zooming: { type: 'x' } },
      time: { timezone: this.loadedTimezone },
      title: { text: title },
      xAxis: { type: 'datetime' },
      yAxis: units.map((unit, index) => ({ title: { text: unit }, opposite: index % 2 === 1 })),
      tooltip: { shared: true, xDateFormat: '%d/%m/%Y %H:%M' },
      plotOptions: { series: { connectNulls: false, marker: { enabled: false } } },
      series,
    };
  }

  private line(
    name: string,
    data: Array<[number, number | null]>,
    yAxis = 0,
    color?: string
  ): Highcharts.SeriesLineOptions {
    return { type: 'line', name, data, yAxis, color, connectNulls: false };
  }

  private column(
    name: string,
    data: Array<[number, number | null]>,
    yAxis = 0,
    color?: string
  ): Highcharts.SeriesColumnOptions {
    return { type: 'column', name, data, yAxis, color };
  }

  private invalidateHistorySnapshot(timezone: string): void {
    this.hourly = [];
    this.daily = [];
    this.hourlyTotal = 0;
    this.dailyTotal = 0;
    this.historyTruncated = false;
    this.historyInconsistent = false;
    this.activeRange = undefined;
    this.loadedGridPoint = '';
    this.loadedTimezone = timezone;
    this.buildCharts();
  }

  private addDays(dateText: string, days: number): string {
    const date = new Date(`${dateText}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private previousDate(dateText: string): string {
    return this.addDays(dateText, -1);
  }

  private errorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.message || fallback;
  }
}
