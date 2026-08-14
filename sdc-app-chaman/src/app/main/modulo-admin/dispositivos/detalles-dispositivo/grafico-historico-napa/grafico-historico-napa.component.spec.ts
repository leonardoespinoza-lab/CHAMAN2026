import { TestBed } from '@angular/core/testing';
import { GraficoHistoricoNapaComponent } from './grafico-historico-napa.component';

describe('GraficoHistoricoNapaComponent', () => {
  it('calcula la profundidad, la columna y una suba de napa con geometria 10/4/6', () => {
    const component = new GraficoHistoricoNapaComponent();
    component.configuracion = {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      salidaMin: 0,
      salidaMax: 10,
      unidadSalida: 'm',
      profundidadInstalacionM: 6,
      longitudCableM: 10,
      tramoCableExteriorM: 4,
    };
    component.rawFrames = [
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T10:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 3,
            unit: 'm',
            waterColumnM: 3,
            installationDepthM: 6,
            quality: 'valid',
          },
        ],
      },
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T11:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 2.72,
            unit: 'm',
            waterColumnM: 3.28,
            installationDepthM: 6,
            quality: 'valid',
          },
        ],
      },
    ];

    component.ngOnChanges({ rawFrames: {} as any });

    expect(component.napaActualM).toBe(2.72);
    expect(component.columnaAguaActualM).toBe(3.28);
    expect(component.profundidadSensorEfectivaM).toBe(6);
    expect(component.direccion).toBe('sube');
    expect(component.variacionCm).toBe(-28);
    expect(component.napaEscalaMaximaM).toBe(6);
    expect(component.posicionAguaPct).toBe(54.8);
    expect(component.chartOptions.chart.type).toBe('spline');
    expect(component.chartOptions.chart.margin).toEqual([0, 0, 0, 0]);
    expect(component.chartOptions.yAxis).toEqual(
      jasmine.objectContaining({
        endOnTick: false,
        max: 6,
        min: 0,
        reversed: true,
        startOnTick: false,
        tickPositions: [0, 1.5, 3, 4.5, 6],
      })
    );
    expect(component.chartOptions.xAxis.type).toBe('datetime');

    const series = component.chartOptions.series[0];
    const latestPoint = series.data[series.data.length - 1];
    expect(series).toEqual(jasmine.objectContaining({ id: 'napa-historica-integrada', type: 'spline' }));
    expect(latestPoint.y).toBe(2.72);
    expect(latestPoint.waterColumnM).toBe(3.28);

    const perfilHeightPct = 100 - component.perfilSueloTopPct - component.perfilSueloBottomPct;
    const latestPointTopPct =
      component.perfilSueloTopPct +
      ((latestPoint.y - component.chartOptions.yAxis.min) /
        (component.chartOptions.yAxis.max - component.chartOptions.yAxis.min)) *
        perfilHeightPct;
    expect(latestPointTopPct).toBeCloseTo(component.posicionAguaPct, 1);

    const tooltip = component.chartOptions.tooltip.formatter.call({ point: latestPoint });
    expect(tooltip).toContain('2.72 m bajo el terreno');
    expect(tooltip).toContain('Columna de agua');
    expect(tooltip).toContain('3.28 m');
  });

  it('integra una sola curva dentro del perfil y conserva pozo, sensor y linea decorativa', () => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoNapaComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoNapaComponent);
    const component = fixture.componentInstance;
    component.configuracion = {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      profundidadInstalacionM: 6,
    };
    component.rawFrames = [
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T11:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 2.72,
            unit: 'm',
            waterColumnM: 3.28,
            installationDepthM: 6,
            quality: 'valid',
          },
        ],
      },
    ];
    component.ngOnChanges({ rawFrames: {} as any, configuracion: {} as any });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const scene = root.querySelector<HTMLElement>('.ground-scene');
    expect(scene).not.toBeNull();
    expect(scene?.style.getPropertyValue('--napa-profile-top')).toBe('24%');
    expect(scene?.style.getPropertyValue('--napa-profile-bottom')).toBe('8%');
    expect(scene?.querySelectorAll('app-chart.napa-scene-chart').length).toBe(1);
    expect(root.querySelector('.napa-curve')).toBeNull();
    expect(root.textContent).not.toContain('Evolución temporal');
    expect(scene?.querySelector('.well-pipe')).not.toBeNull();
    expect(scene?.querySelector('.cable-line')).not.toBeNull();
    expect(scene?.querySelector('.sensor-head')).not.toBeNull();
    expect(scene?.querySelector('.water-zone')).not.toBeNull();

    fixture.destroy();
  });

  it('adapta la escala a una futura profundidad instalada sin recortar lecturas validas', () => {
    const component = new GraficoHistoricoNapaComponent();
    component.configuracion = {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      profundidadInstalacionM: 8,
    };
    component.rawFrames = [
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T11:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 7.25,
            unit: 'm',
            installationDepthM: 8,
            quality: 'valid',
          },
        ],
      },
    ];

    component.ngOnChanges({ rawFrames: {} as any, configuracion: {} as any });

    expect(component.napaEscalaMaximaM).toBe(8);
    expect(component.chartOptions.yAxis.max).toBe(8);
    expect(component.chartOptions.yAxis.tickPositions).toEqual([0, 2, 4, 6, 8]);
    expect(component.chartOptions.series[0].data[0].y).toBe(7.25);
  });

  it('no grafica corriente cruda ni lecturas de napa invalidas', () => {
    const component = new GraficoHistoricoNapaComponent();
    component.rawFrames = [
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T10:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          { serviceId: 'entrada-analogica', variable: 'corriente_analogica', value: 9.24, unit: 'mA' },
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 9,
            unit: 'm',
            installationDepthM: 6,
            quality: 'invalid',
          },
        ],
      },
    ];

    component.ngOnChanges({ rawFrames: {} as any });

    expect(component.chartOptions).toBeUndefined();
    expect(component.senalSinCalibrar).toBeTrue();
  });

  it('avisa si el controlador comunica pero las tramas recientes omiten 4-20 mA', () => {
    const component = new GraficoHistoricoNapaComponent();
    component.rawFrames = Array.from({ length: 6 }, (_, index) => ({
      devEUI: '24E124454E358347',
      timestamp: `2026-08-14T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
      decodeStatus: 'decoded' as const,
      profileChannels: [11],
      readings: [
        {
          depthCm: 100,
          quality: 'valid' as const,
          serviceId: 'perfil-suelo-sentek',
          unit: 'C',
          value: 14,
          variable: 'temperatura_suelo',
        },
      ],
    }));

    component.ngOnChanges({ rawFrames: {} as any });

    expect(component.alertaEntradaAnalogica).toContain('no incluyen la entrada analogica 4-20 mA');
    expect(component.napaActualM).toBeUndefined();
  });
});
