import { TestBed } from '@angular/core/testing';
import { IRespuestaAgrometeorologiaSiembra } from 'modelos/src';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { CardCalculosMeteorologicosComponent } from './card-calculos-meteorologicos.component';

describe('CardCalculosMeteorologicosComponent', () => {
  function create(service: any): CardCalculosMeteorologicosComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SiembraService, useValue: service }],
    });
    return TestBed.runInInjectionContext(() => new CardCalculosMeteorologicosComponent());
  }

  const response = (overrides: Partial<IRespuestaAgrometeorologiaSiembra> = {}): IRespuestaAgrometeorologiaSiembra => ({
    summary: {
      gddAccumulated: 125,
      gddThroughDate: '2026-07-13',
      gddBaseTemperatureC: 0,
      gddUpperTemperatureC: 26,
      rainAccumulatedMm: 32,
      vpdMeanKpa: 0.8,
    },
    dataSource: {
      type: 'open_meteo',
      completenessPercentage: 92,
      lastCalculatedAt: '2026-07-13T15:00:00.000Z',
    },
    series: [
      {
        date: '2026-07-12',
        isForecast: false,
        stage: 'Emergencia',
        weather: {},
        metrics: {
          temperatureMinC: 8,
          temperatureMeanC: 14,
          temperatureMaxC: 20,
          gddAccumulated: 5,
          rootZoneSoilMoistureM3M3: 0.2,
        },
        source: 'open_meteo',
        sourceByVariable: { soilMoistureM3M3: 'derived_open_meteo' },
        qualityFlags: [],
        warnings: [],
      },
      {
        date: '2026-07-14',
        isForecast: true,
        stage: 'Emergencia',
        weather: {},
        metrics: {
          temperatureMinC: 9,
          temperatureMeanC: 15,
          temperatureMaxC: 21,
          gddAccumulated: 10,
        },
        source: 'open_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        warnings: [],
      },
    ],
    warnings: [],
    calculationVersion: 'agromet-v1',
    parametersVersion: 'params-v1',
    ...overrides,
  });

  it('lee datos persistidos y distingue estimado de pronóstico', async () => {
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(response()),
    };
    const component = create(service);
    component.siembra = {
      _id: 'siembra-1',
      fechaSiembra: '2026-05-01',
    } as any;

    await component.cargar();

    expect(service.agrometeorologia).toHaveBeenCalled();
    expect(component.fuenteLabel).toBe('Open-Meteo');
    expect(component.estadosSerie).toEqual(['Estimado', 'Pronostico']);
    expect(component.chartOptions?.series?.length).toBeGreaterThan(3);
    expect(component.fuenteDetail).toContain('cobertura de variables');
    expect(component.historialLabel).toBe('Reanalisis modelado');
    expect(component.metricas[0].detail).toContain('13 jul');
    expect(component.metricas[0].detail).toContain('Tb 0 C');
    expect(component.sueloSubtitle).toContain('no reemplaza una sonda');
  });

  it('informa correctamente una fuente mixta con central', async () => {
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(
        response({
          dataSource: {
            type: 'mixed',
            stationName: 'Central norte',
            completenessPercentage: 88,
          },
        })
      ),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-central' } as any;

    await component.cargar();

    expect(component.fuenteLabel).toContain('Central norte');
    expect(component.fuenteLabel).toContain('Open-Meteo');
  });

  it('identifica sensores de campo y su cobertura sin ocultar el respaldo', async () => {
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(
        response({
          dataSource: {
            type: 'mixed',
            sources: ['sensor', 'open_meteo'],
            sensorNames: ['K-01'],
            completenessPercentage: 91,
            fieldCoveragePercentage: 72,
            lastObservationAt: '2026-07-11T09:00:00.000Z',
            lastCalculatedAt: '2026-07-16T15:00:00.000Z',
          },
        })
      ),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-sensor' } as any;

    await component.cargar();

    expect(component.fuenteLabel).toContain('K-01');
    expect(component.fuenteLabel).toContain('Open-Meteo');
    expect(component.fuenteDetail).toContain('campo 72%');
    expect(component.fuenteDetail).toContain('respaldo automatico activo');
  });

  it('no mezcla frío, porciones ni vernalización en la tarjeta meteorológica', async () => {
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(
        response({
          summary: {
            gddAccumulated: 125,
            thermalProcess: 'dormancia_perenne',
            chillingHoursAccumulated: 620,
            chillPortionsAccumulated: 31.4,
            vernalizationAccumulated: 12,
          },
        })
      ),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-separada' } as any;

    await component.cargar();

    expect(component.graficos.map((item) => item.value)).not.toContain('frio' as any);
    expect(component.metricas.map((item) => item.label).join(' ')).not.toMatch(/frio|porciones|vernalizacion/i);
  });

  it('no confunde un GDD perenne pendiente de biofix con una falla de datos', async () => {
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(
        response({
          summary: {
            thermalProcess: 'dormancia_perenne',
            gddAccumulationComplete: false,
            gddBaseTemperatureC: 7,
          },
        })
      ),
    };
    const component = create(service);
    component.siembra = {
      _id: 'peral-sin-biofix',
      semilla: { cultivo: 'Peral', variedad: 'Rocha' },
      registrosFenologicos: [],
    } as any;

    await component.cargar();

    expect(component.metricas[0].label).toBe('GDD de forzado');
    expect(component.metricas[0].value).toBe('0 GDD');
    expect(component.metricas[0].detail).toContain('biofix');
  });

  it('tolera respuesta vacía y variables opcionales ausentes', async () => {
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(response({ series: [], summary: {} })),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-vacia' } as any;

    await component.cargar();

    expect(component.hayDatos).toBeFalse();
    expect(component.mostrarSuelo).toBeFalse();
    expect(component.chartOptions).toBeUndefined();
  });

  it('expone un error recuperable sin conservar una serie anterior', async () => {
    const service = {
      agrometeorologia: jasmine
        .createSpy()
        .and.rejectWith({ error: { message: 'Servicio temporalmente no disponible' } }),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-error' } as any;

    await component.cargar();

    expect(component.data).toBeUndefined();
    expect(component.error).toContain('temporalmente');
  });

  it('ignora una respuesta tardia del lote anterior al cambiar de siembra', async () => {
    let rejectOld!: (reason: unknown) => void;
    let resolveCurrent!: (value: IRespuestaAgrometeorologiaSiembra) => void;
    const oldRequest = new Promise<IRespuestaAgrometeorologiaSiembra>((_resolve, reject) => {
      rejectOld = reject;
    });
    const currentResponse = response({
      dataSource: { type: 'open_meteo', completenessPercentage: 99 },
    });
    const currentRequest = new Promise<IRespuestaAgrometeorologiaSiembra>((resolve) => {
      resolveCurrent = resolve;
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.callFake((id: string) =>
        id === 'siembra-anterior' ? oldRequest : currentRequest
      ),
    };
    const component = create(service);

    component.siembra = { _id: 'siembra-anterior' } as any;
    const staleLoad = component.cargar();
    component.siembra = { _id: 'siembra-actual' } as any;
    const currentLoad = component.cargar();
    resolveCurrent(currentResponse);
    await currentLoad;
    rejectOld({ error: { message: 'No tiene permiso para ver esta siembra' } });
    await staleLoad;

    expect(component.data).toBe(currentResponse);
    expect(component.error).toBeUndefined();
    expect(component.fuenteDetail).toContain('99%');
  });
});
