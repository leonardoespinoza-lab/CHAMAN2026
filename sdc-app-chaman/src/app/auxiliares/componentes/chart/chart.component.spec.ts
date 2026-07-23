import { ChartComponent } from './chart.component';

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
});
