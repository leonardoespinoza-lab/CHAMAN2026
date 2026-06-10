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

  ngOnChanges() {
    this.setDefaults();
  }

  ngOnInit(): void {
    this.setDefaults();
  }
}
