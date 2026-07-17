import { TestBed } from '@angular/core/testing';
import { IRespuestaAgrometeorologiaSiembra } from 'modelos/src';
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { CardFrioTermicoComponent } from './card-frio-termico.component';

describe('CardFrioTermicoComponent', () => {
  function create(agromet: IRespuestaAgrometeorologiaSiembra, reportes: any[] = []): CardFrioTermicoComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SiembraService,
          useValue: {
            agrometeorologia: jasmine.createSpy().and.resolveTo(agromet),
            reprocesarAgrometeorologia: jasmine.createSpy().and.resolveTo(agromet),
          },
        },
        {
          provide: ReporteService,
          useValue: {
            historico: jasmine.createSpy().and.resolveTo({ datos: reportes, total: reportes.length }),
          },
        },
      ],
    });
    return TestBed.runInInjectionContext(() => new CardFrioTermicoComponent());
  }

  function response(overrides: Partial<IRespuestaAgrometeorologiaSiembra> = {}): IRespuestaAgrometeorologiaSiembra {
    return {
      summary: {},
      dataSource: {
        type: 'open_meteo',
        completenessPercentage: 95,
      },
      series: [],
      warnings: [],
      calculationVersion: 'agromet-test',
      parametersVersion: 'params-test',
      ...overrides,
    };
  }

  it('se muestra para perennes y cereales vernalizantes, no para un anual térmico común', () => {
    const component = create(response());

    component.siembra = { semilla: { cultivo: 'Manzano' } } as any;
    expect(component.mostrar).toBeTrue();

    component.siembra = { semilla: { cultivo: 'Trigo' } } as any;
    expect(component.mostrar).toBeTrue();

    component.siembra = { semilla: { cultivo: 'Maiz' } } as any;
    expect(component.mostrar).toBeFalse();
  });

  it('muestra acumulado, objetivo y avance de cada modelo sin convertir unidades', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'dormancia_perenne',
          coldSeasonStart: '2026-05-01',
          coldThroughDate: '2026-07-16',
          chillingHoursAccumulated: 503.2,
          utahChillUnitsAccumulated: 471.4,
          chillPortionsAccumulated: 21.21,
          gddAccumulated: 3394.3,
          gddAccumulationComplete: true,
          gddBaseTemperatureC: 7,
          coldRequirement: {
            model: 'HF',
            status: 'validado',
            source: 'Ficha varietal',
            target: 750,
            accumulated: 503.2,
            progressPercentage: 67.1,
            compatible: false,
            interpretation: 'en_acumulacion',
          },
        },
      })
    );
    component.siembra = {
      _id: 'perenne-modelos',
      semilla: {
        cultivo: 'Peral',
        variedad: 'Rocha',
        requerimientoFrio: {
          horasFrio: 750,
          porcionesFrio: 45,
          horasFrioEfectivas: 630,
          modeloRector: 'HF',
          estado: 'validado',
          fuente: 'Ficha varietal',
        },
      },
    } as any;

    await component.cargar();

    expect(component.objetivosFrio.map((item) => item.label)).toEqual([
      'Horas de frío',
      'Porciones de frío',
      'Frío efectivo histórico',
    ]);
    expect(component.objetivosFrio.find((item) => item.key === 'HF')).toEqual(
      jasmine.objectContaining({ accumulated: 503.2, target: 750, decisionReady: true })
    );
    expect(component.objetivosFrio.find((item) => item.key === 'CP')).toEqual(
      jasmine.objectContaining({ accumulated: 21.21, target: 45, decisionReady: false })
    );
    expect(component.metricas[0].label).toBe('GDD de forzado');
    expect(component.gddLabel).toBe('3.394,3 GDD');
    expect(component.periodoFrioLabel).toContain('01-may');
    expect(component.periodoFrioLabel).not.toContain('30-abr');
  });

  it('mantiene LoRa visible con calidad, cobertura y valores separados de la serie canónica', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'dormancia_perenne',
          chillingHoursAccumulated: 480,
          chillPortionsAccumulated: 18.2,
          fieldCold: {
            quality: 'reference',
            sensorNames: ['CUADRO 7 Sensor 3'],
            chillingHoursAccumulated: 503.21,
            chillPortionsAccumulated: 21.21,
            temperatureCoveragePercentage: 67,
            maximumGapHours: 18,
            continuitySufficient: false,
            interpretation: 'reference_not_calibrated',
          },
        },
      })
    );
    component.siembra = {
      _id: 'perenne-lora',
      semilla: {
        cultivo: 'Peral',
        variedad: 'Rocha',
        requerimientoFrio: {
          horasFrio: 750,
          porcionesFrio: 45,
          horasFrioEfectivas: 630,
          estado: 'requiere_calibracion',
          fuente: 'Base técnica interna',
        },
      },
    } as any;
    component.lote = {
      dispositivos: [
        {
          _id: 'sensor-1',
          nombre: 'CUADRO 7 Sensor 3',
          sensores: ['Temperatura', 'Humedad'],
          frioAcumulado: {
            horasFrioEfectivas: 593.82,
            estadoCalculo: 'legacy',
          },
        },
      ],
    } as any;

    await component.cargar();

    expect(component.usaSensorFrio).toBeTrue();
    expect(component.calidadFrioLabel).toContain('referencia');
    expect(component.calidadFrioDetalle).toContain('67%');
    expect(component.calidadFrioDetalle).toContain('no mueve GDD');
    const horas = component.objetivosFrio.find((item) => item.key === 'HF');
    expect(horas?.accumulated).toBe(480);
    expect(horas?.target).toBe(750);
    expect(horas?.fieldComparison).toContain('503 HF');
    expect(horas?.fieldComparison).toContain('cobertura 67%');
    const porciones = component.objetivosFrio.find((item) => item.key === 'CP');
    expect(porciones?.accumulated).toBe(18.2);
    expect(porciones?.fieldComparison).toContain('21,21 CP');
    const hfe = component.objetivosFrio.find((item) => item.key === 'HFE');
    expect(hfe).toEqual(jasmine.objectContaining({ accumulated: 593.82, target: 630, decisionReady: false }));
  });

  it('mantiene visibles las horas frío del dispositivo mientras el canónico se reprocesa', async () => {
    const component = create(response({ summary: {} }));
    component.siembra = {
      _id: 'perenne-preview-lora',
      semilla: { cultivo: 'Peral' },
    } as any;
    component.lote = {
      dispositivos: [
        {
          _id: 'sensor-preview',
          nombre: 'CUADRO 7 Sensor 3',
          sensores: ['Temperatura', 'Humedad'],
          frioAcumulado: {
            horasFrio: 503.21,
            fechaInicio: '2026-01-01T00:00:00.000Z',
            fechaUltimoCalculo: '2026-07-11T03:03:42.903Z',
            legacy: {
              frio: {
                raw: {
                  horasFrioEfectivas: 593.82,
                  porcionesFrio: 21.21,
                },
              },
            },
          },
        },
      ],
    } as any;

    await component.cargar();

    expect(component.lecturaPrincipal).toContain('propia unidad');
    expect(component.calidadFrioLabel).toContain('pendiente de reproceso');
    expect(component.objetivosFrio.find((item) => item.key === 'HF')?.accumulated).toBe(503.21);
    expect(component.objetivosFrio.find((item) => item.key === 'HFE')?.accumulated).toBe(593.82);
    expect(component.objetivosFrio.find((item) => item.key === 'CP')?.accumulated).toBe(21.21);
  });

  it('muestra rangos científicos como referencia visual sin volverlos decisión automática', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'dormancia_perenne',
          chillingHoursAccumulated: 520,
          chillPortionsAccumulated: 31,
        },
      })
    );
    component.siembra = {
      _id: 'manzano-rosy-glow-catalogo',
      semilla: { cultivo: 'Manzano', variedad: 'Rosy Glow', portainjerto: 'EM-04' },
    } as any;

    await component.cargar();

    expect(component.fichaTermica?.coincidencia).toBe('alias_varietal');
    const cp = component.objetivosFrio.find((item) => item.key === 'CP');
    expect(cp).toEqual(
      jasmine.objectContaining({ targetMin: 52, targetMax: 73.3, targetLabel: '52,0–73,3 CP', decisionReady: false })
    );
    expect(cp?.targetSource).toContain('Apple dormancy');
  });

  it('explica que el GDD de un peral aún no comenzó cuando falta el biofix de forzado', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'dormancia_perenne',
          gddAccumulationComplete: false,
          gddBaseTemperatureC: 7,
        },
      })
    );
    component.siembra = {
      _id: 'peral-sin-biofix',
      semilla: { cultivo: 'Peral', variedad: 'Rocha' },
      registrosFenologicos: [],
    } as any;

    await component.cargar();

    expect(component.gddLabel).toBe('0 GDD');
    expect(component.gddEstadoLabel).toBe('Aún no iniciados');
    expect(component.gddDetalle).toContain('biofix');
    expect(component.gddDetalle).toContain('Tb 7,0 °C');
  });

  it('reprocesa la serie al actualizar en lugar de releer una generación vieja', async () => {
    const agromet = response({ summary: { thermalProcess: 'dormancia_perenne' } });
    const component = create(agromet);
    const service = TestBed.inject(SiembraService) as any;
    component.siembra = { _id: 'perenne-refresh', semilla: { cultivo: 'Peral' } } as any;

    await component.cargar(true);

    expect(service.reprocesarAgrometeorologia).toHaveBeenCalledOnceWith('perenne-refresh', true);
    expect(service.agrometeorologia).not.toHaveBeenCalled();
  });

  it('presenta vernalización cereal sin llamarla horas de frío de frutales', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'vernalizacion_anual',
          parametersSource: 'Ficha varietal trigo invierno',
          vernalizationHabit: 'invernal',
          vernalizationRequirement: 40,
          vernalizationAccumulated: 12.25,
          vernalizationTemperatureCoveragePct: 92,
          vernalizationInterpretation: 'en_acumulacion',
          gddAccumulated: 21.6,
          gddAccumulationComplete: true,
          gddThroughDate: '2026-06-02',
          gddBaseTemperatureC: 0,
          gddUpperTemperatureC: 30,
        },
        series: [
          {
            date: '2026-06-01',
            isForecast: false,
            metrics: { gddDaily: 10.5 },
          },
          {
            date: '2026-06-02',
            isForecast: false,
            metrics: { gddDaily: 11.1 },
          },
        ] as any,
      })
    );
    component.siembra = {
      _id: 'trigo-vernal',
      fechaSiembra: '2026-06-01',
      semilla: { cultivo: 'Trigo' },
    } as any;

    await component.cargar();

    expect(component.lecturaPrincipal).toContain('no se confunde');
    expect(component.metricas[0].label).toBe('Vernalización varietal');
    expect(component.metricas[0].value).toBe('12,25 días eq.');
    expect(component.metricas.some((metric) => metric.label.includes('Horas de frío'))).toBeFalse();
    expect(component.periodoFrioLabel).toContain('desde la siembra 01-jun');
    expect(component.periodoFrioLabel).toContain('2 jornadas computadas');
    expect(component.periodoFrioLabel).not.toContain('Temporada de frío');
    expect(component.gddDetalle).toContain('media 10,8 GDD/día');
    expect(component.estadoEspecificacionLabel).toBe('Vernalización varietal en calibración');
  });

  it('audita 496,8 GDD de cebada en 46 jornadas sin inventar vernalización varietal', async () => {
    const series = Array.from({ length: 46 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10);
      return {
        date,
        isForecast: false,
        metrics: { gddDaily: 10.8, gddAccumulated: (index + 1) * 10.8 },
      };
    }) as any;
    const component = create(
      response({
        summary: {
          thermalProcess: 'vernalizacion_anual',
          parametersSource: 'Perfil de cultivo Cebada; calibrar por variedad',
          gddAccumulated: 496.8,
          gddAccumulationComplete: true,
          gddThroughDate: '2026-07-16',
          gddBaseTemperatureC: 0,
          gddUpperTemperatureC: 30,
        },
        series,
      })
    );
    component.siembra = {
      _id: 'cebada-andreia-auditoria',
      fechaSiembra: '2026-06-01',
      semilla: { cultivo: 'Cebada', variedad: 'ANDREIA' },
    } as any;

    await component.cargar();

    expect(component.gddLabel).toBe('496,8 GDD');
    expect(component.diasGddComputados).toBe(46);
    expect(component.gddPromedioDiario).toBeCloseTo(10.8, 6);
    expect(component.periodoFrioLabel).toContain('46 jornadas computadas');
    expect(component.estadoEspecificacionLabel).toContain('falta calibración varietal');
    expect(component.lecturaPrincipal).toContain('no se declara requisito de vernalización');
    expect(component.metricas.map((metric) => metric.label)).toEqual(['Grados día']);
  });

  it('reconoce un dispositivo ambiental aunque su acumulado legacy no esté embebido', () => {
    const component = create(response());
    component.siembra = { semilla: { cultivo: 'Pecan' } } as any;
    component.lote = {
      dispositivos: [
        {
          _id: 'sensor-ambiente',
          nombre: 'Sensor ambiente',
          sensores: ['Temperatura', 'Humedad'],
        },
      ],
    } as any;

    expect(component.dispositivoFrio?.nombre).toBe('Sensor ambiente');
    expect(component.usaSensorFrio).toBeTrue();
  });
});
