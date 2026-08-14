import { ChartComponent } from './chart.component';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';

describe('ChartComponent', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--chaman-chart-primary');
  });

  it('prepara las opciones una vez por cambio sin actualizar la instancia directamente', () => {
    document.documentElement.style.setProperty('--chaman-chart-primary', '#367c2b');
    const component = new ChartComponent();
    const chart = {
      update: jasmine.createSpy('update'),
    } as any;

    component.options = {
      chart: { type: 'line' },
      series: [{ type: 'line', data: [1, 2] }],
    };
    component.ngOnChanges();
    component.chartInstance(chart);

    expect(component.options?.colors?.[0]).toBe('#367c2b');
    expect(chart.update).not.toHaveBeenCalled();

    component.options = {
      chart: { type: 'line' },
      series: [{ type: 'line', data: [2, 3] }],
    };
    component.ngOnChanges();

    expect(component.update).toBeTrue();
    expect(chart.update).not.toHaveBeenCalled();
  });

  it('cancela la notificacion diferida y libera la referencia al destruirse', () => {
    jasmine.clock().install();
    const component = new ChartComponent();
    const emit = spyOn(component.chartPrint, 'emit');
    component.chartInstance({} as any);

    component.chartCallback.call({} as any, {} as any);
    component.ngOnDestroy();
    jasmine.clock().tick(101);

    expect(emit).not.toHaveBeenCalled();
    expect(component.chart).toBeUndefined();
    jasmine.clock().uninstall();
  });

  it('mantiene una sola notificacion y no actualiza dos veces tras 200 cambios', () => {
    jasmine.clock().install();
    const component = new ChartComponent();
    const chart = {
      update: jasmine.createSpy('update'),
    } as any;
    const emit = spyOn(component.chartPrint, 'emit');
    component.chartInstance(chart);

    for (let index = 0; index < 200; index += 1) {
      component.options = {
        chart: { type: 'line' },
        series: [{ type: 'line', data: [index, index + 1] }],
      };
      component.ngOnChanges();
      component.chartCallback.call({} as any, {} as any);
    }

    jasmine.clock().tick(101);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(chart.update).not.toHaveBeenCalled();
    expect(component.update).toBeTrue();

    component.ngOnDestroy();
    jasmine.clock().uninstall();
  });

  it('reemplaza una serie identificada al cambiar de variable', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [ChartComponent] });
    const fixture = TestBed.createComponent(ChartComponent);
    const component = fixture.componentInstance;
    component.style = 'width: 800px; height: 400px; display: block';
    component.options = {
      accessibility: { enabled: false },
      chart: { animation: false, type: 'spline' },
      series: [
        {
          data: [
            [1, 12],
            [2, 13],
          ],
          id: 'sentek-temperatura-100',
          type: 'spline',
        },
      ],
    };

    fixture.detectChanges();
    tick(110);
    expect(component.chart?.series.map((series) => series.options.id)).toEqual(['sentek-temperatura-100']);

    component.options = {
      accessibility: { enabled: false },
      chart: { animation: false, type: 'spline' },
      series: [
        {
          data: [
            [10, 1400],
            [11, 1410],
          ],
          id: 'sentek-salinidad-100',
          type: 'spline',
        },
      ],
    };
    component.ngOnChanges();
    fixture.detectChanges();
    tick(110);

    expect(component.chart?.series.map((series) => series.options.id)).toEqual(['sentek-salinidad-100']);
    expect(component.chart?.series[0].points.map((point) => point.y)).toEqual([1400, 1410]);
    fixture.destroy();
  }));
});
