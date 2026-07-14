import { IRespuestaAgrometeorologiaSiembra } from 'modelos/src';
import { TestBed } from '@angular/core/testing';
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
    summary: { gddAccumulated: 125, rainAccumulatedMm: 32, vpdMeanKpa: 0.8 },
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
        metrics: { temperatureMinC: 8, temperatureMeanC: 14, temperatureMaxC: 20, gddAccumulated: 5 },
        source: 'open_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        warnings: [],
      },
      {
        date: '2026-07-14',
        isForecast: true,
        stage: 'Emergencia',
        weather: {},
        metrics: { temperatureMinC: 9, temperatureMeanC: 15, temperatureMaxC: 21, gddAccumulated: 10 },
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

  it('lee datos persistidos y distingue estimado de pronostico', async () => {
    const service = { agrometeorologia: jasmine.createSpy().and.resolveTo(response()) };
    const component = create(service);
    component.siembra = { _id: 'siembra-1', fechaSiembra: '2026-05-01' } as any;
    await component.cargar();
    expect(service.agrometeorologia).toHaveBeenCalled();
    expect(component.fuenteLabel).toBe('Open-Meteo');
    expect(component.estadosSerie).toEqual(['Estimado', 'Pronostico']);
    expect(component.chartOptions?.series?.length).toBeGreaterThan(3);
  });

  it('informa correctamente una fuente mixta con central', async () => {
    const data = response({
      dataSource: {
        type: 'mixed',
        stationName: 'Central norte',
        completenessPercentage: 88,
      },
    });
    const service = { agrometeorologia: jasmine.createSpy().and.resolveTo(data) };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;
    await component.cargar();
    expect(component.fuenteLabel).toContain('Central norte');
    expect(component.fuenteLabel).toContain('Open-Meteo');
  });

  it('tolera respuesta vacia y variables opcionales ausentes', async () => {
    const data = response({ series: [], summary: {} });
    const service = { agrometeorologia: jasmine.createSpy().and.resolveTo(data) };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;
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
    component.siembra = { _id: 'siembra-1' } as any;
    await component.cargar();
    expect(component.data).toBeUndefined();
    expect(component.error).toContain('temporalmente');
  });
});
