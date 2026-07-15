import {
  calcularFinCicloSoja,
  calcularFusariumEspiga,
  calcularRoyaAnaranjadaTrigo2026,
  calcularRoyaHoja,
  calcularRoyaHojaTrigo2026,
  calcularRoyaHojaTrigo2026Crudo,
  gradosDiaRoya,
  gradosDiaRoyaMaiz,
  TRIGO_FUSARIUM_GDD_BASE_0_MAX,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import { AlgoritmosService } from './service';

describe('simulador admin y motor canonico de enfermedades', () => {
  const service = new AlgoritmosService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

  it('usa la resistencia de la campania mas reciente y la misma formula de roya de maiz', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Maiz',
      variedad: 'Hibrido prueba',
      etapa: 'Emergencia',
      humedadRelativa: 96,
      lluvia48h: 0,
      temperatura: 17,
      diasSimulados: 2,
      resistencia: [
        {
          idEnfermedad: 'maiz.roya',
          enfermedad: 'Roya del Maiz',
          multiplicador: 0.35,
          estado: 'historica',
          campaniaFuente: '24/25',
          fuente: 'fuente anterior',
        },
        {
          idEnfermedad: 'maiz.roya',
          enfermedad: 'Roya del Maiz',
          multiplicador: 0.8,
          estado: 'observada',
          campaniaFuente: '25/26',
          fuente: 'fuente vigente',
        },
      ],
    });
    const roya = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'maiz.roya',
    );
    const gd = gradosDiaRoyaMaiz(96, 17) * 2;
    const esperado = calcularRoyaHoja(gd, 2, 1 / 3);

    expect(roya.riesgo).toBeCloseTo(esperado, 1);
    expect(roya.resistenciaCampania).toBe('25/26');
    expect(roya.resistenciaFuente).toBe('fuente vigente');
  });

  it('no confunde una resistencia desconocida con un dato observado', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Maiz',
      etapa: 'Emergencia',
      humedadRelativa: 96,
      lluvia48h: 0,
      temperatura: 17,
      susceptibilidad: 0.2,
      diasSimulados: 1,
      resistencia: [
        {
          idEnfermedad: 'maiz.roya',
          enfermedad: 'Roya del Maiz',
          multiplicador: 1,
          estado: 'desconocida',
          campaniaFuente: '25/26',
          fuente: 'sin dato varietal publicado',
        },
      ],
    });
    const roya = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'maiz.roya',
    );

    expect(roya.resistenciaEstado).toBe('desconocida');
    expect(roya.susceptibilidad).toBe(1);
    expect(roya.resistenciaFuente).toBe('sin dato varietal publicado');
  });

  it('reproduce la formula compartida de fin de ciclo de soja', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Soja',
      etapa: 'R3',
      lluvia48h: 20,
      diasSimulados: 3,
      resistencia: [
        {
          idEnfermedad: 'soja.fin_ciclo',
          enfermedad: 'Fin de Ciclo',
          multiplicador: 0.5,
          estado: 'observada',
          campaniaFuente: '25/26',
        },
      ],
    });
    const finCiclo = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'soja.fin_ciclo',
    );

    expect(finCiclo.riesgo).toBeCloseTo(calcularFinCicloSoja(90, 0.5), 1);
  });

  it('declara tizon foliar sin modelo en vez de fabricar riesgo', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Maiz',
      etapa: 'VT',
      humedadRelativa: 90,
      lluvia48h: 30,
      temperatura: 23,
    });
    const tizon = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'maiz.tizon_foliar',
    );

    expect(tizon.nivel).toBe('sin modelo científico validado');
    expect(tizon.riesgo).toBe(0);
  });

  it('simula el screening de mildiu de arveja sin presentarlo como porcentaje', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Arveja',
      variedad: 'KINGFISHER',
      etapa: 'E',
      humedadRelativa: 94,
      horasMojado: 6,
      lluvia48h: 2,
      temperatura: 16,
    });
    const mildiu = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'arveja.mildiu',
    );

    expect(result.modo).toBe('screening_ambiental');
    expect(mildiu.nivel).toBe('alto');
    expect(mildiu.riesgo).toBe(80);
    expect(mildiu.resistenciaEstado).toBe('desconocida');
    expect(result.trazas.join(' ')).toContain('no son porcentajes');
  });

  it('mantiene oidio de arveja fuera de ventana antes de floracion', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Arveja',
      etapa: 'E',
      humedadRelativa: 70,
      horasMojado: 0,
      lluvia48h: 0,
      temperatura: 24,
    });
    const oidio = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'arveja.oidio',
    );

    expect(oidio.nivel).toBe('fuera de ventana');
    expect(oidio.riesgo).toBe(0);
  });

  it('aplica en trigo v4 el factor de susceptibilidad sin invertir las formulas de roya', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      variedad: 'Variedad prueba',
      etapa: 'Hoja bandera',
      humedadRelativa: 80,
      lluvia48h: 0.2,
      temperatura: 13,
      diasSimulados: 1,
      resistencia: [
        {
          idEnfermedad: 'trigo.roya_hoja',
          enfermedad: 'Roya de la Hoja',
          multiplicador: 0.75,
          perfil: 'MS',
          estado: 'observada',
          confianza: 'alta',
          campaniaFuente: '25/26',
          fuente: 'contrato varietal vigente',
        },
        {
          idEnfermedad: 'trigo.roya_anaranjada',
          enfermedad: 'Roya Anaranjada',
          multiplicador: 0.5,
          perfil: 'MR',
          estado: 'observada',
          confianza: 'media',
          campaniaFuente: '25/26',
          fuente: 'contrato varietal vigente',
        },
      ],
    });
    const royaHoja = result.enfermedades.find(
      (item: any) => item.nombre === 'Roya de la Hoja',
    );
    const royaAmarilla = result.enfermedades.find(
      (item: any) => item.nombre === 'Roya Anaranjada',
    );

    expect(result.motor).toBe(
      `enfermedades-trigo-v${TRIGO_MOTOR_SANITARIO_VERSION}`,
    );
    expect(royaHoja.riesgo).toBeCloseTo(
      calcularRoyaHojaTrigo2026(1, 1, 0.75),
      1,
    );
    expect(royaHoja.factorSusceptibilidad).toBe(0.75);
    expect(royaHoja.indiceResistencia).toBeUndefined();
    expect(royaHoja).toMatchObject({
      validacion: 'operativo_provisional',
      salidaOperativa: true,
      alertable: false,
      resistenciaEstado: 'observada',
      resistenciaPerfil: 'MS',
      resistenciaConfianza: 'alta',
      resistenciaCampania: '25/26',
      resistenciaCoherente: true,
    });
    expect(royaAmarilla.riesgo).toBe(0);
    expect(royaAmarilla.variables.resultadoContractualLimitado).toBeCloseTo(
      calcularRoyaAnaranjadaTrigo2026(13, 1, 1, 0.5),
      1,
    );
    expect(royaAmarilla).toMatchObject({
      validacion: 'experimental',
      salidaOperativa: false,
      incluirEnRanking: false,
      alertable: false,
      estado: 'sin_datos',
      nivel: 'requiere 10 dias de datos horarios',
      resolucion: 'horaria',
      coberturaHoraria10d: 0,
    });
    expect(royaAmarilla.prescripcion).toBeUndefined();
    expect(result.trazas.join(' ')).toContain('(1-factorSusceptibilidad)');
    expect(result.trazas.join(' ')).toContain('800 y 850 GDD');
  });

  it('aplica gobernanza v4 provisional sin fuentes V2 ni alertas automaticas', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      variedad: 'Escenario de gobernanza',
      etapa: 'Hoja bandera',
      humedadRelativa: 80,
      lluvia48h: 0.2,
      temperatura: 13,
      diasSimulados: 10,
    });
    const fuentes = new Map([
      ['Mancha Amarilla', 'Contrato sanitario trigo 2026 / Mancha Amarilla'],
      [
        'Mancha de la Hoja',
        'Contrato sanitario trigo 2026 / Mancha de la Hoja',
      ],
      [
        'Roya de la Hoja',
        'Contrato sanitario trigo 2026; Moschini y Perez (1999), adaptacion varietal declarada',
      ],
      [
        'Roya Anaranjada',
        'El Jarroudi et al. 2017, DOI 10.1094/PDIS-12-16-1766-RE; ventana movil 10 dias adaptada por Chaman. Contrato 5,15/0,72/0,48/0,35/35,2 solo en sombra',
      ],
      [
        'Fusarium de la Espiga',
        'Moschini y Fortugno (1996); adaptacion varietal del contrato sanitario trigo 2026',
      ],
    ]);
    const noExperimentales = result.enfermedades.filter(
      (item: any) => item.nombre !== 'Roya Anaranjada',
    );
    const experimental = result.enfermedades.find(
      (item: any) => item.nombre === 'Roya Anaranjada',
    );

    for (const enfermedad of result.enfermedades) {
      expect(enfermedad.fuenteFormula).toBe(fuentes.get(enfermedad.nombre));
      expect(enfermedad.fuenteFormula).not.toMatch(/V2/i);
    }
    for (const enfermedad of noExperimentales) {
      expect(enfermedad).toMatchObject({
        validacion: 'operativo_provisional',
        salidaOperativa: true,
        incluirEnRanking: true,
        visible: true,
        simulable: true,
        alertable: false,
        prescripcionAutomatica: false,
      });
    }
    expect(experimental).toMatchObject({
      validacion: 'experimental',
      salidaOperativa: false,
      incluirEnRanking: false,
      alertable: false,
    });
    expect(experimental.prescripcion).toBeUndefined();
    expect(result.metricas).toMatchObject({
      validacion: 'operativo_provisional',
      alertable: false,
      enfermedadPrioritaria: 'Roya de la Hoja',
    });
    expect(experimental.riesgo).toBe(0);
    expect(result.serie[result.serie.length - 1].value).toBeGreaterThan(
      experimental.riesgo,
    );
  });

  it('expone coherencia varietal y deja el escenario manual explicitamente no alertable', () => {
    const inconsistente: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      etapa: 'Hoja bandera',
      humedadRelativa: 80,
      lluvia48h: 0,
      temperatura: 15,
      diasSimulados: 1,
      resistencia: [
        {
          idEnfermedad: 'trigo.roya_hoja',
          enfermedad: 'Roya de la Hoja',
          multiplicador: 0.75,
          perfil: 'R',
          estado: 'observada',
          confianza: 'alta',
          campaniaFuente: '25/26',
          fuente: 'ensayo declarado',
        },
      ],
    });
    const manual: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      etapa: 'Hoja bandera',
      humedadRelativa: 80,
      lluvia48h: 0,
      temperatura: 15,
      diasSimulados: 1,
    });
    const royaInconsistente = inconsistente.enfermedades.find(
      (item: any) => item.nombre === 'Roya de la Hoja',
    );
    const royaManual = manual.enfermedades.find(
      (item: any) => item.nombre === 'Roya de la Hoja',
    );

    expect(royaInconsistente).toMatchObject({
      resistenciaEstado: 'observada',
      resistenciaPerfil: 'R',
      resistenciaConfianza: 'alta',
      resistenciaCampania: '25/26',
      resistenciaCoherente: false,
      resistenciaEscenarioManual: false,
      resistenciaAlertable: false,
      alertable: false,
    });
    expect(royaInconsistente.resistenciaLimitaciones.join(' ')).toContain(
      'Perfil/factor varietal inconsistente',
    );
    expect(royaManual).toMatchObject({
      resistenciaEstado: 'escenario_manual',
      resistenciaPerfil: 'DESCONOCIDA',
      resistenciaConfianza: 'sin_datos',
      resistenciaCampania: null,
      resistenciaCoherente: false,
      resistenciaEscenarioManual: true,
      resistenciaAlertable: false,
      alertable: false,
    });
    expect(royaManual.resistenciaUsada).toMatchObject({
      estado: 'escenario_manual',
      perfil: 'DESCONOCIDA',
      confianza: 'sin_datos',
      campaniaFuente: null,
      coherente: false,
      escenarioManual: true,
      alertable: false,
    });
    expect(royaManual.resistenciaLimitaciones.join(' ')).toContain(
      'no habilita alertas automaticas',
    );
  });

  it('simula Fusarium como incidencia meteorologica desde Antesis y cuenta periodos mojados de dos dias', () => {
    const fueraVentana: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      etapa: 'Espigazon',
      humedadRelativa: 82,
      lluvia48h: 0.4,
      temperatura: 22,
      diasSimulados: 2,
    });
    const enVentana: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      etapa: 'Antesis',
      humedadRelativa: 82,
      lluvia48h: 0.4,
      temperatura: 22,
      diasSimulados: 2,
      resistencia: [
        {
          idEnfermedad: 'trigo.fusarium_espiga',
          enfermedad: 'Fusarium de la Espiga',
          multiplicador: 0.5,
          perfil: 'MR',
          estado: 'observada',
          confianza: 'alta',
          campaniaFuente: '25/26',
        },
      ],
    });
    const fusariumFuera = fueraVentana.enfermedades.find(
      (item: any) => item.nombre === 'Fusarium de la Espiga',
    );
    const fusarium = enVentana.enfermedades.find(
      (item: any) => item.nombre === 'Fusarium de la Espiga',
    );

    expect(fusariumFuera).toMatchObject({
      etapaActiva: false,
      riesgo: 0,
      nivel: 'fuera de ventana',
    });
    expect(fusarium.variables.PMoj).toBe(1);
    expect(fusarium.variables.GDN).toBe(2);
    expect(fusarium.riesgo).toBeCloseTo(
      calcularFusariumEspiga(1, 2, 0.5, true),
      1,
    );
    expect(enVentana.trazas.join(' ')).toContain('incidencia meteorologica');
    expect(enVentana.trazas.join(' ')).toContain(
      'Antesis/primeras espigas con anteras',
    );
  });

  it('respeta umbrales estrictos y no acumula GDD base 0 negativos en el simulador de trigo', () => {
    const bordeManchaAmarilla: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      etapa: 'Hoja bandera',
      humedadRelativa: 85,
      lluvia48h: 2,
      temperatura: 18,
      diasSimulados: 1,
    });
    const bordeManchaHoja: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      etapa: 'Hoja bandera',
      humedadRelativa: 70,
      lluvia48h: 20,
      temperatura: 13,
      diasSimulados: 1,
    });
    const frioFusarium: any = service.simularEnfermedades({
      cultivo: 'Trigo',
      etapa: 'Antesis',
      humedadRelativa: 82,
      lluvia48h: 1,
      temperatura: -5,
      diasSimulados: 2,
    });
    const manchaAmarilla = bordeManchaAmarilla.enfermedades.find(
      (item: any) => item.nombre === 'Mancha Amarilla',
    );
    const manchaHoja = bordeManchaHoja.enfermedades.find(
      (item: any) => item.nombre === 'Mancha de la Hoja',
    );
    const royaHoja = bordeManchaHoja.enfermedades.find(
      (item: any) => item.nombre === 'Roya de la Hoja',
    );
    const fusarium = frioFusarium.enfermedades.find(
      (item: any) => item.nombre === 'Fusarium de la Espiga',
    );

    expect(manchaAmarilla.variables).toMatchObject({ DPr: 0, DPrHRT: 0 });
    expect(manchaHoja.variables.DPr).toBe(0);
    expect(royaHoja.variables.DHR).toBe(0);
    expect(fusarium.variables.GDAcum).toBe(0);
  });

  it('respeta HR mayor a 49 exacto y conserva resultado crudo separado del riesgo visible', () => {
    expect(gradosDiaRoya(49, 15)).toBe(0);
    expect(gradosDiaRoya(49.01, 15)).toBe(3);

    const simular = (humedadRelativa: number) =>
      service.simularEnfermedades({
        cultivo: 'Trigo',
        etapa: 'Hoja bandera',
        humedadRelativa,
        lluvia48h: 0,
        temperatura: 15,
        diasSimulados: 1,
        resistencia: [
          {
            idEnfermedad: 'trigo.roya_hoja',
            enfermedad: 'Roya de la Hoja',
            multiplicador: 0.05,
            perfil: 'R',
            estado: 'observada',
            confianza: 'alta',
            campaniaFuente: '25/26',
          },
        ],
      }) as any;
    const enBorde = simular(49);
    const sobreBorde = simular(49.01);
    const royaEnBorde = enBorde.enfermedades.find(
      (item: any) => item.nombre === 'Roya de la Hoja',
    );
    const royaSobreBorde = sobreBorde.enfermedades.find(
      (item: any) => item.nombre === 'Roya de la Hoja',
    );

    expect(royaEnBorde.variables.GD).toBe(0);
    expect(royaSobreBorde.variables.GD).toBe(3);
    expect(royaEnBorde.variables.resultadoCrudo).toBeCloseTo(
      calcularRoyaHojaTrigo2026Crudo(0, 0, 0.05),
      4,
    );
    expect(royaEnBorde.variables.resultadoCrudo).toBeLessThan(0);
    expect(royaEnBorde.riesgo).toBe(0);
    expect(enBorde.trazas.join(' ')).toContain(
      'resultadoCrudo conserva la salida algebraica',
    );
  });

  it('calcula el dia que alcanza 530 GDD de Fusarium y cierra la ventana al dia siguiente sin exceder el tope', () => {
    const simular = (diasSimulados: number) =>
      service.simularEnfermedades({
        cultivo: 'Trigo',
        etapa: 'Antesis',
        humedadRelativa: 70,
        lluvia48h: 0,
        temperatura: 20,
        diasSimulados,
        resistencia: [
          {
            idEnfermedad: 'trigo.fusarium_espiga',
            enfermedad: 'Fusarium de la Espiga',
            multiplicador: 1,
            perfil: 'S',
            estado: 'observada',
            confianza: 'alta',
            campaniaFuente: '25/26',
          },
        ],
      }) as any;
    const alAlcanzarTope = simular(27);
    const diaSiguiente = simular(28);
    const fusariumAlTope = alAlcanzarTope.enfermedades.find(
      (item: any) => item.nombre === 'Fusarium de la Espiga',
    );
    const fusariumCerrado = diaSiguiente.enfermedades.find(
      (item: any) => item.nombre === 'Fusarium de la Espiga',
    );

    expect(fusariumAlTope).toMatchObject({
      estado: 'calculado',
      riesgo: 20.4,
    });
    expect(fusariumAlTope.variables).toMatchObject({
      GDAcum: TRIGO_FUSARIUM_GDD_BASE_0_MAX,
      resultadoCrudo: 20.37,
    });
    expect(fusariumCerrado).toMatchObject({
      estado: 'fuera_ventana',
      riesgo: 0,
      nivel: 'fuera de ventana',
    });
    expect(fusariumCerrado.variables.GDAcum).toBe(
      TRIGO_FUSARIUM_GDD_BASE_0_MAX,
    );
    expect(fusariumCerrado.variables.resultadoCrudo).toBe(
      fusariumAlTope.variables.resultadoCrudo,
    );
  });

  it('audita la matriz sanitaria estructurada sin depender de filtros anidados', async () => {
    const catalogo = [
      {
        ciclo: 'IV',
        resistencia: [
          {
            idEnfermedad: 'soja.cancro_tallo',
            estado: 'historica',
            confianza: 'alta',
          },
        ],
      },
      {
        ciclo: 'V',
        resistencia: [
          {
            idEnfermedad: 'soja.fin_ciclo',
            estado: 'desconocida',
            confianza: 'sin_datos',
          },
        ],
      },
    ];
    const semillasService = {
      getFilter: jest.fn(async ({ filter }: any) => {
        const cultivo = JSON.parse(filter || '{}').cultivo;
        return cultivo === 'Soja'
          ? { totalCount: catalogo.length, datos: catalogo }
          : { totalCount: 0, datos: [] };
      }),
    };
    const contadorVacio = {
      getFilter: jest.fn(async () => ({ totalCount: 0, datos: [] })),
    };
    const servicio = new AlgoritmosService(
      contadorVacio as any,
      contadorVacio as any,
      contadorVacio as any,
      semillasService as any,
    );

    const readiness = await servicio.getReadinessCatalogos();
    const soja = readiness.cultivos.find((item) => item.cultivo === 'Soja');

    expect(soja?.semillas).toBe(2);
    expect(soja?.semillasConResistencia).toBe(1);
    expect(soja?.semillasConCrono).toBe(2);
    expect(
      soja?.coberturaResistenciaEnfermedades?.find(
        (item) => item.idEnfermedad === 'soja.fin_ciclo',
      ),
    ).toMatchObject({
      conEntrada: 1,
      desconocidas: 1,
      coberturaMatrizPct: 50,
      coberturaValidadaPct: 0,
    });
  });
});
