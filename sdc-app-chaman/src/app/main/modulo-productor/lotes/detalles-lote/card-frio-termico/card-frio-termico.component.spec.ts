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

  it('separa los tres modelos de dormancia y explicita el requisito rector', async () => {
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
      semilla: { cultivo: 'Peral' },
    } as any;

    await component.cargar();

    expect(component.metricas.map((metric) => metric.label)).toEqual(
      jasmine.arrayContaining([
        'Requisito varietal rector',
        'Horas de frío (HF)',
        'Unidades Utah',
        'Porciones de frío',
        'Grados día',
      ])
    );
    expect(component.metricas.find((metric) => metric.label === 'Horas de frío (HF)')?.value).toBe('503,2 HF');
    expect(component.metricas.find((metric) => metric.label === 'Porciones de frío')?.value).toBe('21,21 CP');
    expect(component.periodoFrioLabel).toContain('01-may');
    expect(component.periodoFrioLabel).not.toContain('30-abr');
  });

  it('mantiene LoRa visible con calidad, cobertura y valores separados de la serie canónica', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'dormancia_perenne',
          chillingHoursAccumulated: 480,
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
      semilla: { cultivo: 'Peral' },
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
    const horasLora = component.metricas.find((metric) => metric.label === 'Horas frío medidas por LoRa (HF)');
    expect(horasLora?.value).toBe('503,2 HF');
    expect(horasLora?.detail).toContain('67% de horas cubiertas');
    expect(horasLora?.detail).toContain('acumulado parcial por brechas');
    expect(component.metricas.find((metric) => metric.label === 'Utah sobre lecturas LoRa')).toBeDefined();
    expect(component.metricas.find((metric) => metric.label === 'Frío efectivo (HFE ref.)')?.detail).toContain(
      'no gobierna decisiones'
    );
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

    expect(component.lecturaPrincipal).toContain('modelos independientes');
    expect(component.calidadFrioLabel).toContain('pendiente de reproceso');
    expect(component.metricas.find((metric) => metric.label.includes('vista previa'))?.value).toBe('503,21 HF');
    expect(component.metricas.find((metric) => metric.label.includes('HFE hist.'))?.value).toBe('593,82 HFE');
    expect(component.metricas.find((metric) => metric.label.includes('Porciones históricas'))?.value).toBe('21,21 CP');
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
          gddAccumulationComplete: false,
        },
      })
    );
    component.siembra = {
      _id: 'trigo-vernal',
      semilla: { cultivo: 'Trigo' },
    } as any;

    await component.cargar();

    expect(component.lecturaPrincipal).toContain('no se confunde');
    expect(component.metricas[0].label).toBe('Vernalización varietal');
    expect(component.metricas[0].value).toBe('12,25 días eq.');
    expect(component.metricas.some((metric) => metric.label.includes('Horas de frío'))).toBeFalse();
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
