import { SimpleChange } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { IReporte } from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { GraficoHistoricoAmbienteComponent } from './grafico-historico-ambiente.component';

describe('GraficoHistoricoAmbienteComponent', () => {
  const reporte = (fecha: string, temperatura: number, humedad: number, bateria = 96): IReporte =>
    ({
      fecha,
      datos: {
        valores: {
          Temperatura: [{ unidad: 'C', valores: { actual: temperatura } }],
          Humedad: [{ unidad: '%', valores: { actual: humedad } }],
          Batería: [{ unidad: '%', valores: { actual: bateria } }],
        },
      },
    }) as IReporte;

  const refresh = (component: GraficoHistoricoAmbienteComponent): void => {
    component.ngOnChanges({
      reportes: new SimpleChange(undefined, component.reportes, true),
      periodDays: new SimpleChange(undefined, component.periodDays, true),
      periodEnd: new SimpleChange(undefined, component.periodEnd, true),
    });
  };

  it('dibuja los valores actuales exactos y corta la linea durante una interrupcion', () => {
    const component = new GraficoHistoricoAmbienteComponent();
    component.periodDays = 1;
    component.periodEnd = '2026-08-18T16:00:00.000Z';
    component.reportes = [
      reporte('2026-08-18T10:00:00.000Z', 9.9, 58),
      reporte('2026-08-18T10:20:00.000Z', 10.4, 57.5),
      reporte('2026-08-18T15:00:00.000Z', 13, 50.5),
    ];

    refresh(component);

    const temperature = component.chartOptions.series[0];
    expect(temperature.type).toBe('line');
    expect(temperature.data.map((point: any) => point.y)).toEqual([9.9, 10.4, null, 13]);
    expect(temperature.data.filter((point: any) => point.y !== null)).toHaveSize(3);
    const battery = component.chartOptions.series[2];
    expect(battery.name).toBe('Batería (%)');
    expect(battery.data.map((point: any) => point.y)).toEqual([96, 96, null, 96]);
    expect(battery.yAxis).toBe(1);
    expect(battery.dashStyle).toBe('ShortDash');
    expect(component.chartOptions.plotOptions.series.connectNulls).toBeFalse();
  });

  it('conserva la cola vacia hasta el fin del periodo para hacer visible un sensor caido', () => {
    const component = new GraficoHistoricoAmbienteComponent();
    component.periodDays = 30;
    component.periodEnd = '2026-08-18T16:00:00.000Z';
    component.reportes = [reporte('2026-08-03T18:25:21.587Z', 12, 60)];

    refresh(component);

    expect(component.chartOptions.xAxis.min).toBe(new Date('2026-08-03T18:25:21.587Z').getTime());
    expect(component.chartOptions.xAxis.max).toBe(new Date(component.periodEnd).getTime());
  });

  it('no agrega vacio antes de la primera lectura y grafica temperatura, humedad y bateria', () => {
    const component = new GraficoHistoricoAmbienteComponent();
    component.periodDays = 7;
    component.periodEnd = '2026-08-18T16:00:00.000Z';
    component.reportes = [
      reporte('2026-08-17T20:21:00.000Z', -3.2, 96),
      reporte('2026-08-18T15:50:00.000Z', 13.2, 51, 98),
    ];

    refresh(component);

    expect(component.chartOptions.xAxis.min).toBe(new Date('2026-08-17T20:21:00.000Z').getTime());
    expect(component.chartOptions.xAxis.max).toBe(new Date(component.periodEnd).getTime());
    expect(component.chartOptions.series.map((series: any) => series.name)).toEqual([
      'Temperatura (°C)',
      'Humedad relativa (%)',
      'Batería (%)',
    ]);
    expect(component.chartOptions.series[2].data.map((point: any) => point.y)).toEqual([96, null, 98]);
    expect(component.chartOptions.yAxis[1].min).toBe(0);
    expect(component.chartOptions.yAxis[1].max).toBe(100);
  });

  it('renderiza la linea y la leyenda de bateria en el SVG real', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoAmbienteComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoAmbienteComponent);
    fixture.componentRef.setInput('periodDays', 1);
    fixture.componentRef.setInput('periodEnd', '2026-08-20T12:00:00.000Z');
    fixture.componentRef.setInput('reportes', [
      reporte('2026-08-20T10:00:00.000Z', 4.8, 68, 96),
      reporte('2026-08-20T10:10:00.000Z', 5.1, 65, 96),
      reporte('2026-08-20T10:20:00.000Z', 5.5, 61.5, 98),
    ]);
    fixture.detectChanges();
    tick(150);

    const chartComponent = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance as ChartComponent;
    const chart = chartComponent.chart!;
    const battery = chart.series.find((series) => series.name === 'Batería (%)') as any;
    const legendText = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.highcharts-legend-item text')].map(
      (element) => element.textContent?.trim()
    );

    expect(chart.series.map((series) => series.name)).toEqual([
      'Temperatura (°C)',
      'Humedad relativa (%)',
      'Batería (%)',
    ]);
    expect(battery).toBeDefined();
    expect(battery.visible).toBeTrue();
    expect(battery.points.map((point: any) => point.y)).toEqual([96, 96, 98]);
    expect(battery.graph?.element?.getAttribute('d')).toContain('M');
    expect(legendText).toContain('Batería (%)');
    fixture.destroy();
  }));
});
