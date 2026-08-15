import { ILorawanRawFrame, ILorawanRawReading } from 'modelos/src';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { GraficoHistoricoSueloComponent } from './grafico-historico-suelo.component';

describe('GraficoHistoricoSueloComponent', () => {
  function frame(
    timestamp: string,
    readings: ILorawanRawReading[],
    fCnt = 1,
    profileChannels?: number[]
  ): ILorawanRawFrame {
    return {
      decodeStatus: 'decoded',
      devEUI: '24E124454E358347',
      fCnt,
      profileChannels,
      readings,
      timestamp,
    };
  }

  function humedad(depthCm: number, value: number): ILorawanRawReading {
    return {
      depthCm,
      rawUnit: '%',
      rawValue: value,
      serviceId: 'perfil-suelo-sentek',
      unit: '%',
      value,
      variable: 'humedad_suelo',
    };
  }

  function lectura(
    variable: 'humedad_suelo' | 'salinidad_suelo' | 'temperatura_suelo',
    depthCm: number,
    value: number
  ): ILorawanRawReading {
    const unit = variable === 'humedad_suelo' ? '%' : variable === 'salinidad_suelo' ? 'VIC' : 'C';
    return {
      depthCm,
      quality: variable === 'salinidad_suelo' ? 'unverified' : 'valid',
      rawUnit: unit,
      rawValue: value,
      serviceId: 'perfil-suelo-sentek',
      unit,
      value,
      variable,
    };
  }

  function perfilCompleto(depths: number[], offset = 0): ILorawanRawReading[] {
    return depths.flatMap((depth, index) => [
      lectura('humedad_suelo', depth, 20 + offset + index),
      lectura('salinidad_suelo', depth, 1400 + offset + index),
      lectura('temperatura_suelo', depth, 12 + offset / 10 + index / 10),
    ]);
  }

  function bloquePerfil(
    timestamp: string,
    depths: number[],
    fCnt: number,
    profileChannels: number[],
    offset = 0
  ): ILorawanRawFrame {
    return frame(timestamp, perfilCompleto(depths, offset), fCnt, profileChannels);
  }

  function cicloPerfil(timestamp: string, fCnt: number, offset = 0): ILorawanRawFrame[] {
    const start = new Date(timestamp).getTime();
    return [
      bloquePerfil(new Date(start).toISOString(), [10, 20, 30, 40], fCnt, [0, 1, 2, 3], offset),
      bloquePerfil(new Date(start + 15_000).toISOString(), [50, 60, 70, 80], fCnt + 1, [4, 5, 6, 7], offset),
      bloquePerfil(new Date(start + 30_000).toISOString(), [90, 100, 110, 120], fCnt + 2, [8, 9, 10, 11], offset),
    ];
  }

  function cicloArturo(
    timestamp: string,
    fCnt: number,
    kind: 'complete' | 'missing-b' | 'missing-shallow-h',
    finalTimestamp?: string
  ): ILorawanRawFrame[] {
    const start = new Date(timestamp).getTime();
    const allDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const frameA = frame(
      new Date(start).toISOString(),
      [
        ...allDepths
          .filter((depth) => kind !== 'missing-shallow-h' || depth >= 40)
          .map((depth, index) => lectura('humedad_suelo', depth, 20 + index)),
        ...[10, 20, 30].map((depth, index) => lectura('salinidad_suelo', depth, 1400 + index)),
      ],
      fCnt,
      [0, 1, 2, 3, 4]
    );
    const frameB = frame(
      new Date(start + 14_067).toISOString(),
      [
        ...[40, 50, 60, 70, 80, 90, 100, 110, 120].map((depth, index) =>
          lectura('salinidad_suelo', depth, 1403 + index)
        ),
        ...[10, 20, 30, 40, 50, 60, 70, 80, 90].map((depth, index) =>
          lectura('temperatura_suelo', depth, 12 + index / 10)
        ),
      ],
      fCnt + 1,
      [5, 6, 7, 8, 9, 10]
    );
    const frameC = frame(
      finalTimestamp || new Date(start + 29_949).toISOString(),
      [100, 110, 120].map((depth, index) => lectura('temperatura_suelo', depth, 12.9 + index / 10)),
      fCnt + 2,
      [11]
    );
    return kind === 'missing-b' ? [frameA, frameC] : [frameA, frameB, frameC];
  }

  function secuenciaArturoProductiva(): ILorawanRawFrame[] {
    const cycleStarts = [
      ...Array.from({ length: 9 }, (_, index) =>
        new Date(new Date('2026-08-14T20:49:15.933Z').getTime() + index * 20 * 60 * 1000).toISOString()
      ),
      '2026-08-14T23:49:16.060Z',
    ];
    const missingBIndexes = new Set([2, 6]);
    return [
      frame('2026-08-14T19:50:00.000Z', perfilCompleto([120], 99), 60, [11]),
      ...cycleStarts.flatMap((timestamp, index) => {
        const kind = missingBIndexes.has(index) ? 'missing-b' : index === 3 ? 'missing-shallow-h' : 'complete';
        return cicloArturo(
          timestamp,
          61 + index * 3,
          kind,
          index === 8 ? '2026-08-14T23:29:46.816Z' : index === 9 ? '2026-08-14T23:49:47.150Z' : undefined
        );
      }),
    ];
  }

  function prepare(rawFrames: ILorawanRawFrame[]): GraficoHistoricoSueloComponent {
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = rawFrames;
    component.ngOnChanges({ rawFrames: {} as any });
    return component;
  }

  it('construye 12 curvas y 12 filas de perfil desde cuatro tramas crudas de tres profundidades', () => {
    const component = prepare([
      frame('2026-08-14T10:00:00.000Z', [humedad(10, 21), humedad(20, 22), humedad(30, 23)], 1),
      frame('2026-08-14T10:00:15.000Z', [humedad(40, 24), humedad(50, 25), humedad(60, 26)], 2),
      frame('2026-08-14T10:00:30.000Z', [humedad(70, 27), humedad(80, 28), humedad(90, 29)], 3),
      frame('2026-08-14T10:00:45.000Z', [humedad(100, 30), humedad(110, 31), humedad(120, 32)], 4),
    ]);

    const expectedDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const soilSeries = component.chartOptions?.series || [];

    expect(soilSeries.map((series: any) => series.name)).toEqual(expectedDepths.map((depth) => `${depth} cm`));
    expect(soilSeries.every((series: any) => series.data.length === 1)).toBeTrue();
    expect(component.profileRows.map((row) => row.profundidad)).toEqual(expectedDepths);
    expect(component.profileRows).toHaveSize(12);
    expect(component.profileCoverageNotice).toBe('Perfil completo: 12/12 niveles recibidos entre 10 y 120 cm.');
    expect(component.resumen).toContain('12/12 profundidades detectadas');
    expect(component.resumen).toContain('12 datos crudos');
    expect(soilSeries.every((series: any) => series.type === 'spline')).toBeTrue();
    expect(new Set(soilSeries.map((series: any) => series.color)).size).toBe(12);
    expect(soilSeries.every((series: any) => series.showInLegend && series.visible)).toBeTrue();
    const soilAxes = component.chartOptions.yAxis.filter((axis: any) => axis.id === 'sentek-humedad-shared');
    expect(soilAxes).toHaveSize(1);
    expect(soilAxes[0]).toEqual(jasmine.objectContaining({ min: 0, max: 60 }));
    expect(soilAxes[0].title.text).toBe('Humedad volumétrica (% VWC)');
    expect(component.rainfallAvailabilityNotice).toBe('Sin lluvia histórica disponible');
  });

  it('mantiene visible la corriente 4-20 mA sin inventar una napa calibrada', () => {
    const component = prepare([
      frame('2026-08-14T10:00:00.000Z', [
        {
          channel: 1,
          serviceId: 'entrada-analogica',
          unit: 'mA',
          value: 9.24,
          variable: 'corriente_analogica',
        },
      ]),
    ]);

    expect(component.analogChartOptions).toBeDefined();
    expect(component.analogActual).toBe(9.24);
    expect(component.analogResumen).toContain('9.240 mA');
    expect(component.napaChartOptions).toBeUndefined();
    expect(component.napaActual).toBeUndefined();
    expect(component.napaResumen).toBe('');
  });

  it('muestra una alerta independiente de la curva cuando solo llega el canal 12', () => {
    const component = prepare([
      frame(
        '2026-08-14T10:00:00.000Z',
        [
          {
            depthCm: 100,
            quality: 'valid',
            serviceId: 'perfil-suelo-sentek',
            unit: 'C',
            value: 14.23,
            variable: 'temperatura_suelo',
          },
        ],
        27,
        [11]
      ),
    ]);

    expect(component.controllerCoverageComplete).toBeFalse();
    expect(component.controllerCoverageNotice).toContain('solo el canal SDI-12 12');
    expect(component.profileCoverageNotice).toContain('1/12 niveles');
  });

  it('separa lecturas invalidas de VIC pendiente de calibracion', () => {
    const rawFrame = frame('2026-08-14T10:00:00.000Z', [
      { ...humedad(10, 101), quality: 'invalid' },
      {
        depthCm: 10,
        quality: 'unverified',
        serviceId: 'perfil-suelo-sentek',
        unit: 'VIC',
        value: 1487.012,
        variable: 'salinidad_suelo',
      },
    ]);
    const component = prepare([rawFrame]);

    expect(component.rawInvalidReadingCount(rawFrame)).toBe(1);
    expect(component.rawUnverifiedReadingCount(rawFrame)).toBe(1);
    expect(component.chartOptions?.series || []).toHaveSize(1);
  });

  it('muestra la napa calibrada junto con la evidencia 4-20 mA cuando la trama contiene ambas lecturas', () => {
    const component = prepare([
      frame('2026-08-14T10:00:00.000Z', [
        {
          channel: 1,
          serviceId: 'nivel-napa',
          unit: 'mA',
          value: 9.24,
          variable: 'corriente_analogica',
        },
        {
          channel: 1,
          conversionModel: 'lineal-4-20ma-v1',
          installationDepthM: 6,
          reference: 'nivel_terreno',
          serviceId: 'nivel-napa',
          unit: 'm',
          value: 2.72,
          variable: 'nivel_napa',
          waterColumnM: 3.28,
        },
      ]),
    ]);

    expect(component.analogChartOptions).toBeDefined();
    expect(component.analogActual).toBe(9.24);
    expect(component.napaChartOptions).toBeDefined();
    expect(component.napaActual).toBe(2.72);
    expect(component.napaResumen).toContain('2.72 m bajo el terreno');
    expect(component.napaChartOptions.series[0].data).toEqual([jasmine.objectContaining({ y: 2.72, unit: 'm' })]);
  });

  it('superpone una sola capa de lluvia detras del perfil de humedad', () => {
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = [frame('2026-08-14T10:00:00.000Z', [humedad(10, 28)], 1)];
    component.lluvias = [
      { fecha: '2026-08-14T12:00:00.000Z', milimetros: 12.4 },
      { fecha: '2026-08-14T14:00:00.000Z', milimetros: 0 },
    ];

    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any });

    const rainSeries = (component.chartOptions?.series || []).filter((series: any) => series.custom?.isRain);
    const soilSeries = (component.chartOptions?.series || []).filter((series: any) => series.custom?.isSoil);
    expect(rainSeries).toHaveSize(1);
    expect(rainSeries[0]).toEqual(
      jasmine.objectContaining({
        color: 'rgba(47, 159, 232, 0.22)',
        name: 'Lluvia (mm)',
        showInLegend: false,
        type: 'column',
        zIndex: 1,
      })
    );
    expect(rainSeries[0].data.map((point: any) => point.y)).toEqual([12.4, 0]);
    expect(soilSeries[0]).toEqual(jasmine.objectContaining({ name: '10 cm', showInLegend: true, zIndex: 3 }));
    expect(component.chartOptions.yAxis[0].labels.enabled).toBeTrue();
    expect(component.chartOptions.yAxis[1].title.text).toBe('mm');
    expect(component.chartOptions.yAxis[1].labels.enabled).toBeTrue();
    expect(component.chartOptions.yAxis[1].labels.format).toBe('{value:.1f}');
  });

  it('mantiene visible la lluvia aunque el total observado sea cero y reserva la leyenda para niveles', () => {
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = [frame('2026-08-14T10:00:00.000Z', [humedad(10, 28)], 1)];
    component.lluvias = [
      { fecha: '2026-08-14T10:00:00.000Z', milimetros: 0 },
      { fecha: '2026-08-14T11:00:00.000Z', milimetros: 0 },
    ];

    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any });

    const rainSeries = component.chartOptions.series.filter((series: any) => series.custom?.isRain);
    expect(rainSeries).toHaveSize(1);
    expect(rainSeries[0].data.map((point: any) => point.y)).toEqual([0, 0]);
    expect(rainSeries[0].showInLegend).toBeFalse();
    expect(component.chartOptions.legend.enabled).toBeTrue();
    expect(component.rainfallAvailabilityNotice).toBe('');
  });

  it('filtra solo la vista por profundidad y conserva datos, dominio y seleccion al cambiar metrica', () => {
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = [
      ...cicloPerfil('2026-08-14T20:00:00.000Z', 1),
      ...cicloPerfil('2026-08-14T20:20:00.000Z', 4, 2),
    ];
    component.lluvias = [{ fecha: '2026-08-14T20:10:00.000Z', milimetros: 6 }];
    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any });

    const csvRowsBefore = (component as any).getCsvRows().length;
    [20, 30, 40, 60, 70, 80, 90, 100, 110].forEach((depth) => component.onDepthVisibilityChange(depth, false));

    const visibleDepths = [10, 50, 120];
    const soilSeries = component.chartOptions.series.filter((series: any) => series.custom?.isSoil);
    const rainSeries = component.chartOptions.series.filter((series: any) => series.custom?.isRain);
    const axes = component.chartOptions.yAxis.filter((axis: any) => axis.id === 'sentek-humedad-shared');
    expect(component.selectedDepthsCm).toEqual(visibleDepths);
    expect(component.depthSelectionLabel).toBe('3 niveles');
    expect(soilSeries.filter((series: any) => series.visible).map((series: any) => series.custom.depthCm)).toEqual(
      visibleDepths
    );
    expect(soilSeries).toHaveSize(12);
    expect(axes).toHaveSize(1);
    expect(rainSeries).toHaveSize(1);
    expect(component.chartOptions.chart.height).toBe(460);
    expect((component as any).getCsvRows().length).toBe(csvRowsBefore);
    expect(component.resumen).toContain('12/12 profundidades detectadas');

    component.onMetricChange('temperatura');
    expect(component.selectedDepthsCm).toEqual(visibleDepths);
    expect(
      component.chartOptions.series.filter((series: any) => series.custom?.isSoil && series.visible)
    ).toHaveSize(3);

    component.selectedDepthsCm = [10];
    component.onDepthVisibilityChange(10, false);
    expect(component.selectedDepthsCm).toEqual([10]);
    component.showAllDepths();
    expect(component.selectedDepthsCm).toEqual(component.depthOptionsCm);
    expect(component.chartOptions.chart.height).toBe(460);
  });

  it('expone un selector accesible con los doce niveles y evita dejar la vista vacia', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    fixture.componentRef.setInput('rawFrames', cicloPerfil('2026-08-14T20:00:00.000Z', 1));
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(80);

    const host = fixture.nativeElement as HTMLElement;
    const selector = host.querySelector<HTMLDetailsElement>('.soil-depth-selector')!;
    const summary = selector.querySelector<HTMLElement>('summary')!;
    const fieldset = selector.querySelector<HTMLFieldSetElement>('fieldset')!;
    const inputs = [...selector.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(summary.getAttribute('aria-label')).toBe('Seleccionar profundidades visibles');
    expect(fieldset.querySelector('legend')?.textContent).toContain('Profundidades visibles');
    expect(inputs).toHaveSize(12);
    expect(inputs.every((input) => input.checked)).toBeTrue();
    expect(inputs.map((input) => input.closest('label')?.textContent?.trim())).toEqual(
      fixture.componentInstance.depthOptionsCm.map((depth) => `${depth} cm`)
    );

    inputs.slice(1).forEach((input) => {
      input.checked = false;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    });
    tick();
    const remaining = selector.querySelector<HTMLInputElement>('input[type="checkbox"]:checked')!;
    expect(remaining.closest('label')?.textContent).toContain('10 cm');
    expect(remaining.disabled).toBeTrue();
    fixture.destroy();
  }));

  it('usa amanecer y atardecer reales en Buenos Aires en una franja inferior sin pintar fechas desconocidas', () => {
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = [
      ...cicloPerfil('2026-08-14T08:00:00.000Z', 1),
      ...cicloPerfil('2026-08-15T22:00:00.000Z', 4, 2),
    ];
    component.lluvias = [{ fecha: '2026-08-14', milimetros: 5 }];
    component.daylight = [
      { amanecer: '07:30', atardecer: '18:30', fecha: '2026-08-14' },
      {
        amanecer: '2026-08-15T10:29:00.000Z',
        atardecer: '2026-08-15T21:31:00.000Z',
        fecha: '2026-08-15',
      },
    ];
    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any, daylight: {} as any });

    const daySeries = component.chartOptions.series.find((series: any) => series.custom?.solarState === 'day');
    const nightSeries = component.chartOptions.series.find((series: any) => series.custom?.solarState === 'night');
    expect(component.chartOptions.time.timezone).toBe('America/Argentina/Buenos_Aires');
    expect(component.hasDaylightBands).toBeTrue();
    expect(component.chartOptions.xAxis.plotBands).toEqual([]);
    expect(daySeries).toEqual(
      jasmine.objectContaining({
        color: '#facc15',
        id: 'sentek-solar-day',
        lineWidth: 8,
        showInLegend: false,
        zIndex: 5,
      })
    );
    expect(nightSeries).toEqual(
      jasmine.objectContaining({ color: '#111827', id: 'sentek-solar-night', lineWidth: 8, zIndex: 5 })
    );
    expect(daySeries.data).toContain(jasmine.objectContaining({ x: new Date('2026-08-14T10:30:00.000Z').getTime() }));
    expect(daySeries.data).toContain(jasmine.objectContaining({ x: new Date('2026-08-14T21:30:00.000Z').getTime() }));
    expect(daySeries.data).toContain(jasmine.objectContaining({ x: new Date('2026-08-15T10:29:00.000Z').getTime() }));
    expect(daySeries.data).toContain(jasmine.objectContaining({ x: new Date('2026-08-15T21:31:00.000Z').getTime() }));
    expect(daySeries.data.filter((point: any) => point.y !== null).every((point: any) => point.x >= component.chartOptions.xAxis.min && point.x <= component.chartOptions.xAxis.max)).toBeTrue();
    expect(nightSeries.data.filter((point: any) => point.y !== null).every((point: any) => point.x >= component.chartOptions.xAxis.min && point.x <= component.chartOptions.xAxis.max)).toBeTrue();
    expect(daySeries.data.every((point: any, index: number, data: any[]) => index === 0 || point.x >= data[index - 1].x)).toBeTrue();
    expect(nightSeries.data.every((point: any, index: number, data: any[]) => index === 0 || point.x >= data[index - 1].x)).toBeTrue();
    expect(component.chartOptions.series.find((series: any) => series.custom?.isRain).zIndex).toBe(1);
    expect(
      component.chartOptions.series
        .filter((series: any) => series.custom?.isSoil)
        .every((series: any) => series.zIndex === 3)
    ).toBeTrue();

    component.timeZone = 'Zona/Invalida';
    component.ngOnChanges({ timeZone: {} as any });
    expect(component.chartOptions.time.timezone).toBe('America/Argentina/Buenos_Aires');

    component.daylight = [];
    component.ngOnChanges({ daylight: {} as any });
    expect(component.chartOptions.xAxis.plotBands).toEqual([]);
    expect(component.chartOptions.series.some((series: any) => series.custom?.isTemporalContext)).toBeFalse();
    expect(component.hasDaylightBands).toBeFalse();
  });

  it('renderiza las franjas de dia y noche y su clave minima en el SVG real', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    fixture.componentRef.setInput('rawFrames', [
      ...cicloPerfil('2026-08-14T08:00:00.000Z', 1),
      ...cicloPerfil('2026-08-14T22:00:00.000Z', 4, 2),
    ]);
    fixture.componentRef.setInput('daylight', [{ amanecer: '07:30', atardecer: '18:30', fecha: '2026-08-14' }]);
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(120);

    const host = fixture.nativeElement as HTMLElement;
    const chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
    const day = chart.get('sentek-solar-day') as any;
    const night = chart.get('sentek-solar-night') as any;
    const key = host.querySelector<HTMLElement>('.soil-daylight-key');
    expect(day?.graph).toBeDefined();
    expect(night?.graph).toBeDefined();
    expect(day?.graph?.element?.getAttribute('d')).toContain('M');
    expect(night?.graph?.element?.getAttribute('d')).toContain('M');
    expect(day.graph.element.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(night.graph.element.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(day.yAxis.top).toBeGreaterThan(chart.plotTop + chart.plotHeight * 0.85);
    expect(day.yAxis.height).toBeLessThanOrEqual(chart.plotHeight * 0.05);
    expect(night.yAxis.top).toBe(day.yAxis.top);
    expect(key?.textContent).toContain('Día');
    expect(key?.textContent).toContain('Noche');
    fixture.destroy();
  }));

  it('pinta bandas canonicas CC/PMP, calcula recarga inicial al 50% PAW y las limita a humedad', () => {
    const component = prepare(cicloPerfil('2026-08-14T20:00:00.000Z', 1));
    component.agronomicThresholds = {
      capacidadCampoPct: 33.46,
      confianza: 'low',
      depthFromCm: 0,
      depthToCm: 100,
      fuente: 'soilgrids',
      origen: 'estimated',
      puntoMarchitezPct: 18.12,
    };
    component.ngOnChanges({ agronomicThresholds: {} as any });

    const humidityAxis = component.chartOptions.yAxis.find((axis: any) => axis.id === 'sentek-humedad-shared');
    expect(humidityAxis).toEqual(jasmine.objectContaining({ min: 0, max: 60 }));
    expect(humidityAxis.title.text).toBe('Humedad volumétrica (% VWC)');
    expect(humidityAxis.plotBands).toEqual([
      jasmine.objectContaining({ from: 0, id: 'sentek-zone-deficit', to: 25.79 }),
      jasmine.objectContaining({ from: 25.79, id: 'sentek-zone-target', to: 33.46 }),
      jasmine.objectContaining({ from: 33.46, id: 'sentek-zone-excess', to: 60 }),
    ]);
    expect(humidityAxis.plotLines.map((line: any) => [line.id, line.value])).toEqual([
      ['sentek-threshold-wilting', 18.12],
      ['sentek-threshold-refill', 25.79],
      ['sentek-threshold-field-capacity', 33.46],
    ]);
    expect(component.agronomicReference).toEqual(
      jasmine.objectContaining({
        capacidadCampoPct: 33.46,
        confianza: 'low',
        depthFromCm: 0,
        depthToCm: 100,
        recargaPct: 25.79,
      })
    );

    component.onMetricChange('temperatura');
    expect(component.chartOptions.yAxis.find((axis: any) => axis.id === 'sentek-temperatura-shared').plotBands).toEqual([]);
    component.onMetricChange('salinidad');
    expect(component.chartOptions.yAxis.find((axis: any) => axis.id === 'sentek-salinidad-shared').plotBands).toEqual([]);
  });

  it('oculta las bandas ante referencia invalida o desactualizada y lo informa en el DOM', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    fixture.componentRef.setInput('rawFrames', cicloPerfil('2026-08-14T20:00:00.000Z', 1));
    fixture.componentRef.setInput('agronomicThresholds', {
      capacidadCampoPct: 33.46,
      puntoMarchitezPct: 18.12,
      stale: true,
    });
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(100);

    const axis = fixture.componentInstance.chartOptions.yAxis.find((item: any) => item.id === 'sentek-humedad-shared');
    const host = fixture.nativeElement as HTMLElement;
    const note = host.querySelector<HTMLElement>('.soil-agronomic-unavailable');
    expect(axis.plotBands).toEqual([]);
    expect(axis.plotLines).toEqual([]);
    expect(note?.textContent).toContain('Referencia agronómica desactualizada');
    expect(host.textContent?.toLowerCase()).not.toContain('saturación');
    fixture.destroy();
  }));

  it('renderiza bandas agronomicas SVG con superficie real y procedencia visible', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    fixture.componentRef.setInput('rawFrames', cicloPerfil('2026-08-14T20:00:00.000Z', 1));
    fixture.componentRef.setInput('agronomicThresholds', {
      capacidadCampoPct: 33.46,
      confianza: 'low',
      depthFromCm: 0,
      depthToCm: 100,
      fuente: 'soilgrids',
      origen: 'estimated',
      puntoMarchitezPct: 18.12,
    });
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(120);

    const host = fixture.nativeElement as HTMLElement;
    ['.sentek-zone-deficit', '.sentek-zone-target', '.sentek-zone-excess'].forEach((selector) => {
      const rect = host.querySelector<SVGElement>(selector)!.getBoundingClientRect();
      expect(rect.width).withContext(selector).toBeGreaterThan(0);
      expect(rect.height).withContext(selector).toBeGreaterThan(0);
    });
    const key = host.querySelector<HTMLElement>('.soil-agronomic-key')!;
    const keyText = (key.textContent || '').replace(/\s+/g, ' ').trim();
    expect(keyText).toContain('PMP 18.12%');
    expect(keyText).toContain('Recarga inicial (50% PAW) 25.79%');
    expect(keyText).toContain('CC 33.46%');
    expect(keyText).toContain('SoilGrids');
    expect(keyText).toContain('referencia de perfil estimado 0–100 cm');
    expect(keyText).toContain('confianza baja');
    expect(keyText.toLowerCase()).not.toContain('saturación');
    fixture.destroy();
  }));

  it('sincroniza un click real de leyenda con el selector sin eliminar la serie ni permitir vista vacia', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    fixture.componentRef.setInput('rawFrames', cicloPerfil('2026-08-14T20:00:00.000Z', 1));
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(120);

    let chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
    let series = chart.get('sentek-humedad-20') as any;
    series.legendItem.group.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    tick(100);

    expect(fixture.componentInstance.selectedDepthsCm).not.toContain(20);
    const host = fixture.nativeElement as HTMLElement;
    const checkbox20 = [...host.querySelectorAll<HTMLInputElement>('.soil-depth-options input')].find(
      (input) => input.closest('label')?.textContent?.includes('20 cm')
    )!;
    expect(checkbox20.checked).toBeFalse();
    chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
    series = chart.get('sentek-humedad-20') as any;
    expect(series).toBeDefined();
    expect(series.visible).toBeFalse();

    series.legendItem.group.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    tick(100);
    expect(fixture.componentInstance.selectedDepthsCm).toContain(20);

    fixture.componentInstance.depthOptionsCm
      .filter((depth) => depth !== 20)
      .forEach((depth) => fixture.componentInstance.onDepthVisibilityChange(depth, false));
    fixture.detectChanges();
    tick(100);
    chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
    series = chart.get('sentek-humedad-20') as any;
    series.legendItem.group.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    tick(80);
    expect(fixture.componentInstance.selectedDepthsCm).toEqual([20]);
    expect((chart.get('sentek-humedad-20') as any).visible).toBeTrue();
    const onlyCheckbox = [...host.querySelectorAll<HTMLInputElement>('.soil-depth-options input')].find(
      (input) => input.closest('label')?.textContent?.includes('20 cm')
    )!;
    expect(onlyCheckbox.checked).toBeTrue();
    expect(onlyCheckbox.disabled).toBeTrue();
    fixture.destroy();
  }));

  it('muestra en el DOM cuando no existe historico de lluvia y no lo confunde con cero mm', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    fixture.componentRef.setInput('rawFrames', [frame('2026-08-14T10:00:00.000Z', [humedad(10, 28)], 1)]);
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(80);

    const host = fixture.nativeElement as HTMLElement;
    const notice = host.querySelector<HTMLElement>('.rainfall-availability-note');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('Sin lluvia histórica disponible');
    expect(host.textContent).not.toContain('0 mm');
    fixture.destroy();
  }));

  it('distingue una fuente sin lluvia en el periodo de una fuente historica ausente', () => {
    const component = new GraficoHistoricoSueloComponent();
    component.fechaDesde = '2026-08-14T09:00:00.000Z';
    component.rawFrames = [frame('2026-08-14T10:00:00.000Z', [humedad(10, 28)], 1)];
    component.lluvias = [{ fecha: '2026-08-10', milimetros: 4 }];

    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any, fechaDesde: {} as any });

    expect(component.chartOptions.series.some((series: any) => series.custom?.isRain)).toBeFalse();
    expect(component.rainfallAvailabilityNotice).toBe('Sin lluvia registrada en el período');
  });

  it('usa solo el dominio posterior al primer barrido coherente y recorta la lluvia al mismo rango', () => {
    const component = new GraficoHistoricoSueloComponent();
    const recentStart = '2026-08-14T20:00:00.000Z';
    const recentEnd = '2026-08-14T20:20:30.000Z';
    const deepDepths = [100, 110, 120];
    const allDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90, ...deepDepths];

    component.fechaDesde = '2026-07-15T00:00:00.000Z';
    component.rawFrames = [
      frame('2026-07-15T10:00:00.000Z', perfilCompleto(deepDepths, 10), 1, [3, 7, 11]),
      frame(
        recentStart,
        allDepths.map((depth, index) => lectura('humedad_suelo', depth, 20 + index)),
        2,
        [0, 1, 2, 3]
      ),
      frame(
        '2026-08-14T20:00:15.000Z',
        allDepths.map((depth, index) => lectura('salinidad_suelo', depth, 1400 + index)),
        3,
        [4, 5, 6, 7]
      ),
      frame(
        '2026-08-14T20:00:30.000Z',
        allDepths.map((depth, index) => lectura('temperatura_suelo', depth, 13 + index / 10)),
        4,
        [8, 9, 10, 11]
      ),
      frame(
        '2026-08-14T20:20:00.000Z',
        allDepths.map((depth, index) => lectura('humedad_suelo', depth, 21 + index)),
        5,
        [0, 1, 2, 3]
      ),
      frame(
        '2026-08-14T20:20:15.000Z',
        allDepths.map((depth, index) => lectura('salinidad_suelo', depth, 1410 + index)),
        6,
        [4, 5, 6, 7]
      ),
      frame(
        recentEnd,
        allDepths.map((depth, index) => lectura('temperatura_suelo', depth, 14 + index / 10)),
        7,
        [8, 9, 10, 11]
      ),
    ];
    component.lluvias = [
      { fecha: '2026-07-16', milimetros: 8 },
      { fecha: '2026-08-14T20:10:00.000Z', milimetros: 14 },
    ];

    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any, fechaDesde: {} as any });

    const expectedMin = new Date(recentStart).getTime() - 60 * 1000;
    const expectedMax = new Date(recentEnd).getTime() + 60 * 1000;
    const rainSeries = (component.chartOptions?.series || []).filter((series: any) => series.custom?.isRain);
    const soilSeries = (component.chartOptions?.series || []).filter((series: any) => series.custom?.isSoil);

    expect(soilSeries).toHaveSize(12);
    expect(component.chartOptions.xAxis.min).toBe(expectedMin);
    expect(component.chartOptions.xAxis.max).toBe(expectedMax);
    expect(component.chartOptions.xAxis.startOnTick).toBeFalse();
    expect(rainSeries).toHaveSize(1);
    expect(rainSeries.every((series: any) => series.xAxis === undefined)).toBeTrue();
    expect(rainSeries.every((rain: any) => rain.data.length === 1 && rain.data[0].y === 14)).toBeTrue();
    expect(
      soilSeries.every((soil: any) => soil.data.every((point: any) => point.x >= new Date(recentStart).getTime()))
    ).toBeTrue();
    expect(
      soilSeries
        .filter((soil: any) => [100, 110, 120].includes(soil.custom.depthCm))
        .every((soil: any) => soil.data.length === 2)
    ).toBeTrue();

    component.onMetricChange('temperatura');
    expect([component.chartOptions.xAxis.min, component.chartOptions.xAxis.max]).toEqual([expectedMin, expectedMax]);
    component.onMetricChange('salinidad');
    expect([component.chartOptions.xAxis.min, component.chartOptions.xAxis.max]).toEqual([expectedMin, expectedMax]);
  });

  it('en un perfil parcial reciente oculta el dato antiguo y marca los niveles faltantes', () => {
    const component = prepare([
      frame('2026-07-15T10:00:00.000Z', [humedad(100, 30)], 1),
      frame('2026-08-14T20:00:00.000Z', [humedad(100, 31)], 2),
    ]);

    expect(component.chartOptions.xAxis.min).toBe(new Date('2026-08-14T19:59:00.000Z').getTime());
    expect(component.profileRows.map((row) => row.profundidad)).toEqual([100]);
    expect(component.profileRecentMissingDepths).toHaveSize(11);
    expect(component.profileFreshnessNotice).toBe('11 niveles sin datos en el ultimo barrido.');
    const soilSeries = (component.chartOptions.series || []).filter((series: any) => series.custom?.isSoil);
    expect(soilSeries[0].data).toEqual([
      jasmine.objectContaining({ x: new Date('2026-08-14T20:00:00.000Z').getTime() }),
    ]);
  });

  it('muestra solo los nueve niveles recientes y descarta la cola antigua profunda', () => {
    const oldDepths = [100, 110, 120];
    const recentDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const component = prepare([
      frame(
        '2026-07-15T10:00:00.000Z',
        oldDepths.map((depth, index) => humedad(depth, 30 + index)),
        1
      ),
      frame(
        '2026-08-14T20:00:00.000Z',
        recentDepths.map((depth, index) => humedad(depth, 20 + index)),
        2
      ),
    ]);

    expect(component.chartOptions.series).toHaveSize(12);
    expect(component.chartOptions.xAxis.min).toBe(new Date('2026-08-14T19:59:00.000Z').getTime());
    expect(component.profileRows.map((row) => row.profundidad)).toEqual(recentDepths);
    expect(component.profileCoverageNotice).toContain('9/12 niveles');
    expect(component.profileRecentMissingDepths).toEqual(oldDepths);
    expect(component.profileFreshnessNotice).toBe('Sin datos recientes: 100, 110 y 120 cm.');
    const deepSeries = component.chartOptions.series.filter((series: any) =>
      oldDepths.includes(series.custom?.depthCm)
    );
    expect(deepSeries.every((series: any) => series.data.length === 0)).toBeTrue();
  });

  it('prioriza el ultimo barrido parcial frente a un completo desactualizado', () => {
    const allDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const component = prepare([
      frame(
        '2026-07-15T10:00:00.000Z',
        allDepths.map((depth, index) => humedad(depth, 20 + index)),
        1
      ),
      frame(
        '2026-08-14T20:00:00.000Z',
        allDepths.slice(0, 6).map((depth, index) => humedad(depth, 30 + index)),
        2
      ),
    ]);

    expect(component.chartOptions.xAxis.min).toBe(new Date('2026-08-14T19:59:00.000Z').getTime());
    expect(component.profileRows.map((row) => row.profundidad)).toEqual(allDepths.slice(0, 6));
    expect(component.profileRecentMissingDepths).toEqual(allDepths.slice(6));
    expect(component.profileFreshnessNotice).toBe('6 niveles sin datos en el ultimo barrido.');
  });

  it('no fabrica un barrido completo encadenando bloques durante quince minutos', () => {
    const allDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const component = prepare(
      [0, 5, 10, 15].map((minutes, block) =>
        frame(
          `2026-08-14T10:${String(minutes).padStart(2, '0')}:00.000Z`,
          allDepths.slice(block * 3, block * 3 + 3).map((depth, index) => humedad(depth, 20 + block * 3 + index)),
          block + 1
        )
      )
    );

    expect(component.profileRows.map((row) => row.profundidad)).toEqual([70, 80, 90, 100, 110, 120]);
    expect(component.profileRecentMissingDepths).toEqual([10, 20, 30, 40, 50, 60]);
    expect(component.profileCoverageNotice).toContain('6/12 niveles');
  });

  it('separa los ciclos Gil 189-191 y 192-194 aunque lleguen con menos de seis minutos de diferencia', () => {
    const shallow = [10, 20, 30, 40];
    const middle = [50, 60, 70, 80];
    const deep = [90, 100, 110, 120];
    const component = prepare([
      bloquePerfil('2026-08-14T20:00:00.000Z', shallow, 189, [0, 1, 2, 3]),
      bloquePerfil('2026-08-14T20:00:15.000Z', middle, 190, [4, 5, 6, 7]),
      bloquePerfil('2026-08-14T20:00:30.000Z', deep, 191, [8, 9, 10, 11]),
      bloquePerfil('2026-08-14T20:04:00.000Z', shallow, 192, [0, 1, 2, 3], 10),
      bloquePerfil('2026-08-14T20:04:15.000Z', middle, 193, [4, 5, 6, 7], 10),
      bloquePerfil('2026-08-14T20:04:30.000Z', deep, 194, [8, 9, 10, 11], 10),
    ]);

    const soilSeries = component.chartOptions.series.filter((series: any) => series.custom?.isSoil);
    expect(soilSeries).toHaveSize(12);
    expect(soilSeries.every((series: any) => series.data.length === 2)).toBeTrue();
    expect(component.profileRows).toHaveSize(12);
    expect(component.profileFreshnessNotice).toBe('');
    expect(component.chartOptions.xAxis.min).toBe(new Date('2026-08-14T19:59:00.000Z').getTime());
    expect(component.chartOptions.xAxis.max).toBe(new Date('2026-08-14T20:05:30.000Z').getTime());
  });

  it('mantiene un unico dominio Arturo 61-72 y no deja temperatura al seleccionar salinidad', () => {
    const shallow = [10, 20, 30, 40];
    const middle = [50, 60, 70, 80];
    const deep = [90, 100, 110, 120];
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = [
      frame(
        '2026-07-15T10:00:00.000Z',
        [100, 110, 120].map((depth, index) => lectura('temperatura_suelo', depth, 11 + index)),
        55,
        [9, 10, 11]
      ),
      bloquePerfil('2026-08-14T20:49:15.933Z', shallow, 61, [0, 1, 2, 3]),
      bloquePerfil('2026-08-14T20:49:30.000Z', middle, 62, [4, 5, 6, 7]),
      bloquePerfil('2026-08-14T20:49:45.882Z', deep, 63, [8, 9, 10, 11]),
      bloquePerfil('2026-08-14T21:09:15.933Z', shallow, 64, [0, 1, 2, 3], 10),
      bloquePerfil('2026-08-14T21:09:30.000Z', middle, 65, [4, 5, 6, 7], 10),
      bloquePerfil('2026-08-14T21:09:45.882Z', deep, 66, [8, 9, 10, 11], 10),
      bloquePerfil('2026-08-14T21:39:15.933Z', shallow, 67, [0, 1, 2, 3], 20),
      bloquePerfil('2026-08-14T21:39:45.882Z', deep, 69, [8, 9, 10, 11], 20),
      bloquePerfil('2026-08-14T21:49:15.933Z', shallow, 70, [0, 1, 2, 3], 30),
      frame(
        '2026-08-14T21:49:30.000Z',
        middle.flatMap((depth, index) => [
          lectura('humedad_suelo', depth, 50 + index),
          lectura('salinidad_suelo', depth, 1430 + index),
        ]),
        71,
        [4, 5, 6, 7]
      ),
      bloquePerfil('2026-08-14T21:49:45.882Z', deep, 72, [8, 9, 10, 11], 30),
    ];
    component.ngOnChanges({ rawFrames: {} as any });

    const expectedDomain = [
      new Date('2026-08-14T20:48:15.933Z').getTime(),
      new Date('2026-08-14T21:50:45.882Z').getTime(),
    ];
    const domain = () => [component.chartOptions.xAxis.min, component.chartOptions.xAxis.max];

    expect(domain()).toEqual(expectedDomain);
    component.onMetricChange('temperatura');
    expect(domain()).toEqual(expectedDomain);
    component.onMetricChange('salinidad');
    expect(domain()).toEqual(expectedDomain);

    const salinitySeries = component.chartOptions.series.filter((series: any) => series.custom?.isSoil);
    expect(salinitySeries).toHaveSize(12);
    expect(salinitySeries.every((series: any) => series.id.startsWith('sentek-salinidad-'))).toBeTrue();
    expect(
      salinitySeries.every((series: any) =>
        series.data.filter((point: any) => point.y !== null).every((point: any) => point.y >= 1400)
      )
    ).toBeTrue();
    expect(
      salinitySeries.every((series: any) =>
        series.data.every((point: any) => point.x >= new Date('2026-08-14T20:49:15.933Z').getTime())
      )
    ).toBeTrue();
  });

  it('conserva por identidad las lecturas validas de los diez grupos Arturo sin revivir el prefijo ch11', () => {
    const component = new GraficoHistoricoSueloComponent();
    const prefixTimestamp = '2026-08-14T19:50:00.000Z';
    component.fechaDesde = '2026-08-14T19:00:00.000Z';
    component.rawFrames = secuenciaArturoProductiva();
    component.lluvias = [
      { fecha: '2026-08-14T19:20:00.000Z', milimetros: 2 },
      { fecha: '2026-08-14T21:20:00.000Z', milimetros: 7 },
      { fecha: '2026-08-15T05:00:00.000Z', milimetros: 9 },
    ];
    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any, fechaDesde: {} as any });

    const expectedDomain = [
      new Date('2026-08-14T20:48:15.933Z').getTime(),
      new Date('2026-08-14T23:50:47.150Z').getTime(),
    ];
    const prefixMs = new Date(prefixTimestamp).getTime();
    const assertMetric = (
      metric: 'humedad' | 'salinidad' | 'temperatura',
      expectedByDepth: (depth: number) => { gaps: number; values: number }
    ) => {
      component.onMetricChange(metric);
      const soilSeries = component.chartOptions.series.filter((series: any) => series.custom?.isSoil);
      expect([component.chartOptions.xAxis.min, component.chartOptions.xAxis.max]).toEqual(expectedDomain);
      expect(soilSeries).toHaveSize(12);
      expect(
        soilSeries.every((series: any) => {
          const expected = expectedByDepth(series.custom.depthCm);
          return (
            series.data.filter((point: any) => point.y !== null).length === expected.values &&
            series.data.filter((point: any) => point.y === null).length === expected.gaps &&
            series.data
              .filter((point: any) => point.y === null)
              .every((point: any) => point.marker?.enabled === false && point.custom?.isGap === true)
          );
        })
      ).toBeTrue();
      expect(soilSeries.every((series: any) => series.data.every((point: any) => point.x !== prefixMs))).toBeTrue();
      return soilSeries;
    };

    const humiditySeries = assertMetric('humedad', (depth) =>
      depth <= 30 ? { gaps: 0, values: 9 } : { gaps: 0, values: 10 }
    );
    const repeatedValues = humiditySeries
      .find((series: any) => series.custom.depthCm === 10)
      .data.filter((point: any) => point.y !== null);
    expect(new Set(repeatedValues.map((point: any) => point.y)).size).toBe(1);
    expect(new Set(repeatedValues.map((point: any) => point.fCnt)).size).toBe(9);
    expect(component.resumen).toContain('117 datos crudos');
    const rainSeries = component.chartOptions.series.filter((series: any) => series.custom?.isRain);
    expect(rainSeries).toHaveSize(1);
    expect(rainSeries[0].data.map((point: any) => point.y)).toEqual([2, 7, 9]);

    const tooltipPoint = humiditySeries[0].data.find((point: any) => point.y !== null);
    const tooltipHtml = component.chartOptions.tooltip.formatter.call({
      point: {
        ...tooltipPoint,
        color: humiditySeries[0].color,
        series: { name: humiditySeries[0].name, userOptions: humiditySeries[0] },
      },
    });
    expect(tooltipHtml).toContain('10 cm');
    expect(tooltipHtml).not.toContain('crudo');
    const csvRows = (component as any).getCsvRows() as unknown[][];
    expect(csvRows.some((row) => row.includes(null))).toBeFalse();

    const salinitySeries = assertMetric('salinidad', (depth) =>
      depth <= 30 ? { gaps: 0, values: 10 } : { gaps: 0, values: 8 }
    );
    const temperatureSeries = assertMetric('temperatura', (depth) =>
      depth <= 90 ? { gaps: 0, values: 8 } : { gaps: 0, values: 10 }
    );
    expect(component.profileRows).toHaveSize(12);
    expect(component.profileRecentMissingDepths).toEqual([]);
    expect(component.profileRows[0].formatted).toContain('12.0 C');
    const latestFrameCounters = new Set<number>();
    [humiditySeries, salinitySeries, temperatureSeries].flat().forEach((series: any) => {
      const latest = [...series.data].reverse().find((point: any) => point.y !== null);
      if (latest?.fCnt !== undefined) latestFrameCounters.add(latest.fCnt);
    });
    expect([...latestFrameCounters].sort((a, b) => a - b)).toEqual([88, 89, 90]);
  });

  it('renderiza en SVG una spline continua entre observaciones reales de barridos parciales', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '1200px';
    fixture.componentRef.setInput('fechaDesde', '2026-08-14T19:00:00.000Z');
    fixture.componentRef.setInput('rawFrames', secuenciaArturoProductiva());
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(120);

    const chartComponent = () =>
      fixture.debugElement.query(By.directive(ChartComponent)).componentInstance as ChartComponent;
    const renderedSeries = (metric: 'humedad' | 'salinidad' | 'temperatura', depth: number): any => {
      fixture.componentInstance.onMetricChange(metric);
      fixture.detectChanges();
      tick(120);
      return chartComponent().chart?.series.find((series) => series.options.id === `sentek-${metric}-${depth}`);
    };
    const pathMoveCount = (series: any): number => {
      const path = series?.graph?.element?.getAttribute('d') || '';
      return (path.match(/M/g) || []).length;
    };
    const visibleMarkerCount = (series: any): number =>
      series.points.filter((point: any) => !point.isNull && !!point.graphic).length;
    const assertGeometry = (
      metric: 'humedad' | 'salinidad' | 'temperatura',
      depth: number,
      moves: number,
      markers: number
    ): any => {
      const series = renderedSeries(metric, depth);
      expect(series).withContext(`${metric} ${depth} cm existe`).toBeDefined();
      expect(series.type).withContext(`${metric} ${depth} cm usa spline`).toBe('spline');
      expect(series.options.connectNulls).withContext(`${metric} ${depth} cm no une ausencias`).toBeFalse();
      expect(pathMoveCount(series)).withContext(`${metric} ${depth} cm subpaths SVG`).toBe(moves);
      expect(visibleMarkerCount(series)).withContext(`${metric} ${depth} cm markers reales`).toBe(markers);
      expect(series.points.filter((point: any) => point.isNull).every((point: any) => !point.graphic))
        .withContext(`${metric} ${depth} cm null sin marker`)
        .toBeTrue();
      return series;
    };

    const humidity40 = assertGeometry('humedad', 40, 1, 10);
    assertGeometry('humedad', 10, 1, 9);
    const humidityChart = chartComponent().chart!;
    const widthRatio = humidityChart.plotWidth / humidityChart.chartWidth;
    const observedPoints = humidity40.points.filter((point: any) => !point.isNull);
    const observedSpan = (observedPoints.at(-1).plotX - observedPoints[0].plotX) / humidityChart.plotWidth;
    assertGeometry('salinidad', 10, 1, 10);
    assertGeometry('salinidad', 40, 1, 8);
    assertGeometry('temperatura', 100, 1, 10);
    assertGeometry('temperatura', 10, 1, 8);

    expect(widthRatio).toBeGreaterThanOrEqual(0.78);
    expect(observedSpan).toBeGreaterThanOrEqual(0.9);
    fixture.destroy();
  }));

  it('dibuja curva spline y lluvia de fecha diaria dentro de un dominio intradia', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '1024px';
    fixture.componentRef.setInput('rawFrames', [
      ...cicloPerfil('2026-08-14T20:00:00.000Z', 1, 0),
      ...cicloPerfil('2026-08-14T20:20:00.000Z', 4, 8),
      ...cicloPerfil('2026-08-14T20:40:00.000Z', 7, 3),
    ]);
    fixture.componentRef.setInput('lluvias', [{ fecha: '2026-08-14', milimetros: 7.5 }]);
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(160);

    const chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
    const soil = chart.series.find((series: any) => series.options.id === 'sentek-humedad-10')!;
    const rain = chart.series.find((series: any) => series.options.custom?.isRain)!;
    const path = soil.graph?.element?.getAttribute('d') || '';

    expect(soil.type).toBe('spline');
    expect(path).toMatch(/[CQ]/);
    expect(path.match(/M/g) || []).toHaveSize(1);
    expect(soil.points.filter((point: any) => !point.isNull && !!point.graphic)).toHaveSize(3);
    expect(rain).toBeDefined();
    expect(rain.points).toHaveSize(1);
    expect(rain.points[0].y).toBe(7.5);
    expect(rain.points[0].graphic).toBeDefined();
    expect(rain.points[0].plotX).toBeGreaterThanOrEqual(0);
    expect(rain.points[0].plotX).toBeLessThanOrEqual(chart.plotWidth);
    expect(rain.points[0].options.custom.originalDate).toBe('2026-08-14');
    chart.tooltip.refresh(rain.points[0]);
    tick();
    const tooltipText = host.querySelector<SVGElement>('.highcharts-tooltip')!.textContent || '';
    expect(tooltipText).toContain('2026-08-14');
    expect(tooltipText).not.toContain('12:00');
    fixture.destroy();
  }));

  it('excluye la lluvia del dia anterior cuando el dominio empieza exactamente a medianoche', () => {
    const localMidnight = new Date('2026-08-15T03:00:00.000Z').getTime();
    const start = new Date(localMidnight).toISOString();
    const component = new GraficoHistoricoSueloComponent();
    component.fechaDesde = start;
    component.rawFrames = cicloPerfil(start, 1);
    component.lluvias = [
      { fecha: '2026-08-14', milimetros: 4 },
      { fecha: '2026-08-15', milimetros: 7 },
    ];

    component.ngOnChanges({ rawFrames: {} as any, lluvias: {} as any, fechaDesde: {} as any });

    const rainSeries = component.chartOptions.series.find((series: any) => series.custom?.isRain);
    expect(rainSeries.data).toHaveSize(1);
    expect(rainSeries.data[0].y).toBe(7);
    expect(rainSeries.data[0].custom).toEqual(
      jasmine.objectContaining({ originalDate: '2026-08-15', originalDateOnly: true })
    );
    const tooltipHtml = component.chartOptions.tooltip.formatter.call({
      point: {
        ...rainSeries.data[0],
        options: rainSeries.data[0],
        series: { userOptions: rainSeries },
      },
    });
    expect(tooltipHtml).toContain('2026-08-15');
    expect(tooltipHtml).not.toContain('00:00');
    expect(tooltipHtml).not.toContain('12:00');
  });

  [1440, 1280, 1024, 768, 390].forEach((width) => {
    it(`mantiene toolbar y grafico dentro del host a ${width}px`, fakeAsync(() => {
      TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
      const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block';
      host.style.maxWidth = 'none';
      host.style.width = `${width}px`;
      fixture.componentRef.setInput('fechaDesde', '2026-08-14T19:00:00.000Z');
      fixture.componentRef.setInput('rawFrames', secuenciaArturoProductiva());
      fixture.componentRef.setInput('lluvias', [{ fecha: '2026-08-14T21:20:00.000Z', milimetros: 7 }]);
      fixture.componentRef.setInput('daylight', [{ amanecer: '07:30', atardecer: '18:30', fecha: '2026-08-14' }]);
      fixture.componentRef.setInput('agronomicThresholds', {
        capacidadCampoPct: 33.46,
        puntoMarchitezPct: 18.12,
      });
      fixture.componentRef.setInput('mostrarNapa', false);
      fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
      fixture.detectChanges();
      tick(120);

      const card = host.querySelector<HTMLElement>('.soil-history-card')!;
      const header = host.querySelector<HTMLElement>('.soil-history-card > header')!;
      const actions = host.querySelector<HTMLElement>('.soil-history-actions')!;
      const select = host.querySelector<HTMLElement>('.soil-history-filter')!;
      const depthSelector = host.querySelector<HTMLDetailsElement>('.soil-depth-selector')!;
      const depthSummary = depthSelector.querySelector<HTMLElement>('summary')!;
      const exportButton = host.querySelector<HTMLElement>('.soil-history-export')!;
      const chartHost = host.querySelector<HTMLElement>('app-chart')!;
      const chartContainer = host.querySelector<HTMLElement>('.highcharts-container')!;
      const chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
      chart.reflow();
      tick(40);
      const hostRect = host.getBoundingClientRect();
      const withinHost = (element: HTMLElement): boolean => {
        const rect = element.getBoundingClientRect();
        return rect.left >= hostRect.left - 0.5 && rect.right <= hostRect.right + 0.5;
      };
      const measurements = {
        actionsRight: Math.round(actions.getBoundingClientRect().right - hostRect.left),
        buttonRight: Math.round(exportButton.getBoundingClientRect().right - hostRect.left),
        cardWidth: Math.round(card.getBoundingClientRect().width),
        chartRight: Math.round(chartContainer.getBoundingClientRect().right - hostRect.left),
        clientWidth: host.clientWidth,
        scrollWidth: host.scrollWidth,
        selectRight: Math.round(select.getBoundingClientRect().right - hostRect.left),
        width,
      };

      expect(host.scrollWidth)
        .withContext(`overflow ${JSON.stringify(measurements)}`)
        .toBeLessThanOrEqual(host.clientWidth);
      expect(withinHost(actions))
        .withContext(`acciones ${JSON.stringify(measurements)}`)
        .toBeTrue();
      expect(withinHost(select))
        .withContext(`selector ${JSON.stringify(measurements)}`)
        .toBeTrue();
      expect(withinHost(depthSelector))
        .withContext(`selector profundidad ${JSON.stringify(measurements)}`)
        .toBeTrue();
      expect(withinHost(exportButton))
        .withContext(`exportar ${JSON.stringify(measurements)}`)
        .toBeTrue();
      expect(withinHost(chartHost))
        .withContext(`chart host ${JSON.stringify(measurements)}`)
        .toBeTrue();
      expect(withinHost(chartContainer))
        .withContext(`chart SVG ${JSON.stringify(measurements)}`)
        .toBeTrue();
      expect(select.offsetWidth).toBeGreaterThan(0);
      expect(depthSummary.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
      expect(exportButton.offsetWidth).toBeGreaterThan(0);

      if (width === 1440 || width === 768 || width === 390) {
        depthSelector.open = true;
        fixture.detectChanges();
        tick();
        const depthMenu = depthSelector.querySelector<HTMLElement>('.soil-depth-menu')!;
        const depthTargets = [...depthMenu.querySelectorAll<HTMLElement>('.soil-depth-options label')];
        expect(withinHost(depthMenu))
          .withContext(`popover profundidad ${JSON.stringify(measurements)}`)
          .toBeTrue();
        expect(depthTargets).toHaveSize(12);
        expect(Math.min(...depthTargets.map((target) => target.getBoundingClientRect().height)))
          .withContext(`targets tactiles ${width}px`)
          .toBeGreaterThanOrEqual(36);
        depthSelector.open = false;
      }

      if (width === 390) {
        expect(header.getBoundingClientRect().height).withContext('cabecera movil compacta').toBeLessThan(160);
        expect(actions.getBoundingClientRect().height)
          .withContext('controles moviles sin flex-basis vertical de escritorio')
          .toBeLessThan(100);
      }

      if (width === 1440 || width === 768 || width === 390) {
        const expectedHeight = width <= 768 ? 410 : 460;
        const soilAxis = chart.yAxis.find((axis: any) => axis.options.id === 'sentek-humedad-shared')!;
        const soilSeries = chart.series.filter((series: any) => series.options.custom?.isSoil);
        const rainSeries = chart.series.find((series: any) => series.options.custom?.isRain);
        const daySeries = chart.get('sentek-solar-day') as any;
        const nightSeries = chart.get('sentek-solar-night') as any;
        const xLabelElements = [...host.querySelectorAll<SVGTextElement>('.highcharts-xaxis-labels text')].filter(
          (label) => label.getBoundingClientRect().width > 0
        );
        const chartRect = chartContainer.getBoundingClientRect();

        expect(chart.chartHeight).withContext(`altura ${width}px`).toBe(expectedHeight);
        expect(soilAxis).withContext(`eje unico ${width}px`).toBeDefined();
        expect(soilAxis.getExtremes().min).withContext(`VWC minimo ${width}px`).toBe(0);
        expect(soilAxis.getExtremes().max).withContext(`VWC maximo ${width}px`).toBe(60);
        expect(soilSeries).withContext(`12 curvas ${width}px`).toHaveSize(12);
        expect(new Set(soilSeries.map((series: any) => series.color)).size)
          .withContext(`12 colores ${width}px`)
          .toBe(12);
        expect(soilSeries.every((series: any) => series.options.showInLegend))
          .withContext(`leyenda clickeable ${width}px`)
          .toBeTrue();
        expect(chart.legend.allItems).withContext(`12 items de leyenda ${width}px`).toHaveSize(12);
        ['.sentek-zone-deficit', '.sentek-zone-target', '.sentek-zone-excess'].forEach((selector) => {
          const rect = host.querySelector<SVGElement>(selector)!.getBoundingClientRect();
          expect(rect.width).withContext(`${selector} ancho ${width}px`).toBeGreaterThan(0);
          expect(rect.height).withContext(`${selector} alto ${width}px`).toBeGreaterThan(0);
          expect(rect.left).withContext(`${selector} izquierda ${width}px`).toBeGreaterThanOrEqual(chartRect.left);
          expect(rect.right).withContext(`${selector} derecha ${width}px`).toBeLessThanOrEqual(chartRect.right + 0.5);
        });
        expect(daySeries?.graph?.element?.getBoundingClientRect().width)
          .withContext(`franja dia ${width}px`)
          .toBeGreaterThan(0);
        expect(nightSeries?.graph?.element?.getBoundingClientRect().width)
          .withContext(`franja noche ${width}px`)
          .toBeGreaterThan(0);
        expect(rainSeries).withContext(`serie lluvia ${width}px`).toBeDefined();
        expect(rainSeries!.points.some((point: any) => point.y > 0 && !!point.graphic))
          .withContext(`barra lluvia visible ${width}px`)
          .toBeTrue();
        expect(xLabelElements.length).withContext(`etiquetas X ${width}px`).toBeGreaterThanOrEqual(2);
        expect(
          xLabelElements.every((label) => {
            const rect = label.getBoundingClientRect();
            return rect.left >= chartRect.left - 0.5 && rect.right <= chartRect.right + 0.5;
          })
        )
          .withContext(`etiquetas X dentro del SVG ${width}px`)
          .toBeTrue();

        const observedSeries = chart.series.find(
          (series: any) => series.options.custom?.isSoil && series.points.some((point: any) => !point.isNull)
        )!;
        const observedPoints = observedSeries.points.filter((point: any) => !point.isNull);
        chart.tooltip.refresh(observedPoints[Math.floor(observedPoints.length / 2)]);
        tick();
        const tooltip = host.querySelector<SVGElement>('.highcharts-tooltip')!;
        const tooltipRect = tooltip.getBoundingClientRect();
        expect(tooltip.textContent?.trim().length || 0)
          .withContext(`tooltip ${width}px`)
          .toBeGreaterThan(0);
        expect(tooltipRect.left)
          .withContext(`tooltip izquierda ${width}px`)
          .toBeGreaterThanOrEqual(chartRect.left - 0.5);
        expect(tooltipRect.right)
          .withContext(`tooltip derecha ${width}px`)
          .toBeLessThanOrEqual(chartRect.right + 0.5);
        expect(tooltipRect.top)
          .withContext(`tooltip arriba ${width}px`)
          .toBeGreaterThanOrEqual(chartRect.top - 0.5);
        expect(tooltipRect.bottom)
          .withContext(`tooltip abajo ${width}px`)
          .toBeLessThanOrEqual(chartRect.bottom + 0.5);
      }
      fixture.destroy();
    }));
  });

  it('conserva los dieciseis ciclos completos Gil aunque reinicien canal dentro de seis minutos', () => {
    const start = new Date('2026-08-14T20:00:00.000Z').getTime();
    const component = prepare(
      Array.from({ length: 16 }, (_, index) =>
        cicloPerfil(new Date(start + index * 4 * 60 * 1000).toISOString(), 189 + index * 3, index)
      ).flat()
    );

    const soilSeries = component.chartOptions.series.filter((series: any) => series.custom?.isSoil);
    expect(soilSeries).toHaveSize(12);
    expect(
      soilSeries.every(
        (series: any) =>
          series.data.filter((point: any) => point.y !== null).length === 16 &&
          series.data.filter((point: any) => point.y === null).length === 0
      )
    ).toBeTrue();
  });

  it('oculta markers estaticos en un historico largo sin perder spline, hover ni tooltip', fakeAsync(() => {
    const start = new Date('2026-08-12T10:00:00.000Z').getTime();
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '1024px';
    fixture.componentRef.setInput(
      'rawFrames',
      Array.from({ length: 81 }, (_, index) =>
        cicloPerfil(new Date(start + index * 10 * 60 * 1000).toISOString(), 1 + index * 3, index % 7)
      ).flat()
    );
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(240);

    const chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
    const soilSeries = chart.series.filter((series: any) => series.options.custom?.isSoil);
    const soil = soilSeries.find((series: any) => series.options.id === 'sentek-humedad-10')!;
    const path = soil.graph?.element?.getAttribute('d') || '';
    const staticMarkerCount = soilSeries
      .flatMap((series: any) => series.points)
      .filter((point: any) => !point.isNull && !!point.graphic).length;

    expect(soil.type).toBe('spline');
    expect(soil.points.filter((point: any) => !point.isNull)).toHaveSize(81);
    expect(path).toMatch(/[CQ]/);
    expect(path.match(/M/g) || []).toHaveSize(1);
    expect(staticMarkerCount).toBe(0);
    expect(soil.options.marker.enabled).toBeFalse();
    expect(soil.options.marker.states.hover.enabled).toBeTrue();

    const hovered = soil.points[40];
    hovered.setState('hover');
    chart.tooltip.refresh(hovered);
    tick();
    expect(soil.stateMarkerGraphic).toBeDefined();
    const tooltip = host.querySelector<SVGElement>('.highcharts-tooltip')!;
    expect(tooltip.textContent).toContain('10 cm');
    expect(tooltip.textContent).not.toContain('crudo');
    fixture.destroy();
  }));

  it('mantiene continuidad cuando dos ciclos reales estan separados por dos horas', () => {
    const component = prepare([
      ...cicloPerfil('2026-08-14T10:00:00.000Z', 1),
      ...cicloPerfil('2026-08-14T12:00:00.000Z', 4, 10),
    ]);

    const soilSeries = component.chartOptions.series.filter((series: any) => series.custom?.isSoil);
    expect(
      soilSeries.every(
        (series: any) =>
          series.data.filter((point: any) => point.y !== null).length === 2 &&
          series.data.filter((point: any) => point.y === null).length === 0
      )
    ).toBeTrue();
    expect(component.resumen).toContain('24 datos crudos');
  });

  it('inserta un unico corte por identidad ante una interrupcion superior a seis horas', () => {
    const component = prepare([
      ...cicloPerfil('2026-08-14T10:00:00.000Z', 1),
      ...cicloPerfil('2026-08-14T17:01:00.000Z', 4, 10),
    ]);

    const soilSeries = component.chartOptions.series.filter((series: any) => series.custom?.isSoil);
    expect(
      soilSeries.every(
        (series: any) =>
          series.data.filter((point: any) => point.y !== null).length === 2 &&
          series.data.filter((point: any) => point.y === null).length === 1
      )
    ).toBeTrue();
    expect(
      soilSeries.every((series: any) => {
        const gap = series.data.find((point: any) => point.y === null);
        return gap?.custom?.isGap === true && gap?.marker?.enabled === false;
      })
    ).toBeTrue();
  });

  it('renderiza dos subtrazos SVG ante una interrupcion superior a seis horas', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [GraficoHistoricoSueloComponent] });
    const fixture = TestBed.createComponent(GraficoHistoricoSueloComponent);
    fixture.componentRef.setInput('rawFrames', [
      ...cicloPerfil('2026-08-14T10:00:00.000Z', 1),
      ...cicloPerfil('2026-08-14T17:01:00.000Z', 4, 10),
    ]);
    fixture.componentRef.setInput('mostrarNapa', false);
    fixture.componentRef.setInput('mostrarEntradaAnalogica', false);
    fixture.detectChanges();
    tick(140);

    const chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
    const soil = chart.series.find((series: any) => series.options.id === 'sentek-humedad-10')!;
    const path = soil.graph?.element?.getAttribute('d') || '';
    expect(path.match(/M/g) || []).toHaveSize(2);
    expect(soil.points.filter((point: any) => !point.isNull && !!point.graphic)).toHaveSize(2);
    expect(soil.points.filter((point: any) => point.isNull && !!point.graphic)).toHaveSize(0);
    fixture.destroy();
  }));

  it('reemplaza por identidad todas las series al cambiar humedad, temperatura y salinidad', () => {
    const allDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = [
      frame(
        '2026-08-13T10:00:00.000Z',
        [100, 110, 120].map((depth, index) => lectura('temperatura_suelo', depth, 12 + index)),
        1
      ),
      frame(
        '2026-08-14T20:00:00.000Z',
        allDepths.flatMap((depth, index) => [
          lectura('humedad_suelo', depth, 20 + index),
          lectura('salinidad_suelo', depth, 1400 + index),
          lectura('temperatura_suelo', depth, 13 + index / 10),
        ]),
        2
      ),
    ];
    component.ngOnChanges({ rawFrames: {} as any });

    const ids = () =>
      (component.chartOptions.series || [])
        .filter((series: any) => series.custom?.isSoil)
        .map((series: any) => series.id);
    const humidityIds = ids();

    component.onMetricChange('temperatura');
    const temperatureIds = ids();
    component.onMetricChange('salinidad');
    const salinityIds = ids();

    expect(humidityIds.every((id: string) => id.startsWith('sentek-humedad-'))).toBeTrue();
    expect(temperatureIds.every((id: string) => id.startsWith('sentek-temperatura-'))).toBeTrue();
    expect(salinityIds.every((id: string) => id.startsWith('sentek-salinidad-'))).toBeTrue();
    expect(new Set([...humidityIds, ...temperatureIds, ...salinityIds]).size).toBe(36);
    expect(component.chartOptions.yAxis.filter((axis: any) => axis.id === 'sentek-salinidad-shared')).toHaveSize(1);
    expect(component.chartOptions.xAxis.plotBands).toEqual([]);
    expect(component.chartOptions.chart.animation).toBeFalse();
    expect(component.chartOptions.plotOptions.series.animation).toBeFalse();
    expect(component.chartOptions.plotOptions.spline.animation).toBeFalse();
  });
});
