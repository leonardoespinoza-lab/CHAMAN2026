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
    expect(component.fuenteDetail).toContain('cobertura de variables');
    expect(component.historialLabel).toBe('Reanalisis modelado');
    expect(component.metricas[0].detail).toContain('13 jul');
    expect(component.metricas[0].detail).toContain('Tb 0 C');
    expect(component.sueloSubtitle).toContain('no reemplaza una sonda');
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

  it('identifica sensores de campo y su cobertura sin ocultar el respaldo', async () => {
    const data = response({
      dataSource: {
        type: 'mixed',
        sources: ['sensor', 'open_meteo'],
        sensorNames: ['K-01'],
        completenessPercentage: 91,
        fieldCoveragePercentage: 72,
        lastObservationAt: '2020-07-11T09:00:00.000Z',
        lastCalculatedAt: '2026-07-16T15:00:00.000Z',
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;

    await component.cargar();

    expect(component.fuenteLabel).toContain('K-01');
    expect(component.fuenteLabel).toContain('Open-Meteo');
    expect(component.fuenteDetail).toContain('campo 72%');
    expect(component.fuenteDetail).toContain('ultima lectura de campo');
    expect(component.fuenteDetail).toContain(
      'respaldo automatico activo',
    );
  });

  it('muestra el frio LoRa de referencia sin presentarlo como decision varietal', async () => {
    const data = response({
      summary: {
        thermalProcess: 'dormancia_perenne',
        fieldCold: {
          quality: 'reference',
          sensorNames: ['K-01'],
          throughDate: '2026-07-11',
          lastObservationAt: '2026-07-11T22:30:00.000Z',
          modelVersion: 'frio-termico-1.0.0',
          chillingHoursAccumulated: 289.1,
          utahChillUnitsAccumulated: 310.5,
          chillPortionsAccumulated: 22.15,
          temperatureCoveragePercentage: 67,
          maximumGapHours: 114,
          continuitySufficient: false,
          interpretation: 'reference_not_calibrated',
        },
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-kleppe' } as any;

    await component.cargar();

    expect(component.frioCampoEstadoLabel).toBe(
      'Referencia no calibrada',
    );
    expect(component.frioCampoSensoresLabel).toBe('K-01');
    expect(component.frioCampoMetricas.map((item) => item.value)).toEqual([
      '289,1 HF',
      '310,5 UF',
      '22,15 CP',
    ]);
    expect(component.frioCampoMetricas[2].detail).toContain(
      'cota inferior',
    );
    expect(component.frioCampoCalidadDetalle).toContain('67% cobertura');
    expect(component.frioCampoCalidadDetalle).toContain(
      'brecha maxima 114 h',
    );
    expect(component.frioCampoAclaracion).toContain('no mueve GDD');
    expect(component.frioCampoAclaracion).toContain('requisito varietal');
  });

  it('identifica un sensor de frio calificado pero explicita cobertura insuficiente', async () => {
    const data = response({
      summary: {
        thermalProcess: 'dormancia_perenne',
        fieldCold: {
          quality: 'qualified',
          sensorNames: ['K-02'],
          chillingHoursAccumulated: 400,
          temperatureCoveragePercentage: 70,
          maximumGapHours: 12,
          continuitySufficient: false,
          interpretation: 'insufficient_data',
        },
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-calificada' } as any;

    await component.cargar();

    expect(component.frioCampoEstadoLabel).toContain('Sensor calificado');
    expect(component.frioCampoEstadoLabel).toContain('datos incompletos');
    expect(component.frioCampoAclaracion).toContain(
      'no alcanza para una interpretacion biologica completa',
    );
  });

  it('muestra vernalizacion como no calibrada y no inventa unidades', async () => {
    const data = response({
      summary: {
        gddAccumulated: 125,
        thermalProcess: 'vernalizacion_anual',
        parametersStatus: 'requiere_calibracion',
        vernalizationHabit: 'desconocido',
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;

    await component.cargar();

    expect(component.metricas[0]).toEqual(
      jasmine.objectContaining({
        label: 'Vernalizacion varietal',
        value: 'Sin calibrar',
      })
    );
    expect(component.metricas[0].detail).toContain('no confirmado');
    expect(component.mostrarFrio).toBeFalse();
  });

  it('expone la calidad y las brechas de la ventana de vernalizacion', async () => {
    const data = response({
      summary: {
        thermalProcess: 'vernalizacion_anual',
        parametersStatus: 'validado',
        vernalizationStatus: 'validado',
        vernalizationHabit: 'invernal',
        vernalizationModel: 'ventana_calibrada',
        vernalizationRequirement: 40,
        vernalizationAccumulated: 12.25,
        vernalizationWindowStart: '2026-05-12',
        vernalizationTemperatureCoveragePct: 72,
        vernalizationMaximumGapHours: 14,
        vernalizationContinuitySufficient: false,
        vernalizationInterpretation: 'datos_insuficientes',
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;

    await component.cargar();

    expect(component.metricas[0].value).toContain('dias eq.');
    expect(component.metricas[0].detail).toContain('72% de cobertura');
    expect(component.metricas[0].detail).toContain('brecha maxima 14 h');
    expect(component.metricas[0].detail).toContain(
      'los dias incompletos no suman exposicion',
    );
  });

  it('muestra la ventana calibrada sin mover etapas automaticamente', async () => {
    const data = response({
      summary: {
        thermalProcess: 'vernalizacion_anual',
        parametersStatus: 'validado',
        vernalizationStatus: 'validado',
        vernalizationHabit: 'invernal',
        vernalizationModel: 'ventana_calibrada',
        vernalizationRequirement: 40,
        vernalizationAccumulated: 18.5,
        vernalizationWindowStart: '2026-05-12',
        vernalizationWindowEnd: '2026-07-02',
        vernalizationTemperatureCoveragePct: 96,
        vernalizationMaximumGapHours: 2,
        vernalizationContinuitySufficient: true,
        vernalizationInterpretation: 'ventana_cerrada',
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;

    await component.cargar();

    expect(component.metricas[0]).toEqual(
      jasmine.objectContaining({
        label: 'Vernalizacion varietal',
      }),
    );
    expect(component.metricas[0].detail).toContain('objetivo 40');
    expect(component.metricas[0].detail).toContain('96% cobertura');
    expect(component.metricas[0].detail).toContain(
      'no mueve etapas sin confirmacion de campo',
    );
  });

  it('separa acumulacion climatica de un requisito varietal sin calibrar', async () => {
    const data = response({
      summary: {
        thermalProcess: 'dormancia_perenne',
        chillingHoursAccumulated: 620,
        chillPortionsAccumulated: 31.4,
        coldRequirement: {
          model: 'sin_calibrar',
          status: 'requiere_calibracion',
          interpretation: 'sin_calibrar',
        },
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;

    await component.cargar();

    expect(component.metricas[0]).toEqual(
      jasmine.objectContaining({
        label: 'Requisito varietal',
        value: 'Sin calibrar',
      })
    );
    expect(component.metricas[0].detail).toContain(
      'no se declara cumplimiento biologico'
    );
  });

  it('presenta compatibilidad climatica sin confirmar automaticamente la etapa', async () => {
    const data = response({
      summary: {
        thermalProcess: 'dormancia_perenne',
        chillingHoursAccumulated: 940,
        coldRequirement: {
          model: 'HF',
          status: 'validado',
          source: 'Ficha varietal validada',
          target: 900,
          accumulated: 940,
          progressPercentage: 104.4,
          compatible: true,
          interpretation: 'compatible_requiere_confirmacion',
        },
      },
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;

    await component.cargar();

    expect(component.metricas[0].value).toBe('104%');
    expect(component.metricas[0].detail).toContain(
      'confirmar inicio de etapa a campo'
    );
  });

  it('prioriza Datos insuficientes sobre flags heredados de avance y compatibilidad', async () => {
    const data = response({
      summary: {
        thermalProcess: 'dormancia_perenne',
        chillingHoursAccumulated: 940,
        coldRequirement: {
          model: 'HF',
          status: 'validado',
          source: 'Ficha varietal validada',
          target: 900,
          accumulated: 940,
          progressPercentage: 104.4,
          compatible: true,
          interpretation: 'datos_insuficientes',
        },
      } as any,
    });
    const service = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(data),
    };
    const component = create(service);
    component.siembra = { _id: 'siembra-1' } as any;

    await component.cargar();

    const metrica = component.metricas.find(
      (item) => item.label === 'Requisito varietal'
    );
    const lectura = `${metrica?.value || ''} ${metrica?.detail || ''}`;

    expect(metrica?.value).toBe('Datos insuficientes');
    expect(metrica?.detail).toContain('Datos insuficientes');
    expect(lectura.toLowerCase()).not.toContain('compatible');
    expect(lectura.toLowerCase()).not.toMatch(/\bcumplid[oa]s?\b/);
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
