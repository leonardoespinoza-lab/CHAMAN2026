import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import Highcharts from 'highcharts';
import { HighchartsChartModule } from 'highcharts-angular';
import XRangeModule from 'highcharts/modules/xrange';

import More from 'highcharts/highcharts-more';
import TimelineModule from 'highcharts/modules/timeline';

More(Highcharts);
TimelineModule(Highcharts);
XRangeModule(Highcharts);

/// HICHARTS > 11 no necesita hacer esto.
// More(Highcharts);
// TimelineModule(Highcharts);
// HC_stock(Highcharts);
// Boost(Highcharts);
// SolidGauge(Highcharts);
// IndicatorsCore(Highcharts);
// IndicatorRegressions(Highcharts);
// Theme(Highcharts);
// Stock(Highcharts);
// stockTools(Highcharts);
// require('highcharts/modules/timeline')(Highcharts);

Highcharts.setOptions({
  lang: {
    months: [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ],
    weekdays: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    shortMonths: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    shortWeekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  },
});

@Component({
  selector: 'app-chart',
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.scss'],
  imports: [HighchartsChartModule],
})
export class ChartComponent implements OnInit, OnChanges {
  public Highcharts: typeof Highcharts = Highcharts;

  @Input() options?: Highcharts.Options;
  @Input() style?: string;
  @Input() constructorType: string = 'chart';
  public update: boolean = false;
  chart?: Highcharts.Chart;

  @Output() optionsChange = new EventEmitter<Highcharts.Options>();
  @Output() chartPrint = new EventEmitter<void>();

  constructor() {
    this.chartCallback.bind(this);
  }

  public chartInstance(chart: Highcharts.Chart) {
    this.chart = chart;
  }

  public chartCallback: Highcharts.ChartCallbackFunction = () => {
    setTimeout(() => {
      this.chartPrint.emit();
    }, 100);
  };

  private setDefaults() {
    this.update = true;
    if (this.chart && this.options) {
      this.options = this.applyLineChartTheme(this.options);

      if (!this.options.accessibility) {
        this.options.accessibility = {
          enabled: false,
        };
      }
      if (this.options?.chart && !this.options?.chart?.style) {
        this.options!.chart!.style = {
          fontFamily: 'Lato, sans-serif',
        };
      }

      this.chart?.update(this.options, true, true);
    }
  }

  private applyLineChartTheme(options: Highcharts.Options): Highcharts.Options {
    if (!this.isLineChart(options)) {
      return options;
    }

    const chart = options.chart || {};
    const plotOptions = options.plotOptions || {};
    const lineBase = {
      animation: { duration: 650 },
      dataLabels: { enabled: false },
      lineWidth: 2.35,
      marker: {
        enabled: false,
        radius: 3,
        symbol: 'circle',
        states: {
          hover: {
            enabled: true,
            radius: 4.5,
          },
        },
      },
      shadow: {
        color: 'rgba(34, 211, 200, 0.14)',
        offsetX: 0,
        offsetY: 6,
        opacity: 0.16,
        width: 12,
      },
      states: {
        hover: {
          enabled: true,
          lineWidthPlus: 0.7,
        },
        inactive: {
          opacity: 0.45,
        },
      },
    };

    return {
      ...options,
      colors: options.colors || [
        '#22d3c8',
        '#f3df22',
        '#35a7ff',
        '#ff8a68',
        '#ff6f91',
        '#8fe388',
        '#b88cff',
      ],
      chart: {
        ...chart,
        backgroundColor:
          chart.backgroundColor ?? {
            linearGradient: { x1: 0, y1: 0, x2: 1, y2: 1 },
            stops: [
              [0, '#203746'],
              [0.48, '#243244'],
              [1, '#1d2b3a'],
            ],
          },
        borderRadius: chart.borderRadius ?? 10,
        marginTop: chart.marginTop ?? 24,
        spacingBottom: chart.spacingBottom ?? 18,
        spacingLeft: chart.spacingLeft ?? 14,
        spacingRight: chart.spacingRight ?? 18,
        spacingTop: chart.spacingTop ?? 20,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          ...(chart.style || {}),
        },
      },
      title: {
        ...options.title,
        style: {
          ...(options.title?.style || {}),
          color: '#f5fbff',
          fontSize: '16px',
          fontWeight: '700',
        },
      },
      subtitle: {
        ...options.subtitle,
        style: {
          ...(options.subtitle?.style || {}),
          color: '#93a7b8',
          fontSize: '13px',
        },
      },
      xAxis: this.themeAxis(options.xAxis, 'x'),
      yAxis: this.themeAxis(options.yAxis, 'y'),
      legend: {
        ...options.legend,
        align: options.legend?.align || 'center',
        itemDistance: options.legend?.itemDistance || 18,
        itemHoverStyle: {
          ...(options.legend?.itemHoverStyle || {}),
          color: '#ffffff',
        },
        itemStyle: {
          ...(options.legend?.itemStyle || {}),
          color: '#d7e4ee',
          fontSize: '13px',
          fontWeight: '650',
        },
        symbolHeight: options.legend?.symbolHeight || 8,
        symbolRadius: options.legend?.symbolRadius || 4,
        symbolWidth: options.legend?.symbolWidth || 20,
      },
      tooltip: {
        ...options.tooltip,
        backgroundColor: options.tooltip?.backgroundColor ?? 'rgba(18, 31, 43, 0.94)',
        borderColor: options.tooltip?.borderColor ?? 'rgba(34, 211, 200, 0.35)',
        borderRadius: 10,
        borderWidth: 1,
        shadow: {
          color: 'rgba(0, 0, 0, 0.28)',
          offsetX: 0,
          offsetY: 8,
          opacity: 0.45,
          width: 14,
        },
        style: {
          ...(options.tooltip?.style || {}),
          color: options.tooltip?.style?.color ?? '#eef8ff',
          fontSize: '13px',
        },
      },
      plotOptions: {
        ...plotOptions,
        area: {
          ...lineBase,
          ...(plotOptions.area || {}),
        },
        areaspline: {
          ...lineBase,
          ...(plotOptions.areaspline || {}),
        },
        line: {
          ...lineBase,
          ...(plotOptions.line || {}),
        },
        spline: {
          ...lineBase,
          ...(plotOptions.spline || {}),
        },
        series: {
          ...(plotOptions.series || {}),
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      credits: { enabled: false },
    };
  }

  private isLineChart(options: Highcharts.Options): boolean {
    const lineTypes = new Set(['line', 'spline', 'area', 'areaspline']);
    const chartType = String(options.chart?.type || '');

    if (lineTypes.has(chartType)) {
      return true;
    }

    return (options.series || []).some((series: any) => lineTypes.has(String(series?.type || chartType)));
  }

  private themeAxis(axis: any, kind: 'x' | 'y'): any {
    if (Array.isArray(axis)) {
      return axis.map((item) => this.themeAxisItem(item, kind));
    }

    return this.themeAxisItem(axis || {}, kind);
  }

  private themeAxisItem(axis: any, kind: 'x' | 'y'): any {
    return {
      ...axis,
      crosshair: axis.crosshair ?? {
        color: 'rgba(255, 255, 255, 0.10)',
        dashStyle: 'Solid',
        width: 1,
      },
      gridLineColor: kind === 'y' ? 'rgba(214, 232, 242, 0.10)' : 'rgba(214, 232, 242, 0.06)',
      gridLineWidth: axis.gridLineWidth ?? 1,
      labels: {
        ...(axis.labels || {}),
        style: {
          ...(axis.labels?.style || {}),
          color: axis.labels?.style?.color ?? '#9fb2c3',
          fontSize: '12px',
          fontWeight: '600',
        },
      },
      lineColor: 'rgba(214, 232, 242, 0.10)',
      tickColor: 'rgba(214, 232, 242, 0.14)',
      title: {
        ...(axis.title || {}),
        style: {
          ...(axis.title?.style || {}),
          color: axis.title?.style?.color ?? '#d7e4ee',
          fontSize: '13px',
          fontWeight: '700',
        },
      },
    };
  }

  ngOnChanges() {
    this.setDefaults();
  }

  ngOnInit(): void {
    this.setDefaults();
  }
}
