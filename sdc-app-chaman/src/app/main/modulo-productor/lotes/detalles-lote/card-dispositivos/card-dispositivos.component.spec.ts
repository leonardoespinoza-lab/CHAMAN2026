import { IDispositivo, ILote } from 'modelos/src';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LorawanUplinksService } from '../../../../../auxiliares/http/lorawan-uplinks.service';
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { GraficoHistoricoSueloComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-suelo/grafico-historico-suelo.component';
import { CardDispositivosComponent } from './card-dispositivos.component';

describe('CardDispositivosComponent', () => {
  it('expone Sentek y Napa como dos servicios aunque compartan DevEUI', () => {
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any, {} as any);
    const controller: IDispositivo = {
      _id: 'controller-1',
      deveui: '24E124136D000001',
      nombre: 'Milesight UC511',
      tipo: 'Otro',
      sensores: ['Humedad Suelo Profundidad', 'Temperatura Suelo', 'Salinidad Suelo', 'Entrada Analógica', 'Napa'],
      configuracionLecturas: {
        perfilSuelo: {
          tipo: 'sonda_sentek_120cm',
          protocolo: 'SDI-12',
          niveles: 12,
          profundidadesCm: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
          variables: ['humedad_vwc', 'salinidad_vic', 'temperatura'],
        },
        entradaAnalogica: {
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
        },
      },
      ultimoReporte: {
        fecha: '2026-08-14T10:00:00.000Z',
        datos: {
          valores: {
            'Humedad Suelo Profundidad': [{ profundidad: 10, unidad: '%', valores: { actual: 22 } }],
            Napa: [
              {
                unidad: 'm',
                valores: { actual: 2.72, columnaAgua: 3.28, profundidadInstalacion: 6 },
              },
            ],
          },
        },
      },
    };
    component.lote = { dispositivos: [controller] } as ILote;

    component.ngOnChanges({ lote: {} as any });

    expect(component.dispositivos.length).toBe(2);
    const sentek = component.dispositivos.find((item) => item.nombre === 'Sonda de humedad de suelo Sentek')!;
    const napa = component.dispositivos.find((item) => item.nombre === 'Medidor de Napa')!;
    expect(component.esLanzaDeSuelo(sentek)).toBeTrue();
    expect(component.esMedidorNapa(sentek)).toBeFalse();
    expect(component.esMedidorNapa(napa)).toBeTrue();
    expect(component.getDeviceKey(sentek)).not.toBe(component.getDeviceKey(napa));
    expect(sentek.ultimoReporte?.datos?.valores.Napa).toBeUndefined();
    expect(napa.ultimoReporte?.datos?.valores['Humedad Suelo Profundidad']).toBeUndefined();
    expect(component.configuracionNapa(napa)?.profundidadInstalacionM).toBe(6);
  });

  it('no clasifica un Milesight generico como Sentek ni como Napa', () => {
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any, {} as any);
    component.lote = {
      dispositivos: [{ _id: 'controller-2', deveui: '24E124136D000002', nombre: 'Milesight UC511', tipo: 'Otro' }],
    } as ILote;

    component.ngOnChanges({ lote: {} as any });

    expect(component.dispositivos.length).toBe(1);
    expect(component.esLanzaDeSuelo(component.dispositivos[0])).toBeFalse();
    expect(component.esMedidorNapa(component.dispositivos[0])).toBeFalse();
  });

  it('carga solo lluvia historica de la siembra para superponerla al perfil', async () => {
    const agrometeorologia = jasmine.createSpy().and.resolveTo({
      series: [
        {
          date: '2026-08-12',
          isForecast: false,
          metrics: { precipitationMm: 14.6, sunrise: '07:31', sunset: '18:28' },
        },
        {
          date: '2026-08-13',
          isForecast: false,
          metrics: { precipitationMm: 0 },
          weather: { sunrise: '07:30', sunset: '18:29' },
        },
        {
          date: '2026-08-15',
          isForecast: true,
          metrics: { precipitationMm: 22, sunrise: '2026-08-15T10:28:00.000Z', sunset: '2026-08-15T21:30:00.000Z' },
        },
      ],
    });
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any, { agrometeorologia } as any);
    component.lote = { idSiembra: 'siembra-1' } as ILote;

    await (component as any).cargarLluviasHistoricas();

    expect(agrometeorologia).toHaveBeenCalledWith('siembra-1', jasmine.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(component.lluviasHistoricas).toEqual([
      { fecha: '2026-08-12', milimetros: 14.6 },
      { fecha: '2026-08-13', milimetros: 0 },
    ]);
    expect(component.daylightHistorico).toEqual([
      { amanecer: '07:31', atardecer: '18:28', fecha: '2026-08-12' },
      { amanecer: '07:30', atardecer: '18:29', fecha: '2026-08-13' },
      {
        amanecer: '2026-08-15T10:28:00.000Z',
        atardecer: '2026-08-15T21:30:00.000Z',
        fecha: '2026-08-15',
      },
    ]);
  });

  it('usa la zona horaria de la estacion del lote y conserva Buenos Aires como fallback', () => {
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any, {} as any);
    expect(component.sentekTimeZone).toBe('America/Argentina/Buenos_Aires');

    component.lote = {
      establecimiento: { estacionMeteorologica: { position: { timezoneCode: 'America/Argentina/Cordoba' } } },
    } as ILote;
    expect(component.sentekTimeZone).toBe('America/Argentina/Cordoba');
  });

  it('mantiene card, periodo, toolbar Sentek y SVG dentro del viewport', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [CardDispositivosComponent],
      providers: [
        { provide: HelperService, useValue: {} },
        { provide: ReporteService, useValue: { historico: jasmine.createSpy().and.resolveTo({ datos: [] }) } },
        { provide: LorawanUplinksService, useValue: { rawHistory: jasmine.createSpy().and.resolveTo([]) } },
        { provide: SiembraService, useValue: { agrometeorologia: jasmine.createSpy().and.resolveTo({ series: [] }) } },
      ],
    });
    const fixture = TestBed.createComponent(CardDispositivosComponent);
    fixture.detectChanges();
    tick();

    const component = fixture.componentInstance;
    const sentek = {
      _id: 'sentek-responsive',
      deveui: '24E124454E358347',
      nombre: 'Sonda de humedad de suelo Sentek',
      tipo: 'Sensor de Humedad de Suelo',
      sensores: ['Humedad Suelo Profundidad', 'Temperatura Suelo', 'Salinidad Suelo'],
      fechaAsignacionLote: '2026-08-14T19:00:00.000Z',
      configuracionLecturas: {
        perfilSuelo: {
          tipo: 'sonda_sentek_120cm',
          protocolo: 'SDI-12',
          niveles: 12,
          profundidadesCm: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
          variables: ['humedad_vwc', 'salinidad_vic', 'temperatura'],
        },
      },
    } as IDispositivo;
    component.dispositivos = [sentek];
    const key = component.getDeviceKey(sentek);
    component.tramasCrudas.set(key, [
      {
        decodeStatus: 'decoded',
        devEUI: sentek.deveui!,
        fCnt: 90,
        profileChannels: [0, 1, 2, 3, 4],
        timestamp: '2026-08-14T23:49:16.060Z',
        readings: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((depthCm, index) => ({
          depthCm,
          quality: 'valid' as const,
          serviceId: 'perfil-suelo-sentek',
          unit: '%',
          value: 20 + index,
          variable: 'humedad_suelo',
        })),
      },
    ]);
    component.daylightHistorico = [{ amanecer: '07:30', atardecer: '18:30', fecha: '2026-08-14' }];
    fixture.detectChanges();
    tick(120);

    const responsiveHost = fixture.nativeElement as HTMLElement;
    responsiveHost.style.display = 'block';
    responsiveHost.style.maxWidth = 'none';
    try {
      [1440, 1280, 1024, 768, 390].forEach((width) => {
        responsiveHost.style.width = `${width}px`;
        fixture.detectChanges();
        tick(160);
        const root = fixture.nativeElement as HTMLElement;
        const devicesCard = root.querySelector<HTMLElement>('.devices-card')!;
        const devicesHeader = root.querySelector<HTMLElement>('.devices-header')!;
        const devicesTitle = root.querySelector<HTMLElement>('.devices-title')!;
        const devicesToolbar = root.querySelector<HTMLElement>('.devices-toolbar')!;
        const historyPeriod = root.querySelector<HTMLElement>('.history-period')!;
        const historyButtons = [...root.querySelectorAll<HTMLElement>('.history-period button')];
        const soilHost = root.querySelector<HTMLElement>('app-grafico-historico-suelo')!;
        const soilHeader = root.querySelector<HTMLElement>('.soil-history-card > header')!;
        const soilActions = root.querySelector<HTMLElement>('.soil-history-actions')!;
        const select = root.querySelector<HTMLElement>('.soil-history-filter')!;
        const depthSelector = root.querySelector<HTMLElement>('.soil-depth-selector')!;
        const exportButton = root.querySelector<HTMLElement>('.soil-history-export')!;
        const chartHost = root.querySelector<HTMLElement>('app-chart')!;
        const chartSvg = root.querySelector<SVGElement>('.highcharts-root')!;
        const cardRect = devicesCard.getBoundingClientRect();
        const insideCard = (element: Element): boolean => {
          const rect = element.getBoundingClientRect();
          return rect.left >= cardRect.left - 0.5 && rect.right <= cardRect.right + 0.5;
        };
        const chart = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance.chart!;
        chart.reflow();
        tick(40);
        const minPlotRatio = width >= 1024 ? 0.78 : width >= 768 ? 0.7 : 0.58;
        const measurements = {
          cardClient: devicesCard.clientWidth,
          cardScroll: devicesCard.scrollWidth,
          chartClient: chartHost.clientWidth,
          chartWidth: chart.chartWidth,
          hostClient: responsiveHost.clientWidth,
          plotRatio: Number((chart.plotWidth / chart.chartWidth).toFixed(3)),
          soilClient: soilHost.clientWidth,
          soilScroll: soilHost.scrollWidth,
          width,
        };
        expect(responsiveHost.clientWidth)
          .withContext(`host ${JSON.stringify(measurements)}`)
          .toBe(width);
        expect(devicesCard.scrollWidth)
          .withContext(`card overflow ${JSON.stringify(measurements)}`)
          .toBeLessThanOrEqual(devicesCard.clientWidth + 1);
        expect(soilHost.scrollWidth)
          .withContext(`soil overflow ${JSON.stringify(measurements)}`)
          .toBeLessThanOrEqual(soilHost.clientWidth + 1);
        [
          devicesHeader,
          devicesToolbar,
          historyPeriod,
          soilHeader,
          soilActions,
          select,
          depthSelector,
          exportButton,
          chartHost,
          chartSvg,
        ].forEach((element) =>
          expect(insideCard(element))
            .withContext(`fuera del card ${JSON.stringify(measurements)}`)
            .toBeTrue()
        );
        expect(historyButtons).toHaveSize(4);
        expect(historyButtons.every((button) => insideCard(button) && button.offsetWidth > 0)).toBeTrue();
        expect(chart.chartWidth)
          .withContext(`Highcharts excede host ${JSON.stringify(measurements)}`)
          .toBeLessThanOrEqual(chartHost.clientWidth + 1);
        expect(chart.plotWidth / chart.chartWidth)
          .withContext(`plot angosto ${JSON.stringify(measurements)}`)
          .toBeGreaterThanOrEqual(minPlotRatio);
        expect(
          chart.series
            .filter((series: any) => !series.options.custom?.['isRain'])
            .flatMap((series: any) => series.points)
            .every((point: any) => point.plotX === undefined || (point.plotX >= 0 && point.plotX <= chart.plotWidth))
        ).toBeTrue();
        const soilComponent = fixture.debugElement.query(By.directive(GraficoHistoricoSueloComponent))
          .componentInstance as GraficoHistoricoSueloComponent;
        expect(soilComponent.daylight).toEqual(component.daylightHistorico);
        expect(soilComponent.timeZone).toBe('America/Argentina/Buenos_Aires');
        if (width <= 768) {
          expect(getComputedStyle(devicesHeader).display).toBe('grid');
          expect(devicesToolbar.getBoundingClientRect().top).toBeGreaterThanOrEqual(
            devicesTitle.getBoundingClientRect().bottom - 0.5
          );
          expect(getComputedStyle(soilHeader).flexDirection).toBe('column');
        } else {
          expect(getComputedStyle(devicesHeader).display).toBe('flex');
          expect(getComputedStyle(soilHeader).flexDirection).toBe('row');
        }
        if (width === 390) {
          expect(exportButton.getBoundingClientRect().top).toBeGreaterThanOrEqual(
            select.getBoundingClientRect().bottom - 0.5
          );
        }
      });
    } finally {
      fixture.destroy();
    }
  }));
});
