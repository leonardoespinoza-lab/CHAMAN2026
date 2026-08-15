import { IDispositivo, ILote } from 'modelos/src';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LorawanUplinksService } from '../../../../../auxiliares/http/lorawan-uplinks.service';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
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
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-08-15T15:00:00.000Z'));
    try {
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
            metrics: {
              precipitationMm: 22,
              sunrise: '2026-08-15T10:28:00.000Z',
              sunset: '2026-08-15T21:30:00.000Z',
            },
          },
        ],
      });
      const component = new CardDispositivosComponent({} as any, {} as any, {} as any, { agrometeorologia } as any);
      component.lote = { idSiembra: 'siembra-1' } as ILote;

      await (component as any).cargarLluviasHistoricas();

      expect(agrometeorologia).toHaveBeenCalledWith('siembra-1', '2026-07-17');
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
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('usa la zona horaria de la estacion del lote y conserva Buenos Aires como fallback', () => {
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any, {} as any);
    expect(component.sentekTimeZone).toBe('America/Argentina/Buenos_Aires');

    component.lote = {
      establecimiento: { estacionMeteorologica: { position: { timezoneCode: 'America/Argentina/Cordoba' } } },
    } as ILote;
    expect(component.sentekTimeZone).toBe('America/Argentina/Cordoba');
  });

  it('sin idSiembra usa SunCalc con coordenadas y genera bandas para todo el periodo seleccionado', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-08-15T15:00:00.000Z'));
    try {
      const agrometeorologia = jasmine.createSpy();
      const component = new CardDispositivosComponent({} as any, {} as any, {} as any, { agrometeorologia } as any);
      component.diasHistorico = 3;
      component.lote = {
        _id: '6a398ca8d1650b29166f7d5d',
        ubicacion: { centro: { lat: -32.801292062802176, lng: -62.20157052916597 } },
      } as ILote;

      await (component as any).cargarLluviasHistoricas();

      expect(agrometeorologia).not.toHaveBeenCalled();
      expect(component.lluviasHistoricas).toEqual([]);
      expect(component.daylightHistorico.map((item) => item.fecha)).toEqual(['2026-08-13', '2026-08-14', '2026-08-15']);
      expect(
        component.daylightHistorico.every(
          (item) =>
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.amanecer) &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.atardecer) &&
            new Date(item.amanecer).getTime() < new Date(item.atardecer).getTime()
        )
      ).toBeTrue();

      const graph = new GraficoHistoricoSueloComponent();
      graph.rawFrames = [
        {
          decodeStatus: 'decoded',
          devEUI: '24E124454E358347',
          fCnt: 1,
          timestamp: '2026-08-15T15:00:00.000Z',
          readings: [
            {
              depthCm: 10,
              quality: 'valid',
              serviceId: 'perfil-suelo-sentek',
              unit: '%',
              value: 24,
              variable: 'humedad_suelo',
            },
          ],
        },
      ];
      graph.daylight = component.daylightHistorico;
      graph.ngOnChanges({ rawFrames: {} as any, daylight: {} as any });
      expect(graph.chartOptions.xAxis.plotBands).toEqual([]);
      expect(graph.chartOptions.series.some((series: any) => series.id === 'sentek-solar-day')).toBeTrue();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('sin coordenadas mantiene daylight vacio y no inventa lluvia', async () => {
    const agrometeorologia = jasmine.createSpy();
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any, { agrometeorologia } as any);
    component.diasHistorico = 2;
    component.lote = {} as ILote;

    await (component as any).cargarLluviasHistoricas();

    expect(agrometeorologia).not.toHaveBeenCalled();
    expect(component.daylightHistorico).toEqual([]);
    expect(component.lluviasHistoricas).toEqual([]);
  });

  it('prefiere horarios solares de la API y completa solamente las fechas faltantes con SunCalc', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-08-15T15:00:00.000Z'));
    try {
      const agrometeorologia = jasmine.createSpy().and.resolveTo({
        series: [
          {
            date: '2026-08-14',
            isForecast: false,
            metrics: { precipitationMm: 5, sunrise: '06:11', sunset: '18:44' },
          },
          { date: '2026-08-15', isForecast: true, metrics: { precipitationMm: 9 } },
        ],
      });
      const component = new CardDispositivosComponent({} as any, {} as any, {} as any, { agrometeorologia } as any);
      component.diasHistorico = 2;
      component.lote = {
        idSiembra: 'siembra-solar',
        siembra: { coordenadas: { lat: -33.67, lng: -59.66 } },
      } as ILote;

      await (component as any).cargarLluviasHistoricas();

      expect(agrometeorologia).toHaveBeenCalledOnceWith('siembra-solar', '2026-08-14');
      expect(component.daylightHistorico).toHaveSize(2);
      expect(component.daylightHistorico[0]).toEqual({
        amanecer: '06:11',
        atardecer: '18:44',
        fecha: '2026-08-14',
      });
      expect(component.daylightHistorico[1].fecha).toBe('2026-08-15');
      expect(component.daylightHistorico[1].amanecer).toMatch(/Z$/);
      expect(component.lluviasHistoricas).toEqual([{ fecha: '2026-08-14', milimetros: 5 }]);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('resuelve coordenadas en orden lote, siembra y establecimiento', () => {
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any, {} as any);
    component.lote = {
      ubicacion: { centro: { lat: -31, lng: -61 } },
      siembra: { coordenadas: { lat: -32, lng: -62 } },
      establecimiento: { ubicacion: [{ centro: { lat: -33, lng: -63 } }] },
    } as ILote;
    expect((component as any).sentekCoordinates()).toEqual({ lat: -31, lng: -61 });

    component.lote.ubicacion = undefined;
    expect((component as any).sentekCoordinates()).toEqual({ lat: -32, lng: -62 });
    component.lote.siembra!.coordenadas = undefined;
    expect((component as any).sentekCoordinates()).toEqual({ lat: -33, lng: -63 });
  });

  it('carga CC/PMP solo del endpoint canonico y conserva procedencia especifica aunque la confianza global sea mayor', async () => {
    const entradasAgronomicasSuelo = jasmine.createSpy().and.resolveTo({
      confidence: 'medium',
      depthLayers: [],
      fieldCapacityPercentage: 33.46,
      loteId: 'lote-canonico',
      provenance: {
        fieldCapacityPercentage: {
          confidence: 'low',
          depthFromCm: 0,
          depthToCm: 100,
          observedOrEstimated: 'estimated',
          source: 'soilgrids',
        },
        wiltingPointPercentage: {
          confidence: 'low',
          depthFromCm: 0,
          depthToCm: 100,
          observedOrEstimated: 'estimated',
          source: 'soilgrids',
        },
      },
      selectionPolicyVersion: 'soil-agronomic-selection-v1.0.0',
      selectionReason: 'automatic_assessment',
      stale: false,
      status: 'ready',
      wiltingPointPercentage: 18.12,
    });
    const component = new CardDispositivosComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { entradasAgronomicasSuelo } as any
    );
    component.lote = {
      _id: 'lote-canonico',
      capacidadDeCampo: 90,
      puntoMarchitez: 2,
    } as any;

    await (component as any).cargarUmbralesAgronomicosSentek();

    expect(entradasAgronomicasSuelo).toHaveBeenCalledOnceWith('lote-canonico');
    expect(component.sentekAgronomicThresholds).toEqual({
      capacidadCampoPct: 33.46,
      confianza: 'low',
      depthFromCm: 0,
      depthToCm: 100,
      fuente: 'soilgrids',
      origen: 'estimated',
      puntoMarchitezPct: 18.12,
      recargaPct: 25.79,
      stale: false,
    });
    expect(component.sentekAgronomicThresholdsUnavailable).toBeFalse();
  });

  it('marca la referencia vencida y no sustituye una respuesta invalida con valores legacy', async () => {
    const entradasAgronomicasSuelo = jasmine.createSpy().and.resolveTo({
      depthLayers: [],
      fieldCapacityPercentage: 33.34,
      loteId: 'lote-stale',
      provenance: {
        fieldCapacityPercentage: {
          confidence: 'low',
          observedOrEstimated: 'estimated',
          source: 'soilgrids',
        },
        wiltingPointPercentage: {
          confidence: 'low',
          observedOrEstimated: 'estimated',
          source: 'soilgrids',
        },
      },
      selectionPolicyVersion: 'soil-agronomic-selection-v1.0.0',
      selectionReason: 'automatic_assessment',
      stale: true,
      status: 'ready',
      wiltingPointPercentage: 20.49,
    });
    const component = new CardDispositivosComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { entradasAgronomicasSuelo } as any
    );
    component.lote = { _id: 'lote-stale', capacidadDeCampo: 30, puntoMarchitez: 14 } as any;

    await (component as any).cargarUmbralesAgronomicosSentek();
    expect(component.sentekAgronomicThresholds).toEqual(
      jasmine.objectContaining({ capacidadCampoPct: 33.34, puntoMarchitezPct: 20.49, stale: true })
    );
    expect(component.sentekAgronomicThresholdsUnavailable).toBeFalse();

    entradasAgronomicasSuelo.and.resolveTo({
      fieldCapacityPercentage: 10,
      selectionReason: 'automatic_assessment',
      stale: false,
      wiltingPointPercentage: 20,
    });
    await (component as any).cargarUmbralesAgronomicosSentek();
    expect(component.sentekAgronomicThresholds).toBeUndefined();
    expect(component.sentekAgronomicThresholdsUnavailable).toBeTrue();
  });

  it('rechaza lote cruzado, estado no terminal, legacy y error HTTP sin fabricar bandas', async () => {
    const entradasAgronomicasSuelo = jasmine.createSpy();
    const component = new CardDispositivosComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { entradasAgronomicasSuelo } as any
    );
    component.lote = { _id: 'lote-seguro', capacidadDeCampo: 30, puntoMarchitez: 14 } as any;
    const base = {
      depthLayers: [],
      fieldCapacityPercentage: 33.46,
      loteId: 'lote-seguro',
      provenance: {},
      selectionPolicyVersion: 'soil-agronomic-selection-v1.0.0',
      selectionReason: 'automatic_assessment',
      stale: false,
      status: 'ready',
      wiltingPointPercentage: 18.12,
    };

    entradasAgronomicasSuelo.and.resolveTo({ ...base, loteId: 'otro-lote' });
    await (component as any).cargarUmbralesAgronomicosSentek();
    expect(component.sentekAgronomicThresholds).toBeUndefined();
    expect(component.sentekAgronomicThresholdsUnavailable).toBeTrue();

    entradasAgronomicasSuelo.and.resolveTo({ ...base, status: 'processing' });
    await (component as any).cargarUmbralesAgronomicosSentek();
    expect(component.sentekAgronomicThresholds).toBeUndefined();
    expect(component.sentekAgronomicThresholdsUnavailable).toBeTrue();

    entradasAgronomicasSuelo.and.resolveTo({ ...base, selectionReason: 'legacy_fallback' });
    await (component as any).cargarUmbralesAgronomicosSentek();
    expect(component.sentekAgronomicThresholds).toBeUndefined();
    expect(component.sentekAgronomicThresholdsUnavailable).toBeTrue();

    entradasAgronomicasSuelo.and.resolveTo({
      ...base,
      provenance: {
        fieldCapacityPercentage: {
          confidence: 'low',
          observedOrEstimated: 'estimated',
          source: 'soilgrids',
        },
      },
    });
    await (component as any).cargarUmbralesAgronomicosSentek();
    expect(component.sentekAgronomicThresholds).toBeUndefined();
    expect(component.sentekAgronomicThresholdsUnavailable).toBeTrue();

    entradasAgronomicasSuelo.and.rejectWith(new Error('API no disponible'));
    await (component as any).cargarUmbralesAgronomicosSentek();
    expect(component.sentekAgronomicThresholds).toBeUndefined();
    expect(component.sentekAgronomicThresholdsUnavailable).toBeTrue();
  });

  it('descarta una respuesta atrasada del lote anterior y redondea Gilardoni a 26.92', async () => {
    let resolveAnterior!: (value: any) => void;
    let resolveActual!: (value: any) => void;
    const anterior = new Promise<any>((resolve) => (resolveAnterior = resolve));
    const actual = new Promise<any>((resolve) => (resolveActual = resolve));
    const entradasAgronomicasSuelo = jasmine.createSpy().and.returnValues(anterior, actual);
    const component = new CardDispositivosComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { entradasAgronomicasSuelo } as any
    );
    const response = (loteId: string, fieldCapacityPercentage: number, wiltingPointPercentage: number) => ({
      depthLayers: [],
      fieldCapacityPercentage,
      loteId,
      provenance: {
        fieldCapacityPercentage: {
          confidence: 'low',
          observedOrEstimated: 'estimated',
          source: 'soilgrids',
        },
        wiltingPointPercentage: {
          confidence: 'low',
          observedOrEstimated: 'estimated',
          source: 'soilgrids',
        },
      },
      selectionPolicyVersion: 'soil-agronomic-selection-v1.0.0',
      selectionReason: 'automatic_assessment',
      stale: false,
      status: 'ready',
      wiltingPointPercentage,
    });

    component.lote = { _id: 'lote-anterior' } as any;
    const cargaAnterior = (component as any).cargarUmbralesAgronomicosSentek();
    component.lote = { _id: 'lote-actual' } as any;
    const cargaActual = (component as any).cargarUmbralesAgronomicosSentek();

    resolveActual(response('lote-actual', 33.34, 20.49));
    await cargaActual;
    expect(component.sentekAgronomicThresholds).toEqual(
      jasmine.objectContaining({
        capacidadCampoPct: 33.34,
        confianza: 'low',
        puntoMarchitezPct: 20.49,
        recargaPct: 26.92,
      })
    );

    resolveAnterior(response('lote-anterior', 40, 10));
    await cargaAnterior;
    expect(component.sentekAgronomicThresholds).toEqual(
      jasmine.objectContaining({ capacidadCampoPct: 33.34, puntoMarchitezPct: 20.49, recargaPct: 26.92 })
    );
  });

  it('acepta laboratorio confirmado aun cuando SoilGrids termino sin cobertura', async () => {
    const entradasAgronomicasSuelo = jasmine.createSpy().and.resolveTo({
      depthLayers: [],
      fieldCapacityPercentage: 31.2,
      loteId: 'lote-laboratorio',
      provenance: {
        fieldCapacityPercentage: {
          confidence: 'high',
          observedOrEstimated: 'observed',
          source: 'laboratory',
        },
        wiltingPointPercentage: {
          confidence: 'high',
          observedOrEstimated: 'observed',
          source: 'laboratory',
        },
      },
      selectionPolicyVersion: 'soil-agronomic-selection-v1.0.0',
      selectionReason: 'confirmed_laboratory',
      stale: false,
      status: 'no_coverage',
      wiltingPointPercentage: 15.4,
    });
    const component = new CardDispositivosComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { entradasAgronomicasSuelo } as any
    );
    component.lote = { _id: 'lote-laboratorio' } as any;

    await (component as any).cargarUmbralesAgronomicosSentek();

    expect(component.sentekAgronomicThresholds).toEqual(
      jasmine.objectContaining({
        capacidadCampoPct: 31.2,
        confianza: 'high',
        fuente: 'laboratory',
        origen: 'observed',
        puntoMarchitezPct: 15.4,
        recargaPct: 23.3,
      })
    );
    expect(component.sentekAgronomicThresholdsUnavailable).toBeFalse();
  });

  it('mantiene card, periodo, toolbar Sentek y SVG dentro del viewport', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [CardDispositivosComponent],
      providers: [
        { provide: HelperService, useValue: {} },
        { provide: ReporteService, useValue: { historico: jasmine.createSpy().and.resolveTo({ datos: [] }) } },
        { provide: LorawanUplinksService, useValue: { rawHistory: jasmine.createSpy().and.resolveTo([]) } },
        { provide: SiembraService, useValue: { agrometeorologia: jasmine.createSpy().and.resolveTo({ series: [] }) } },
        { provide: LoteService, useValue: { entradasAgronomicasSuelo: jasmine.createSpy().and.resolveTo(null) } },
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
            .filter((series: any) => series.options.custom?.['isSoil'])
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
