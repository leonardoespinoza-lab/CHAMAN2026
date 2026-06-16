import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { IReporte } from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';

type AmbientMetricKey = 'temperatura' | 'humedad' | 'bateria';

interface AmbientMetricDefinition {
  key: AmbientMetricKey;
  labels: string[];
  title: string;
  unit: string;
  color: string;
  decimals: number;
  yAxis: number;
}

interface AmbientPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-grafico-historico-ambiente',
  imports: [SharedModule, ChartComponent],
  templateUrl: './grafico-historico-ambiente.component.html',
  styleUrl: './grafico-historico-ambiente.component.scss',
})
export class GraficoHistoricoAmbienteComponent implements OnChanges {
  @Input() reportes: IReporte[] = [];
  @Input() titulo?: string;
  @Input() subtitulo?: string;

  public chartOptions?: any;
  public resumen = '';

  private readonly definitions: AmbientMetricDefinition[] = [
    {
      key: 'temperatura',
      labels: ['Temperatura'],
      title: 'Temperatura',
      unit: 'C',
      color: '#ef5148',
      decimals: 1,
      yAxis: 0,
    },
    {
      key: 'humedad',
      labels: ['Humedad'],
      title: 'Humedad relativa',
      unit: '%',
      color: '#2f9fe8',
      decimals: 1,
      yAxis: 1,
    },
    {
      key: 'bateria',
      labels: ['Bateria', 'Batería', 'BaterÃ­a'],
      title: 'Bateria',
      unit: '%',
      color: '#65b946',
      decimals: 0,
      yAxis: 1,
    },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reportes']) {
      this.prepareOptions();
    }
  }

  public exportarCsv(): void {
    const rows = this.getCsvRows();
    if (!rows.length) return;

    const headers = ['Fecha', 'Temperatura C', 'Humedad %', 'Bateria %'];
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(';'))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-ambiente-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private prepareOptions(): void {
    const series = this.buildSeries();
    this.resumen = this.buildResumen(series);
    this.chartOptions = series.length ? this.buildChartOptions(series) : undefined;
  }

  private buildSeries(): any[] {
    const reportes = this.sortedReports();
    return this.definitions
      .map((definition) => {
        const data = reportes
          .map((reporte): AmbientPoint | undefined => {
            const timestamp = this.getReporteTimestamp(reporte);
            const value = this.getMetricValue(reporte, definition);
            if (!timestamp || value === undefined) return undefined;
            return { x: timestamp, y: value };
          })
          .filter((point): point is AmbientPoint => !!point);

        if (!data.length) return undefined;
        return {
          name: `${definition.title} (${definition.unit})`,
          data,
          type: 'spline',
          color: definition.color,
          yAxis: definition.yAxis,
          marker: { enabled: data.length <= 36, radius: 2 },
          tooltip: {
            valueDecimals: definition.decimals,
            valueSuffix: ` ${definition.unit}`,
          },
        };
      })
      .filter(Boolean);
  }

  private buildChartOptions(series: any[]): any {
    return {
      chart: {
        backgroundColor: 'transparent',
        height: 620,
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
          color: 'rgba(34, 211, 200, 0.22)',
          width: 1,
        },
        type: 'datetime',
        title: {
          text: 'Fecha y hora',
          style: { color: 'var(--p-text-color)', fontSize: '14px', fontWeight: '750' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '14px' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis: [
        {
          title: {
            text: 'Temperatura (C)',
            style: { color: '#ef5148', fontSize: '14px', fontWeight: '750' },
          },
          labels: {
            style: { color: 'var(--p-text-color)', fontSize: '14px' },
          },
          gridLineColor: 'var(--p-surface-border)',
          gridLineWidth: 1,
        },
        {
          min: 0,
          max: 100,
          opposite: true,
          title: {
            text: 'Humedad / bateria (%)',
            style: { color: '#2f9fe8', fontSize: '14px', fontWeight: '750' },
          },
          labels: {
            style: { color: 'var(--p-text-color)', fontSize: '14px' },
          },
          gridLineColor: 'transparent',
        },
      ],
      legend: {
        align: 'center',
        enabled: true,
        itemDistance: 18,
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '750',
        },
        layout: 'horizontal',
        verticalAlign: 'bottom',
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        shared: true,
        shadow: true,
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
        xDateFormat: '%d/%m/%Y %H:%M',
      },
      plotOptions: {
        spline: {
          animation: { duration: 450 },
          dataLabels: { enabled: false },
          enableMouseTracking: true,
          lineWidth: 1.8,
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
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      series,
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: 430 },
              legend: { itemStyle: { fontSize: '12px' } },
            },
          },
        ],
      },
    };
  }

  private buildResumen(series: any[]): string {
    const reportes = this.sortedReports();
    if (!series.length || !reportes.length) return 'Sin lecturas historicas para este sensor';
    const first = new Date(this.getReporteTimestamp(reportes[0])).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const last = new Date(this.getReporteTimestamp(reportes[reportes.length - 1])).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${reportes.length} lecturas - ${first} a ${last}`;
  }

  private getCsvRows(): unknown[][] {
    return this.sortedReports().map((reporte) => [
      new Date(this.getReporteTimestamp(reporte)).toISOString(),
      this.getMetricValue(reporte, this.definitions[0]) ?? '',
      this.getMetricValue(reporte, this.definitions[1]) ?? '',
      this.getMetricValue(reporte, this.definitions[2]) ?? '',
    ]);
  }

  private getMetricValue(reporte: IReporte, definition: AmbientMetricDefinition): number | undefined {
    const valores = (reporte.datos?.valores || {}) as unknown as Record<string, any>;
    for (const label of definition.labels) {
      const entry = valores[label]?.[0];
      const value = entry?.valores?.actual ?? entry?.valores?.promedio;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  }

  private sortedReports(): IReporte[] {
    return [...(this.reportes || [])]
      .filter((reporte) => !!this.getReporteTimestamp(reporte))
      .sort((a, b) => this.getReporteTimestamp(a) - this.getReporteTimestamp(b));
  }

  private getReporteTimestamp(reporte: IReporte): number {
    return new Date(reporte.fecha || reporte.fechaCreacion || '').getTime() || 0;
  }

  private csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  }
}
