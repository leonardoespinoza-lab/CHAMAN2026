import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import Highcharts from 'highcharts';
import { HighchartsChartModule } from 'highcharts-angular';

import { applyChamanHighchartsDefaults, withChamanChartTheme } from './chaman-chart-theme';

applyChamanHighchartsDefaults(Highcharts);

@Component({
  selector: 'app-chart',
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.scss'],
  imports: [HighchartsChartModule],
})
export class ChartComponent implements OnChanges, OnDestroy {
  public Highcharts: typeof Highcharts = Highcharts;

  @Input() options?: Highcharts.Options;
  @Input() style?: string;
  @Input() constructorType: string = 'chart';
  public update: boolean = false;
  chart?: Highcharts.Chart;

  @Output() optionsChange = new EventEmitter<Highcharts.Options>();
  @Output() chartPrint = new EventEmitter<void>();
  private chartPrintTimer?: ReturnType<typeof setTimeout>;

  public chartInstance(chart: Highcharts.Chart | null) {
    this.chart = chart || undefined;
  }

  public chartCallback: Highcharts.ChartCallbackFunction = () => {
    if (this.chartPrintTimer) {
      clearTimeout(this.chartPrintTimer);
    }
    this.chartPrintTimer = setTimeout(() => {
      this.chartPrint.emit();
    }, 100);
  };

  private setDefaults() {
    if (!this.options) {
      return;
    }

    this.options = this.prepareOptions(this.options);
    this.update = Boolean(this.chart);
  }

  private prepareOptions(options: Highcharts.Options): Highcharts.Options {
    const themedOptions = this.isChamanChart(options) ? withChamanChartTheme(options) : options;

    return {
      ...themedOptions,
      accessibility: themedOptions.accessibility || {
        enabled: false,
      },
      chart: {
        ...(themedOptions.chart || {}),
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          ...(themedOptions.chart?.style || {}),
        },
      },
    };
  }

  private isChamanChart(options: Highcharts.Options): boolean {
    if ((options as any)?.custom?.chamanTheme === 'none') {
      return false;
    }

    const themedTypes = new Set(['line', 'spline', 'area', 'areaspline', 'column', 'bar']);
    const chartType = String(options.chart?.type || '');

    if (themedTypes.has(chartType)) {
      return true;
    }

    return (options.series || []).some((series: any) => themedTypes.has(String(series?.type || chartType)));
  }

  ngOnChanges() {
    this.setDefaults();
  }

  ngOnDestroy(): void {
    if (this.chartPrintTimer) {
      clearTimeout(this.chartPrintTimer);
      this.chartPrintTimer = undefined;
    }
    // highcharts-angular destruye la instancia hija. Soltamos solamente la
    // referencia local para no ejecutar Chart.destroy() dos veces.
    this.chart = undefined;
  }
}
