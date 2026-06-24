import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import Highcharts from 'highcharts';
import More from 'highcharts/highcharts-more';
import { HighchartsChartModule } from 'highcharts-angular';
import TimelineModule from 'highcharts/modules/timeline';
import XRangeModule from 'highcharts/modules/xrange';

import { applyChamanHighchartsDefaults, withChamanChartTheme } from './chaman-chart-theme';

More(Highcharts);
TimelineModule(Highcharts);
XRangeModule(Highcharts);
applyChamanHighchartsDefaults(Highcharts);

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

  public chartInstance(chart: Highcharts.Chart) {
    this.chart = chart;
    this.setDefaults();
  }

  public chartCallback: Highcharts.ChartCallbackFunction = () => {
    setTimeout(() => {
      this.chartPrint.emit();
    }, 100);
  };

  private setDefaults() {
    if (!this.options) {
      return;
    }

    this.options = this.prepareOptions(this.options);
    this.update = true;

    if (this.chart) {
      this.chart.update(this.options, true, true);
    }
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

  ngOnInit(): void {
    this.setDefaults();
  }
}
