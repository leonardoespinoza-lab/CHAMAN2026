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

  it('presenta trigo como acumulacion termica sin mensajes de frio frutal ni calibracion ficticia', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'vernalizacion_anual',
          gddAccumulated: 808,
          gddBaseTemperatureC: 0,
          gddUpperTemperatureC: 26,
          gddThroughDate: '2026-07-16',
        },
      })
    );
    component.siembra = {
      _id: 'trigo-aca-603',
      fechaSiembra: '2026-05-05T03:00:00.000Z',
      semilla: { cultivo: 'Trigo', variedad: 'ACA 603' },
    } as any;

    await component.cargar();

    expect(component.tituloTarjeta).toBe('ACUMULACIÓN TÉRMICA');
    expect(component.tituloEvolucion).toBe('Evolución del tiempo térmico');
    expect(component.estadoEspecificacionLabel).toBe('GDD de referencia del cultivo · no interpreta etapa varietal');
    expect(component.calidadFrioLabel).toContain('Serie térmica canónica');
    expect(component.calidadFrioLabel).not.toContain('frío');
    expect(component.calidadFrioDetalle).toContain('no usa HF, HFE ni Porciones de Frío de frutales');
  });

  it('muestra los acumulados observados sin convertirlos en objetivos varietales', async () => {
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

    expect(component.estadoEspecificacionLabel).toBe('Registro observado · sin objetivo prefijado');
    expect(component.metricas.map((item) => item.label)).toEqual([
      'Horas de frío (HF)',
      'Unidades Utah',
      'Porciones de frío',
      'GDD de forzado',
    ]);
    expect(component.metricas[0].value).toBe('503,2 HF');
    expect(component.metricas[1].value).toBe('471,4 UF');
    expect(component.metricas[2].value).toBe('21,21 CP');
    expect(component.gddLabel).toBe('3.394,3 GDD');
    expect(component.periodoFrioLabel).toContain('01-may');
    expect(component.periodoFrioLabel).not.toContain('30-abr');
  });

  it('ancla Pecan Kiowa en Dormancia del 1-may sin validar objetivos legacy', async () => {
    const component = create(
      response({
        summary: {
          thermalProcess: 'dormancia_perenne',
          coldSeasonStart: '2026-05-01',
          coldThroughDate: '2026-08-10',
          chillingHoursAccumulated: 303,
          utahChillUnitsAccumulated: -46.5,
          chillPortionsAccumulated: 17.28,
          gddAccumulationComplete: false,
          gddBaseTemperatureC: 10,
        },
      })
    );
    component.siembra = {
      _id: 'pecan-kiowa-campania-2026',
      fechaSiembra: '2020-08-15T12:00:00.000Z',
      semilla: {
        cultivo: 'Pecan',
        variedad: 'Kiowa',
        requerimientoFrio: {
          horasFrio: 1750,
          horasFrioEfectivas: 1435,
          porcionesFrio: 117,
          estado: 'requiere_calibracion',
          fuente: 'Legacy Chaman',
        },
      },
      registrosFenologicos: [
        {
          id: 'inicio-dormancia-kiowa',
          etapa: 'Dormancia',
          tipoEvento: 'inicio_etapa',
          accion: 'inicio',
          fecha: '2026-05-01T12:00:00.000Z',
          fechaInicioEtapa: '2026-05-01T12:00:00.000Z',
          campania: '2025/2026',
          confianza: 'alta',
        },
      ],
    } as any;

    await component.cargar();

    expect(component.periodoFrioLabel).toContain('Temporada de frío observada desde 01-may');
    expect(component.estadoEspecificacionLabel).toBe('Registro observado · sin objetivo prefijado');
    expect(component.metricas.map((item) => item.value)).toContain('303,0 HF');
    expect(component.metricas.map((item) => item.value)).toContain('-46,5 UF');
    expect(component.metricas.map((item) => item.value)).toContain('17,28 CP');
    expect(component.metricas.map((item) => item.value).join(' ')).not.toContain('1.750');
    expect(component.metricas.map((item) => item.value).join(' ')).not.toContain('1.435');
    expect(component.metricas.map((item) => item.value).join(' ')).not.toContain('117');
    expect(component.fichaTermica?.ficha.permiteObjetivoAutomatico).toBeFalse();
    expect(component.referenciasTermicasFicha.every((referencia) => referencia.estado !== 'publicada')).toBeTrue();
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
    expect(component.calidadFrioLabel).toContain('prioritario');
    expect(component.calidadFrioDetalle).toContain('67%');
    expect(component.calidadFrioDetalle).toContain('integran el motor canónico');
    expect(component.metricas.find((item) => item.label === 'Horas de frío (HF)')?.value).toBe('480,0 HF');
    expect(component.metricas.find((item) => item.label === 'Porciones de frío')?.value).toBe('18,20 CP');
    expect(component.metricas.find((item) => item.label === 'Horas de frío (HF)')?.source).toContain(
      'CUADRO 7 Sensor 3 prioritario'
    );
    expect(component.metricas.some((item) => item.label.toLowerCase().includes('legacy'))).toBeFalse();
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

    expect(component.lecturaPrincipal).toContain('unidad, fuente y cobertura');
    expect(component.calidadFrioLabel).toContain('pendiente de reproceso');
    expect(component.metricas.find((item) => item.label === 'Horas frío del sensor (vista previa)')?.value).toBe(
      '503,21 HF'
    );
    expect(component.metricas.map((item) => item.label)).toEqual([
      'Horas frío del sensor (vista previa)',
      'GDD de forzado',
    ]);
  });

  it('permite leer la evolución acumulada y los aportes diarios, incluidos descuentos Utah', async () => {
    const dias = [
      {
        date: '2026-05-01',
        metrics: {
          temperatureMinC: 3,
          temperatureMaxC: 14,
          chillingHours: 6,
          chillingHoursAccumulated: 6,
          utahChillUnits: 5,
          utahChillUnitsAccumulated: 5,
          chillPortions: 0.3,
          chillPortionsAccumulated: 0.3,
        },
      },
      {
        date: '2026-05-02',
        metrics: {
          temperatureMinC: 5,
          temperatureMaxC: 21,
          chillingHours: 2,
          chillingHoursAccumulated: 8,
          utahChillUnits: -7,
          utahChillUnitsAccumulated: -2,
          chillPortions: 0.15,
          chillPortionsAccumulated: 0.45,
        },
      },
    ].map((item) => ({
      ...item,
      isForecast: false,
      weather: {},
      source: 'open_meteo',
      sourceByVariable: {},
      qualityFlags: [],
      warnings: [],
    })) as any;
    const component = create(
      response({
        summary: {
          thermalProcess: 'dormancia_perenne',
          chillingHoursAccumulated: 8,
          utahChillUnitsAccumulated: -2,
          chillPortionsAccumulated: 0.45,
        },
        series: dias,
      })
    );
    component.siembra = { _id: 'peral-graficos', semilla: { cultivo: 'Peral', variedad: 'Rocha' } } as any;

    await component.cargar();

    expect(component.modoGraficoFrio).toBe('acumulado');
    expect((component.chartFrioOptions?.series?.[0] as any).data).toEqual([3, 5]);
    expect((component.chartFrioOptions?.series?.[1] as any).data).toEqual([14, 21]);
    expect((component.chartFrioOptions?.series?.[3] as any).data).toEqual([5, -2]);
    expect((component.chartFrioOptions?.series?.[0] as any).yAxis).toBe(0);
    expect((component.chartFrioOptions?.series?.[2] as any).yAxis).toBe(1);
    expect((component.chartFrioOptions?.series?.[3] as any).yAxis).toBe(2);
    expect((component.chartFrioOptions?.series?.[4] as any).yAxis).toBe(3);
    expect((component.chartFrioOptions?.yAxis as any[])[0].plotLines[0].value).toBe(15.9);
    expect((component.chartFrioOptions?.yAxis as any[])[0].plotBands).toHaveSize(2);
    expect((component.chartFrioOptions?.yAxis as any[])[2].min).toBeLessThan(-2);
    expect((component.chartFrioOptions?.yAxis as any[])[2].max).toBeGreaterThan(5);
    expect((component.chartFrioOptions?.yAxis as any[])[2].plotLines[0].value).toBe(0);

    component.cambiarModoGraficoFrio('diario');

    expect((component.chartFrioOptions?.series?.[2] as any).data).toEqual([6, 2]);
    expect((component.chartFrioOptions?.series?.[3] as any).data).toEqual([5, -7]);
    expect((component.chartFrioOptions?.series?.[3] as any).negativeColor).toBe('#d7833d');
    expect((component.chartFrioOptions?.series?.[0] as any).type).toBe('spline');
    expect((component.chartFrioOptions?.series?.[1] as any).type).toBe('spline');
    expect((component.chartFrioOptions?.series?.[2] as any).type).toBe('column');
    expect((component.chartFrioOptions?.series?.[4] as any).type).toBe('column');
    expect((component.chartFrioOptions?.series?.[0] as any).yAxis).toBe(0);
    expect((component.chartFrioOptions?.series?.[2] as any).yAxis).toBe(1);
    expect((component.chartFrioOptions?.series?.[3] as any).yAxis).toBe(2);
    expect((component.chartFrioOptions?.series?.[4] as any).yAxis).toBe(3);
  });

  it('limita el eje temporal a seis fechas legibles en temporadas largas', async () => {
    const series = Array.from({ length: 81 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 4, 1 + index)).toISOString().slice(0, 10),
      isForecast: index >= 76,
      weather: {},
      metrics: {
        chillingHours: 4,
        chillingHoursAccumulated: (index + 1) * 4,
        utahChillUnits: index % 3 === 0 ? -2 : 3,
        utahChillUnitsAccumulated: index - 20,
        chillPortions: 0.2,
        chillPortionsAccumulated: (index + 1) * 0.2,
      },
      source: 'open_meteo',
      sourceByVariable: {},
      qualityFlags: [],
      warnings: [],
    })) as any;
    const component = create(response({ summary: { thermalProcess: 'dormancia_perenne' }, series }));
    component.siembra = { _id: 'pecan-eje-fechas', semilla: { cultivo: 'Pecan', variedad: 'Stuart' } } as any;

    await component.cargar();

    expect((component.chartFrioOptions?.xAxis as any).tickPositions).toEqual([0, 15, 30, 45, 60, 75]);
    expect((component.chartFrioOptions?.series?.[0] as any).data).toHaveSize(76);
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
    const cp = component.referenciasTermicasFicha.find((item) => item.unidad === 'CP');
    expect(cp).toEqual(jasmine.objectContaining({ minimo: 52, maximo: 73.3 }));
    expect(cp?.fuenteIds.some((id) => id.includes('apple'))).toBeTrue();
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
    expect(component.estadoDatosLabel).toContain('GDD pendientes de biofix');
    expect(component.estadoDatosLabel).not.toContain('Serie incompleta');
    expect(component.gddCierreLabel).toBe('GDD aún no iniciados');
  });

  it('nombra el cultivo perenne correcto al explicar el inicio del forzado', async () => {
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
      _id: 'manzano-sin-biofix',
      semilla: { cultivo: 'Manzano', variedad: 'Cripps Pink' },
      registrosFenologicos: [],
    } as any;

    await component.cargar();

    expect(component.gddDetalle).toContain('En Manzano');
    expect(component.gddDetalle).not.toContain('En peral');
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
    expect(component.estadoEspecificacionLabel).toContain('no interpreta etapa varietal');
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
