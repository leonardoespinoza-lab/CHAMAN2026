import { CardEtapasFenologicasComponent } from './card-etapas-fenologicas.component';

describe('CardEtapasFenologicasComponent - perennes observados', () => {
  let component: CardEtapasFenologicasComponent;
  let siembraService: {
    agrometeorologia: jasmine.Spy;
    registrarEtapaFenologica: jasmine.Spy;
  };
  let helper: {
    notifWarn: jasmine.Spy;
    notifSuccess: jasmine.Spy;
    notifError: jasmine.Spy;
  };

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 6, 16, 12, 0, 0));
    siembraService = {
      agrometeorologia: jasmine.createSpy('agrometeorologia').and.resolveTo(undefined),
      registrarEtapaFenologica: jasmine.createSpy('registrarEtapaFenologica'),
    };
    helper = {
      notifWarn: jasmine.createSpy('notifWarn'),
      notifSuccess: jasmine.createSpy('notifSuccess'),
      notifError: jasmine.createSpy('notifError'),
    };
    component = new CardEtapasFenologicasComponent(helper as any, siembraService as any);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  [
    {
      cultivo: 'Trigo',
      etapaTermica: 'Emergencia',
      etapaCampo: 'Hoja Bandera',
      crono: {
        R0_R1: 1,
        R1_R2: 1,
        R2_R3: 1,
        R3_R4: 1,
        R4_R5: 1,
        R5_R6: 1,
        R6_R7: 1,
      },
    },
    {
      cultivo: 'Cebada',
      etapaTermica: 'Emergencia',
      etapaCampo: 'Hoja Bandera',
      crono: {
        siembra_emergencia: 1,
        emergencia_primer_nudo: 1,
        primer_nudo_hoja_bandera: 1,
        hoja_bandera_espigazon: 1,
        espigazon_antesis: 1,
        antesis_llenado_granos: 1,
        llenado_granos_madurez_fisiologica: 1,
      },
    },
    {
      cultivo: 'Maiz',
      etapaTermica: 'Emergencia',
      etapaCampo: 'Floracion',
      crono: {
        siembra_emergencia: 1,
        emergencia_floracion: 1,
        floracion_madurez: 1,
      },
    },
    {
      cultivo: 'Soja',
      etapaTermica: 'Emergencia',
      etapaCampo: 'Floracion',
      crono: {
        siembra_emergencia: 1,
        emergencia_R1: 1,
        R1_R3: 1,
        R3_R5: 1,
        R5_R7: 1,
      },
    },
  ].forEach(({ cultivo, etapaTermica, etapaCampo, crono }) => {
    it(`prioriza campo > modelo termico validado > crono en ${cultivo}`, () => {
      component.siembra = {
        _id: `siembra-${cultivo}`,
        fechaSiembra: '2026-05-05T12:00:00.000Z',
        semilla: {
          cultivo,
          variedad: `${cultivo} validada`,
          parametrosAgrometeorologicos: {
            version: 'test-1',
            estado: 'validado',
            fuente: 'Ensayo varietal trazable',
            temperaturaBaseC: 0,
            temperaturaSuperiorC: 30,
            metodoGdd: 'promedio_limitado',
            semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
            gddPorEtapa: {
              Siembra: { orden: 0, min: 0, max: 99 },
              [etapaTermica]: { orden: 1, min: 100, max: 299 },
              [etapaCampo.replace(/ /g, '_')]: {
                orden: 2,
                min: 300,
                max: 499,
              },
              Madurez: { orden: 3, min: 500, max: 700 },
            },
          },
        },
        crono: { etapas: crono },
        registrosFenologicos: [],
      } as any;
      component.snapshotAgromet = {
        summary: {
          gddAccumulated: 180,
          parametersStatus: 'validado',
        },
        dataSource: {
          type: 'open_meteo',
          completenessPercentage: 100,
        },
        series: [
          {
            date: '2026-05-05',
            metrics: { gddAccumulated: 0 },
          },
          {
            date: '2026-06-01',
            metrics: { gddAccumulated: 110 },
          },
          {
            date: '2026-07-16',
            stage: etapaTermica,
            stageSource: 'gdd_validado',
            stageConfidence: 'media',
            phenologyModelVersion: 'test-1',
            metrics: { gddAccumulated: 180 },
          },
        ],
        warnings: [],
        calculationVersion: 'test',
        parametersVersion: 'test-1',
      } as any;

      (component as any).crearTimeline();

      expect(component.etapaActual).toBe(etapaTermica);
      expect(component.fuenteEtapaActual).toBe('termico');
      expect(component.fuenteTexto).toContain('motor fenologico canonico');

      (component.siembra as any).registrosFenologicos = [
        {
          id: `campo-${cultivo}`,
          tipoEvento: 'inicio_etapa',
          accion: 'inicio',
          etapa: etapaCampo,
          fecha: '2026-07-10T12:00:00.000Z',
          fechaInicioEtapa: '2026-07-10T12:00:00.000Z',
        },
      ] as any;

      (component as any).crearTimeline();

      expect(component.etapaActual).toBe(etapaCampo);
      expect(component.etapaActualConfirmadaCampo).toBeTrue();
      expect(component.fuenteEtapaActual).toBe('campo');
      expect(component.fuenteTexto).toContain('registro de campo prioritario');
    });
  });

  it('nunca adelanta por GDD bruto una etapa que el backend canonico mantuvo bloqueada', () => {
    component.siembra = {
      _id: 'siembra-trigo-gate',
      fechaSiembra: '2026-05-05T12:00:00.000Z',
      semilla: {
        cultivo: 'Trigo',
        variedad: 'Trigo invernal',
        parametrosAgrometeorologicos: {
          version: 'trigo-gate-v1',
          estado: 'validado',
          fuente: 'Ensayo varietal trazable',
          temperaturaBaseC: 0,
          temperaturaSuperiorC: 30,
          metodoGdd: 'promedio_limitado',
          semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
          gddPorEtapa: {
            Siembra: { orden: 0, min: 0, max: 99 },
            Emergencia: { orden: 1, min: 100, max: 299 },
            Hoja_Bandera: { orden: 2, min: 300, max: 499 },
            Madurez: { orden: 3, min: 500, max: 700 },
          },
        },
      },
      crono: {
        etapas: {
          R0_R1: 20,
          R1_R2: 80,
          R2_R3: 20,
          R3_R4: 20,
          R4_R5: 10,
          R5_R6: 20,
          R6_R7: 30,
        },
      },
      registrosFenologicos: [],
    } as any;
    component.snapshotAgromet = {
      summary: {
        gddAccumulated: 650,
        parametersStatus: 'validado',
      },
      dataSource: {
        type: 'open_meteo',
        completenessPercentage: 100,
      },
      series: [
        {
          date: '2026-07-16',
          stage: 'Emergencia',
          stageSource: 'gdd_validado',
          stageConfidence: 'media',
          phenologyModelVersion: 'trigo-gate-v1',
          metrics: {
            gddAccumulated: 650,
            vernalizationAccumulated: 12,
            vernalizationContinuitySufficient: false,
            photoperiodCompatible: true,
          },
          isForecast: false,
        },
      ],
      warnings: ['La etapa queda limitada por continuidad de vernalizacion.'],
      calculationVersion: 'test',
      parametersVersion: 'trigo-gate-v1',
    } as any;

    (component as any).crearTimeline();

    expect(component.etapaActual).toBe('Emergencia');
    expect(component.etapaActual).not.toBe('Madurez');
    expect(component.fuenteEtapaActual).toBe('termico');
    expect(component.fuenteTexto).toContain('compuertas validadas');
    expect(component.etapas.find((etapa) => etapa.estado === 'current')?.nombre).toBe('Emergencia');
    expect(component.lecturaEtapaActual).toContain('compuertas validadas de vernalizacion');
  });

  it('usa el calendario solo como referencia cuando el backend no entrega una etapa', () => {
    component.siembra = {
      _id: 'siembra-trigo-sin-etapa-canonica',
      fechaSiembra: '2026-05-05T12:00:00.000Z',
      semilla: {
        cultivo: 'Trigo',
        variedad: 'Trigo sin respuesta canonica',
        parametrosAgrometeorologicos: {
          version: 'trigo-ref-v1',
          estado: 'validado',
          fuente: 'Ensayo varietal trazable',
          temperaturaBaseC: 0,
          temperaturaSuperiorC: 30,
          metodoGdd: 'promedio_limitado',
          semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
          gddPorEtapa: {
            Siembra: { orden: 0, min: 0, max: 99 },
            Emergencia: { orden: 1, min: 100, max: 299 },
            Madurez: { orden: 2, min: 500, max: 700 },
          },
        },
      },
      crono: {
        etapas: {
          R0_R1: 100,
          R1_R2: 100,
          R2_R3: 100,
          R3_R4: 100,
          R4_R5: 100,
          R5_R6: 100,
          R6_R7: 100,
        },
      },
      registrosFenologicos: [],
    } as any;
    component.snapshotAgromet = {
      summary: {
        gddAccumulated: 650,
        parametersStatus: 'validado',
      },
      dataSource: {
        type: 'open_meteo',
        completenessPercentage: 100,
      },
      series: [
        {
          date: '2026-07-16',
          metrics: { gddAccumulated: 650 },
          isForecast: false,
        },
      ],
      warnings: [],
      calculationVersion: 'test',
      parametersVersion: 'trigo-ref-v1',
    } as any;

    (component as any).crearTimeline();

    expect(component.fuenteEtapaActual).toBe('calendario');
    expect(component.etapaActual).toBe('Siembra');
    expect(component.etapaActual).not.toBe('Madurez');
  });

  it('mantiene el ultimo inicio de etapa de campo y no lo sobreescribe con el calendario', () => {
    component.siembra = {
      _id: 'siembra-perenne-1',
      fechaSiembra: '2020-08-15T12:00:00.000Z',
      semilla: {
        cultivo: 'Manzano',
        variedad: 'Williams',
        fenologiaReferencia: {
          etapas: {
            Reposo_invernal: 0,
            Brotacion: 2,
            Floracion: 4,
            Cuaje: 8,
          },
          estadoModelo: 'referencia',
        },
      },
      registrosFenologicos: [
        {
          id: 'biofix-brotacion',
          tipoEvento: 'biofix',
          accion: 'inicio',
          etapa: 'Brotacion',
          fecha: '2026-07-02T12:00:00.000Z',
          fechaInicioEtapa: '2026-07-02T12:00:00.000Z',
          campania: '2026-2027',
        },
      ],
    } as any;

    (component as any).crearTimeline();

    expect(component.etapaActual).toBe('Brotacion');
    expect(component.etapaActualConfirmadaCampo).toBeTrue();
    expect(component.etapas.find((etapa) => etapa.nombre === 'Brotacion')?.estado).toBe('current');
    expect(component.etapas.find((etapa) => etapa.nombre === 'Floracion')?.fecha).toBeUndefined();
    expect(component.fuenteTexto).toContain('registro de campo prioritario');
  });

  it('mantiene Dormancia observada el 1-may al cruzar el 1-jul en Pecan Kiowa', () => {
    jasmine.clock().mockDate(new Date(2026, 7, 10, 12, 0, 0));
    component.siembra = {
      _id: 'siembra-pecan-kiowa',
      idLote: 'lote-kiowa',
      fechaSiembra: '2020-08-15T12:00:00.000Z',
      semilla: {
        cultivo: 'Pecan',
        variedad: 'Kiowa',
        fenologiaReferencia: {
          etapas: {
            Dormancia: 0,
            Brotacion: 80,
            Floracion: 120,
          },
          estadoModelo: 'referencia',
        },
      },
      registrosFenologicos: [
        {
          id: 'inicio-dormancia-1-may',
          tipoEvento: 'inicio_etapa',
          accion: 'inicio',
          etapa: 'Dormancia',
          fecha: '2026-05-01T12:00:00.000Z',
          fechaInicioEtapa: '2026-05-01T12:00:00.000Z',
          campania: '2025/2026',
          confianza: 'alta',
          frioAcumulado: {
            horasFrio: 12.5,
            unidadesFrioUtah: 8.25,
            porcionesFrio: 1.125,
            gradosDia: 0,
            estado: 'completo',
          },
        },
      ],
    } as any;

    (component as any).crearTimeline();

    const dormancia = component.etapas.find((etapa) => etapa.nombre === 'Dormancia');
    expect(component.campaniaTexto).toBe('2026/2027');
    expect(component.etapaActual).toBe('Dormancia');
    expect(component.etapaActualConfirmadaCampo).toBeTrue();
    expect(dormancia?.fechaFuente).toBe('campo');
    expect(dormancia?.fecha?.toISOString()).toContain('2026-05-01');
    expect(component.registrosTermicosFenologicos[0].frioAcumulado).toEqual(
      jasmine.objectContaining({
        horasFrio: 12.5,
        unidadesFrioUtah: 8.25,
        porcionesFrio: 1.125,
        gradosDia: 0,
      })
    );
  });

  it('no vuelve persistente una observacion puntual de Dormancia del 1-may', () => {
    jasmine.clock().mockDate(new Date(2026, 7, 10, 12, 0, 0));
    component.siembra = {
      _id: 'siembra-pecan-observacion',
      fechaSiembra: '2020-08-15T12:00:00.000Z',
      semilla: {
        cultivo: 'Pecan',
        variedad: 'Kiowa',
        fenologiaReferencia: {
          etapas: { Dormancia: 0, Brotacion: 80 },
          estadoModelo: 'referencia',
        },
      },
      registrosFenologicos: [
        {
          id: 'observacion-dormancia-1-may',
          tipoEvento: 'observacion',
          accion: 'observacion',
          etapa: 'Dormancia',
          fecha: '2026-05-01T12:00:00.000Z',
          campania: '2025/2026',
          confianza: 'alta',
        },
      ],
    } as any;

    (component as any).crearTimeline();

    const dormancia = component.etapas.find((etapa) => etapa.nombre === 'Dormancia');
    expect(component.campaniaTexto).toBe('2026/2027');
    expect(component.etapaActualConfirmadaCampo).toBeFalse();
    expect(dormancia?.fechaFuente).toBe('referencia');
    expect(dormancia?.fecha?.toISOString()).toContain('2026-07-01');
  });

  it('ignora una Dormancia 2024 sin campania al mostrar la campania 2026/2027', () => {
    jasmine.clock().mockDate(new Date(2026, 7, 10, 12, 0, 0));
    component.siembra = {
      _id: 'siembra-pecan-registro-antiguo',
      fechaSiembra: '2020-08-15T12:00:00.000Z',
      semilla: {
        cultivo: 'Pecan',
        variedad: 'Kiowa',
        fenologiaReferencia: {
          etapas: { Dormancia: 0, Brotacion: 80 },
          estadoModelo: 'referencia',
        },
      },
      registrosFenologicos: [
        {
          id: 'dormancia-2024-sin-campania',
          tipoEvento: 'inicio_etapa',
          accion: 'inicio',
          etapa: 'Dormancia',
          fechaInicioEtapa: '2024-05-01T12:00:00.000Z',
          confianza: 'alta',
        },
      ],
    } as any;

    (component as any).crearTimeline();

    expect(component.campaniaTexto).toBe('2026/2027');
    expect(component.etapaActualConfirmadaCampo).toBeFalse();
  });

  it('registra un biofix de reposo como inicio de frio sin reiniciar el forzado', async () => {
    const siembra = {
      _id: 'siembra-manzano-1',
      idLote: 'lote-manzano-1',
      fechaSiembra: '2020-08-15T12:00:00.000Z',
      semilla: {
        cultivo: 'Manzano',
        variedad: 'Gala',
        fenologiaReferencia: {
          etapas: {
            Reposo_invernal: 0,
            Brotacion: 30,
          },
        },
      },
      registrosFenologicos: [],
    } as any;
    component.siembra = siembra;
    component.esPerenne = true;
    component.cultivo = 'Manzano';
    component.campaniaTexto = '2026-2027';
    component.etapas = [
      {
        nombre: 'Reposo invernal',
        posicion: 0,
        estado: 'current',
      },
      {
        nombre: 'Brotacion',
        posicion: 100,
        estado: 'pending',
      },
    ];
    siembraService.registrarEtapaFenologica.and.callFake(async (_id: string, registro: any) => ({
      ...siembra,
      registrosFenologicos: [registro],
    }));

    component.abrirRegistroEtapa(component.etapas[0]);
    component.registroForm.tipoEvento = 'biofix';
    component.registroForm.fecha = new Date(2026, 4, 1, 12, 0, 0);
    component.registroForm.escalaEtapa = 'BBCH';
    component.registroForm.codigoEtapa = 'BBCH 00';
    component.registroForm.coberturaObservadaPct = 80;
    component.registroForm.confianza = 'alta';
    component.registroForm.observador = 'Tecnico Kleppe';

    expect(component.registroForm.objetivoBiofix).toBe('inicio_acumulacion_frio');

    await component.guardarRegistroFenologico();

    const registro = siembraService.registrarEtapaFenologica.calls.mostRecent().args[1];
    expect(registro.objetivosBiofix).toEqual(['anclaje_fenologico', 'inicio_acumulacion_frio']);
    expect(registro.objetivosBiofix).not.toContain('inicio_forzado');
    expect(registro.tipoEvento).toBe('biofix');
    expect(registro.fechaInicioEtapa).toContain('2026-05-01');
    expect(registro.frioAcumulado).toBeUndefined();
    expect(registro).toEqual(
      jasmine.objectContaining({
        escalaEtapa: 'BBCH',
        codigoEtapa: 'BBCH 00',
        coberturaObservadaPct: 80,
        confianza: 'alta',
        observador: 'Tecnico Kleppe',
      })
    );
    expect(helper.notifSuccess).toHaveBeenCalled();
  });

  it('presenta el historial termico capturado por el backend en cada etapa perenne', () => {
    component.siembra = {
      _id: 'siembra-perenne-termica',
      semilla: { cultivo: 'Peral', variedad: 'Rocha' },
      registrosFenologicos: [
        {
          id: 'fen-brotacion',
          etapa: 'Brotacion',
          fecha: '2026-09-04T12:00:00.000Z',
          frioAcumulado: {
            horasFrio: 612.5,
            unidadesFrioUtah: 488.25,
            porcionesFrio: 42.125,
            gradosDia: 84.2,
            fuenteTemperatura: 'sensor',
            serieCampoPrioritaria: true,
            estado: 'completo',
          },
        },
      ],
    } as any;

    const [registro] = component.registrosTermicosFenologicos;
    expect(component.valorRegistroTermico(registro, 'horasFrio')).toBe('612,5 HF');
    expect(component.valorRegistroTermico(registro, 'unidadesFrioUtah')).toBe('488,3 UF');
    expect(component.valorRegistroTermico(registro, 'porcionesFrio', 2)).toBe('42,13 CP');
    expect(component.valorRegistroTermico(registro, 'gradosDia')).toBe('84,2 GDD');
    expect(component.fuenteRegistroTermico(registro)).toBe('Sensor de campo prioritario');
    expect(component.estadoRegistroTermico(registro)).toBe('Serie completa');
  });

  it('rotula Chaman-Meteo en el snapshot fenologico y en el registro termico', () => {
    component.snapshotAgromet = {
      summary: {},
      dataSource: {
        type: 'chaman_meteo',
        sources: ['chaman_meteo'],
        completenessPercentage: 100,
      },
      series: [{ date: '2026-05-01', metrics: {} }],
      warnings: [],
      calculationVersion: 'test',
      parametersVersion: 'test',
    } as any;

    expect(component.fuenteFenologiaTermicaTexto).toBe('Chamán-Meteo (ERA5-Land)');
    expect(
      component.fuenteRegistroTermico({
        frioAcumulado: {
          fuenteTemperatura: 'derived_chaman_meteo',
        },
      } as any)
    ).toBe('Chamán-Meteo (ERA5-Land)');

    component.snapshotAgromet!.dataSource = {
      type: 'mixed',
      sources: ['sensor', 'chaman_meteo'],
      sensorNames: ['K-01'],
      completenessPercentage: 100,
    } as any;
    expect(component.fuenteFenologiaTermicaTexto).toContain('Chamán-Meteo (ERA5-Land)');
    expect(component.fuenteFenologiaTermicaTexto).not.toContain('Open-Meteo');
  });

  it('distingue el inicio y el cierre de la ventana de vernalizacion anual', () => {
    component.siembra = {
      _id: 'siembra-trigo-1',
      fechaSiembra: '2026-05-05T12:00:00.000Z',
      semilla: {
        cultivo: 'Trigo',
        variedad: 'Trigo invernal',
      },
      registrosFenologicos: [],
    } as any;
    component.esPerenne = false;
    component.cultivo = 'Trigo';
    component.etapas = [
      {
        nombre: 'Emergencia',
        posicion: 0,
        estado: 'current',
      },
      {
        nombre: 'Espiguilla Terminal',
        posicion: 100,
        estado: 'pending',
      },
    ];

    component.abrirRegistroEtapa(component.etapas[0]);
    expect(component.registroForm.objetivoBiofix).toBe('inicio_vernalizacion');

    component.abrirRegistroEtapa(component.etapas[1]);
    expect(component.registroForm.objetivoBiofix).toBe('fin_vernalizacion');
  });

  it('no presenta una etapa de calendario como observacion actual del lote', () => {
    component.esPerenne = false;
    component.fuenteEtapaActual = 'calendario';
    component.etapas = [{ nombre: 'Emergencia', posicion: 0, estado: 'current' }];

    expect(component.etiquetaEtapaActual).toBe('Etapa proyectada por cronograma');
    expect(component.lecturaEtapaActual).toContain('proyeccion');
    expect(component.lecturaEtapaActual).toContain('No confirma');
  });
});
