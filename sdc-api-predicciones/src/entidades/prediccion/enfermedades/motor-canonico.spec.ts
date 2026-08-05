import {
  acumularSeveridadManchaRed,
  calcularFusariumEspiga,
  calcularEventoInfeccionManchaRed,
  calcularPresionCicloManchaRed,
  calcularManchaAmarilla,
  calcularManchaHoja,
  calcularRoyaAnaranjada,
  calcularRoyaAnaranjadaTrigo2026,
  calcularRoyaHoja,
  calcularRoyaHojaTrigo2026,
  clasificarNivelRiesgoSanitario,
  CEBADA_MANCHA_RED_UMBRAL_ALERTA,
  CEBADA_MANCHA_RED_MOTOR_VERSION,
  esFechaPrediccionSanitariaReciente,
  esLecturaSanitariaOperativa,
  esPrediccionSanitariaAlertable,
  evaluarSanidadAgregada,
  evaluarAscochytaArveja,
  evaluarMildiuArveja,
  evaluarOidioArveja,
  getEnfermedadCanonica,
  getUmbralesRiesgoSanitario,
  gradosDiaBase0,
  gradosDiaRoya,
  gradosDiaRoyaMaiz,
  indiceResistenciaDesdeMultiplicador,
  resolverResistencia,
  resolverVentanaSanitariaFoliarTrigo,
  seleccionarResistenciaMasReciente,
  tasaDiariaManchaRedHoraria,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';

describe('motor canonico de enfermedades', () => {
  it('resuelve los alias de UI al mismo identificador estable', () => {
    expect(getEnfermedadCanonica('Roya del Maíz')?.id).toBe('maiz.roya');
    expect(getEnfermedadCanonica('Roya del Maiz')?.id).toBe('maiz.roya');
    expect(getEnfermedadCanonica('Fin de Ciclo Soja')?.id).toBe(
      'soja.fin_ciclo',
    );
    expect(getEnfermedadCanonica('SH')?.id).toBe('trigo.mancha_hoja');
  });

  it('prioriza la campaña más reciente para una misma enfermedad', () => {
    const selected = seleccionarResistenciaMasReciente(
      [
        {
          enfermedad: 'Mancha de la Hoja',
          multiplicador: 0.5,
          campaniaFuente: '2020-2021',
          estado: 'historica',
        },
        {
          idEnfermedad: 'trigo.mancha_hoja',
          enfermedad: 'Mancha de la Hoja',
          multiplicador: 0.75,
          campaniaFuente: '2025-2026',
          estado: 'observada',
        },
      ],
      'trigo.mancha_hoja',
    );
    expect(selected?.campaniaFuente).toBe('2025-2026');
    expect(selected?.multiplicador).toBe(0.75);
  });

  it('no transforma la ausencia de información en resistencia', () => {
    const resolved = resolverResistencia([], 'cebada.mancha_red');
    expect(resolved.estado).toBe('desconocida');
    expect(resolved.desconocida).toBe(true);
    expect(resolved.multiplicador).toBe(1);
    expect(resolved.indiceResistencia).toBe(0);
  });

  it('no habilita como conocida una resistencia legada sin estado o factor trazable', () => {
    const sinEstado = resolverResistencia(
      [{ enfermedad: 'Roya de la Hoja', multiplicador: 0.5 }],
      'trigo.roya_hoja',
    );
    const sinFactor = resolverResistencia(
      [
        {
          enfermedad: 'Roya de la Hoja',
          estado: 'observada',
        },
      ],
      'trigo.roya_hoja',
    );
    const incoherente = resolverResistencia(
      [
        {
          enfermedad: 'Roya de la Hoja',
          estado: 'observada',
          perfil: 'R',
          multiplicador: 1,
        },
      ],
      'trigo.roya_hoja',
    );
    expect(sinEstado.desconocida).toBe(true);
    expect(sinEstado.estado).toBe('desconocida');
    expect(sinEstado.multiplicador).toBe(1);
    expect(sinEstado.indiceResistencia).toBe(0);
    expect(sinFactor.desconocida).toBe(true);
    expect(sinFactor.indiceResistencia).toBe(0);
    expect(incoherente.desconocida).toBe(true);
    expect(incoherente.limitaciones.join(' ')).toContain(
      'Perfil/factor varietal inconsistente',
    );
    expect(sinFactor.multiplicador).toBe(1);
    expect(incoherente.multiplicador).toBe(1);
  });

  it.each([undefined, null, '', 'texto', Number.NaN])(
    'usa el fallback susceptible ante un factor varietal invalido (%p)',
    (multiplicador) => {
      const resuelta = resolverResistencia(
        [
          {
            enfermedad: 'Roya de la Hoja',
            estado: 'observada',
            perfil: 'MR',
            multiplicador,
          } as any,
        ],
        'trigo.roya_hoja',
      );
      expect(resuelta.desconocida).toBe(true);
      expect(resuelta.multiplicador).toBe(1);
      expect(resuelta.indiceResistencia).toBe(0);
    },
  );

  it('no conserva un indice resistente si el factor varietal es invalido', () => {
    const resuelta = resolverResistencia(
      [
        {
          enfermedad: 'Roya del Maiz',
          estado: 'observada',
          multiplicador: '',
          indiceResistencia: 1,
        } as any,
      ],
      'maiz.roya',
    );

    expect(resuelta.desconocida).toBe(true);
    expect(resuelta.multiplicador).toBe(1);
    expect(resuelta.indiceResistencia).toBe(0);
  });

  it.each([undefined, null, '', 'texto', Number.NaN])(
    'deriva el indice desde un factor trazable cuando el IR es invalido (%p)',
    (indiceResistencia) => {
      const resuelta = resolverResistencia(
        [
          {
            enfermedad: 'Roya del Maiz',
            estado: 'observada',
            multiplicador: 0.5,
            indiceResistencia,
          } as any,
        ],
        'maiz.roya',
      );

      expect(resuelta.desconocida).toBe(false);
      expect(resuelta.multiplicador).toBe(0.5);
      expect(resuelta.indiceResistencia).toBeCloseTo(2 / 3);
    },
  );

  it('mantiene monotonicidad biológica en roya: R no supera a S', () => {
    const R = calcularRoyaHoja(20, 5, 1);
    const MR = calcularRoyaHoja(20, 5, 2 / 3);
    const MS = calcularRoyaHoja(20, 5, 1 / 3);
    const S = calcularRoyaHoja(20, 5, 0);
    expect(R).toBeLessThanOrEqual(MR);
    expect(MR).toBeLessThanOrEqual(MS);
    expect(MS).toBeLessThanOrEqual(S);
    expect(S).toBeCloseTo(19.47, 2);
  });

  it('reproduce exactamente el contrato 2026 de roya de la hoja con S/MS/MR/R', () => {
    const ambiental = 4.42 + 0.61 * 50 + 0.57 * 5;
    expect(calcularRoyaHojaTrigo2026(50, 5, 1)).toBeCloseTo(ambiental, 6);
    expect(calcularRoyaHojaTrigo2026(50, 5, 0.75)).toBeCloseTo(
      ambiental - 30.01 * 0.25,
      6,
    );
    expect(calcularRoyaHojaTrigo2026(50, 5, 0.5)).toBeCloseTo(
      ambiental - 30.01 * 0.5,
      6,
    );
    expect(calcularRoyaHojaTrigo2026(50, 5, 0.05)).toBeCloseTo(
      ambiental - 30.01 * 0.95,
      6,
    );
  });

  it('reproduce la roya experimental 2026 y no reutiliza el indice legado', () => {
    const S = calcularRoyaAnaranjadaTrigo2026(50, 4, 2, 1);
    const MS = calcularRoyaAnaranjadaTrigo2026(50, 4, 2, 0.75);
    const MR = calcularRoyaAnaranjadaTrigo2026(50, 4, 2, 0.5);
    const R = calcularRoyaAnaranjadaTrigo2026(50, 4, 2, 0.05);
    expect(S).toBeCloseTo(43.77, 2);
    expect(MS).toBeCloseTo(34.97, 2);
    expect(MR).toBeCloseTo(26.17, 2);
    expect(R).toBeCloseTo(10.33, 2);
    expect(R).toBeLessThan(MR);
    expect(MR).toBeLessThan(MS);
    expect(MS).toBeLessThan(S);
    expect(MR).not.toBeCloseTo(calcularRoyaAnaranjada(50, 4, 2, 2 / 3), 2);
  });

  it('abre la ventana foliar a 850 GDD o por fenologia observada, no antes', () => {
    const base = {
      coberturaGdd: 0.9,
      etapa: 2,
      fenologiaObservada: false,
    };
    expect(
      resolverVentanaSanitariaFoliarTrigo({
        ...base,
        gddBase0DesdeSiembra: 849.99,
      }).activa,
    ).toBe(false);
    expect(
      resolverVentanaSanitariaFoliarTrigo({
        ...base,
        gddBase0DesdeSiembra: 850,
      }).activa,
    ).toBe(true);
    expect(
      resolverVentanaSanitariaFoliarTrigo({
        ...base,
        gddBase0DesdeSiembra: 900,
        coberturaGdd: 0.899,
      }).activa,
    ).toBe(false);
    expect(
      resolverVentanaSanitariaFoliarTrigo({
        gddBase0DesdeSiembra: 400,
        coberturaGdd: 0,
        etapa: 2,
        fenologiaObservada: true,
      }).activa,
    ).toBe(true);
    expect(
      resolverVentanaSanitariaFoliarTrigo({
        gddBase0DesdeSiembra: 400,
        coberturaGdd: 1,
        etapa: 1,
        fenologiaObservada: true,
      }).activa,
    ).toBe(false);
  });

  it('no permite que temperaturas negativas resten GDD base cero', () => {
    expect(gradosDiaBase0(-4)).toBe(0);
    expect(gradosDiaBase0(0)).toBe(0);
    expect(gradosDiaBase0(12.5)).toBe(12.5);
  });

  it('respeta HR estrictamente mayor a 49% para GD de roya de la hoja', () => {
    expect(gradosDiaRoya(49, 15)).toBe(0);
    expect(gradosDiaRoya(49.01, 15)).toBe(3);
  });

  it('mantiene las ecuaciones contractuales de manchas y Fusarium', () => {
    expect(calcularManchaAmarilla(3, 2, 0.75)).toBeCloseTo(3.9075, 4);
    expect(calcularManchaHoja(10, 3, 0.5)).toBeCloseTo(3.93, 3);
    expect(calcularFusariumEspiga(2, 5, 0.75)).toBeCloseTo(26.385, 3);
  });

  it('usa una unica escala de severidad en tarjetas e informes', () => {
    expect(getUmbralesRiesgoSanitario('Trigo')).toEqual({
      medio: 15,
      alto: 20,
      escalaDirecta: false,
    });
    expect(getUmbralesRiesgoSanitario('Cebada')).toEqual({
      medio: 35,
      alto: 60,
      escalaDirecta: true,
    });
    expect(clasificarNivelRiesgoSanitario(20, 'Trigo')).toBe('alto');
    expect(clasificarNivelRiesgoSanitario(20, 'Cebada')).toBe('bajo');
    expect(clasificarNivelRiesgoSanitario(35, 'Cebada')).toBe('medio');
    expect(clasificarNivelRiesgoSanitario(60, 'Cebada')).toBe('alto');
  });

  it('separa una lectura operativa baja de una alerta sanitaria', () => {
    const anioActual = new Date().getUTCFullYear();
    const lecturaBaja = {
      idEnfermedad: 'trigo.roya_hoja' as const,
      resultado: 8,
      estado: 'calculado' as const,
      modelo: {
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        validacion: 'operativo' as const,
      },
      calidadDatos: { nivel: 'media' as const },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: `${anioActual - 1}-${anioActual}`,
      },
      variables: { resultadoCrudo: 8 },
    };

    expect(esLecturaSanitariaOperativa(lecturaBaja)).toBe(true);
    expect(esPrediccionSanitariaAlertable(lecturaBaja)).toBe(false);
  });

  it('exige evidencia horaria y presion alta para alertar Mancha en Red v4', () => {
    const lecturaCebada = {
      idEnfermedad: 'cebada.mancha_red' as const,
      resultado: 20,
      estado: 'calculado' as const,
      modelo: {
        version: CEBADA_MANCHA_RED_MOTOR_VERSION,
        validacion: 'operativo' as const,
      },
      calidadDatos: { nivel: 'media' as const },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
      },
      variables: {
        formulaVersion: CEBADA_MANCHA_RED_MOTOR_VERSION,
        coberturaVentana: 1,
        diasFavorablesVentana: 1,
      },
    };

    expect(esLecturaSanitariaOperativa(lecturaCebada)).toBe(true);
    expect(clasificarNivelRiesgoSanitario(20, 'Cebada')).toBe('bajo');
    expect(esPrediccionSanitariaAlertable(lecturaCebada)).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...lecturaCebada,
        resultado: CEBADA_MANCHA_RED_UMBRAL_ALERTA - 0.1,
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...lecturaCebada,
        resultado: CEBADA_MANCHA_RED_UMBRAL_ALERTA,
      }),
    ).toBe(true);
    expect(
      esPrediccionSanitariaAlertable({
        ...lecturaCebada,
        resultado: 100,
        variables: {
          formulaVersion: CEBADA_MANCHA_RED_MOTOR_VERSION,
          coberturaVentana: 0.5,
          diasFavorablesVentana: 3,
        },
      }),
    ).toBe(false);
    expect(
      esLecturaSanitariaOperativa({
        ...lecturaCebada,
        modelo: { version: 1, validacion: 'experimental' },
      }),
    ).toBe(false);
    expect(
      esLecturaSanitariaOperativa({
        ...lecturaCebada,
        resultado: 101,
      }),
    ).toBe(false);
  });

  it('rechaza como operativas las lecturas experimentales, provisionales o sin trazabilidad vigente', () => {
    const anioActual = new Date().getUTCFullYear();
    const candidato = {
      idEnfermedad: 'trigo.roya_hoja' as const,
      resultado: 20,
      estado: 'calculado' as const,
      modelo: {
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        validacion: 'operativo' as const,
      },
      calidadDatos: { nivel: 'media' as const },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: `${anioActual - 1}-${anioActual}`,
      },
      variables: { resultadoCrudo: 20 },
    };

    const noOperativos = [
      {
        nombre: 'estado sin datos',
        valor: {
          ...candidato,
          estado: 'sin_datos' as const,
        },
      },
      {
        nombre: 'resultado no finito',
        valor: {
          ...candidato,
          resultado: Number.NaN,
        },
      },
      {
        nombre: 'enfermedad experimental',
        valor: {
          ...candidato,
          idEnfermedad: 'trigo.roya_anaranjada' as const,
        },
      },
      {
        nombre: 'validacion provisional',
        valor: {
          ...candidato,
          modelo: {
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            validacion: 'operativo_provisional' as const,
          },
        },
      },
      {
        nombre: 'validacion experimental',
        valor: {
          ...candidato,
          modelo: {
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            validacion: 'experimental' as const,
          },
        },
      },
      {
        nombre: 'version anterior',
        valor: {
          ...candidato,
          modelo: {
            version: TRIGO_MOTOR_SANITARIO_VERSION - 1,
            validacion: 'operativo' as const,
          },
        },
      },
      {
        nombre: 'campania sanitaria vencida',
        valor: {
          ...candidato,
          resistenciaUsada: {
            estado: 'historica' as const,
            confianza: 'media' as const,
            campaniaFuente: `${anioActual - 4}-${anioActual - 3}`,
          },
        },
      },
      {
        nombre: 'calidad baja',
        valor: {
          ...candidato,
          calidadDatos: { nivel: 'baja' as const },
        },
      },
      {
        nombre: 'calidad sin datos',
        valor: {
          ...candidato,
          calidadDatos: { nivel: 'sin_datos' as const },
        },
      },
      {
        nombre: 'resistencia desconocida',
        valor: {
          ...candidato,
          resistenciaUsada: {
            estado: 'desconocida' as const,
            confianza: 'sin_datos' as const,
          },
        },
      },
      {
        nombre: 'resistencia sin estado trazable',
        valor: {
          ...candidato,
          resistenciaUsada: {
            confianza: 'alta' as const,
            campaniaFuente: `${anioActual - 1}-${anioActual}`,
          },
        },
      },
    ];

    for (const caso of noOperativos) {
      expect({
        nombre: caso.nombre,
        operativa: esLecturaSanitariaOperativa(caso.valor),
      }).toEqual({ nombre: caso.nombre, operativa: false });
      expect(esPrediccionSanitariaAlertable(caso.valor)).toBe(false);
    }
  });

  it('mantiene alertable una formula operativa valida por encima del umbral', () => {
    const anioActual = new Date().getUTCFullYear();
    const candidato = {
      idEnfermedad: 'trigo.roya_hoja' as const,
      resultado: calcularRoyaHojaTrigo2026(50, 5, 1),
      estado: 'calculado' as const,
      modelo: {
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        validacion: 'operativo' as const,
      },
      calidadDatos: { nivel: 'alta' as const },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: `${anioActual - 1}-${anioActual}`,
      },
      variables: {
        resultadoCrudo: calcularRoyaHojaTrigo2026(50, 5, 1),
      },
    };

    expect(esLecturaSanitariaOperativa(candidato)).toBe(true);
    expect(esPrediccionSanitariaAlertable(candidato)).toBe(true);
  });

  it('solo habilita alertas sanitarias operativas, vigentes y trazables', () => {
    const candidato = {
      idEnfermedad: 'trigo.roya_hoja' as const,
      resultado: 20,
      estado: 'calculado' as const,
      modelo: {
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        validacion: 'operativo' as const,
      },
      calidadDatos: { nivel: 'media' as const },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: `${new Date().getUTCFullYear() - 1}-${new Date().getUTCFullYear()}`,
      },
      variables: { resultadoCrudo: 20 },
    };
    expect(esPrediccionSanitariaAlertable(candidato)).toBe(true);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        idEnfermedad: 'trigo.roya_anaranjada',
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        modelo: { version: 3 },
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        resistenciaUsada: { estado: 'desconocida' },
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        resistenciaUsada: {
          estado: 'historica',
          confianza: 'media',
          campaniaFuente: '2020-2021',
        },
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        variables: { resultadoCrudo: 101 },
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        modelo: {
          version: TRIGO_MOTOR_SANITARIO_VERSION,
          validacion: 'experimental',
        },
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        idEnfermedad: 'trigo.fusarium_espiga',
        resultado: 20.37,
        variables: { resultadoCrudo: 20.37, PMoj: 0 },
      }),
    ).toBe(false);
    expect(
      esPrediccionSanitariaAlertable({
        ...candidato,
        idEnfermedad: 'trigo.fusarium_espiga',
        resultado: 29,
        variables: { resultadoCrudo: 29, PMoj: 1 },
      }),
    ).toBe(true);
  });

  it('no convierte un backfill sanitario historico en alerta actual', () => {
    const ahora = new Date('2026-07-15T12:00:00.000Z').getTime();
    expect(
      esFechaPrediccionSanitariaReciente('2026-07-14T03:00:00.000Z', ahora),
    ).toBe(true);
    expect(
      esFechaPrediccionSanitariaReciente('2026-07-01T03:00:00.000Z', ahora),
    ).toBe(false);
  });

  it('usa la misma acumulación térmica de maíz bajo HR crítica', () => {
    expect(gradosDiaRoyaMaiz(94, 17)).toBe(0);
    expect(gradosDiaRoyaMaiz(95, 7)).toBe(0);
    expect(gradosDiaRoyaMaiz(95, 12)).toBe(4);
    expect(gradosDiaRoyaMaiz(98, 20)).toBe(9);
  });

  it('convierte el multiplicador susceptible histórico a IR=0', () => {
    expect(indiceResistenciaDesdeMultiplicador(0.05)).toBe(1);
    expect(indiceResistenciaDesdeMultiplicador(0.5)).toBeCloseTo(2 / 3);
    expect(indiceResistenciaDesdeMultiplicador(0.75)).toBeCloseTo(1 / 3);
    expect(indiceResistenciaDesdeMultiplicador(1)).toBe(0);
  });

  it('reproduce la tasa horaria del primer día del Excel de Mancha en Red', () => {
    const temperaturas = [
      6, 7, 9, 11, 23, 21, 13, 14, 6, 3, 4, 2, 9, 11, 23, 24, 31, 11, 11, 12, 5,
      6, 7, 8,
    ];
    const humedades = [
      91, 90, 88, 23, 35, 90, 91, 95, 91, 90, 88, 78, 68, 90, 91, 95, 75, 74,
      90, 91, 95, 91, 90, 88,
    ];
    const horas = temperaturas.map((temperatura, index) => ({
      temperatura,
      humedadRelativa: humedades[index],
    }));
    const tasa = tasaDiariaManchaRedHoraria(horas, 1.2);
    expect(tasa).toBeCloseTo(0.419, 3);
    expect(acumularSeveridadManchaRed(0, tasa)).toBe(0.1);
  });

  it('modela episodios de infeccion de Mancha en Red sin confundirlos con severidad observada', () => {
    const seco = calcularEventoInfeccionManchaRed({
      horasMojadoContinuo: 2,
      temperaturaMojado: 20,
      multiplicadorVarietal: 1,
    });
    const referencia100GradosHora = calcularEventoInfeccionManchaRed({
      horasMojadoContinuo: 100 / 18,
      temperaturaMojado: 20,
      multiplicadorVarietal: 1,
    });
    const susceptible = calcularEventoInfeccionManchaRed({
      horasMojadoContinuo: 12,
      temperaturaMojado: 20,
      multiplicadorVarietal: 1,
    });
    const resistente = calcularEventoInfeccionManchaRed({
      horasMojadoContinuo: 12,
      temperaturaMojado: 20,
      multiplicadorVarietal: 0.3,
    });

    expect(seco.riesgo).toBe(0);
    expect(referencia100GradosHora.gradosHora).toBeCloseTo(100, 4);
    expect(referencia100GradosHora.riesgo).toBeCloseTo(40, 4);
    expect(susceptible.riesgo).toBeGreaterThan(resistente.riesgo);
    const cicloHumedo = calcularPresionCicloManchaRed(
      Array.from({ length: 14 }, () => susceptible),
      1,
    );
    expect(cicloHumedo.indice).toBeGreaterThan(susceptible.riesgo);
    expect(cicloHumedo.indice).toBeLessThan(90);
    expect(cicloHumedo.diasFavorables).toBe(14);
    expect(calcularPresionCicloManchaRed([], 1).indice).toBe(0);
  });

  it('clasifica mildiu de arveja con los umbrales experimentales publicados', () => {
    expect(
      evaluarMildiuArveja({
        temperatura: 16,
        horasMojado: 6,
        humedadRelativa: 94,
      }).nivel,
    ).toBe('alto');
    expect(
      evaluarMildiuArveja({
        temperatura: 16,
        horasMojado: 4,
        humedadRelativa: 85,
      }).nivel,
    ).toBe('medio');
    expect(
      evaluarMildiuArveja({
        temperatura: 16,
        horasMojado: 3,
        humedadRelativa: 98,
      }).nivel,
    ).toBe('bajo');
  });

  it('mantiene Ascochyta como aptitud ambiental y exige mojado mas lluvia para nivel alto', () => {
    expect(
      evaluarAscochytaArveja({ temperatura: 20, horasMojado: 8, lluviaMm: 2 })
        .nivel,
    ).toBe('alto');
    expect(
      evaluarAscochytaArveja({ temperatura: 20, horasMojado: 8, lluviaMm: 0 })
        .nivel,
    ).toBe('medio');
    expect(
      evaluarAscochytaArveja({ temperatura: 20, horasMojado: 2, lluviaMm: 10 })
        .nivel,
    ).toBe('bajo');
  });

  it('solo prioriza oidio de arveja desde la etapa reproductiva', () => {
    expect(
      evaluarOidioArveja({
        temperatura: 24,
        lluviaMm: 0,
        etapaReproductiva: true,
      }).nivel,
    ).toBe('alto');
    expect(
      evaluarOidioArveja({
        temperatura: 24,
        lluviaMm: 0,
        etapaReproductiva: false,
      }).nivel,
    ).toBe('bajo');
  });

  it('usa un unico semaforo ejecutivo y reserva rojo para una alerta realmente habilitada', () => {
    const base = {
      idEnfermedad: 'cebada.mancha_red' as const,
      estado: 'calculado' as const,
      modelo: { version: 4, validacion: 'operativo' as const },
      calidadDatos: { nivel: 'alta' as const },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: '2025-2026',
      },
      variables: {
        formulaVersion: 4,
        coberturaVentana: 0.9,
        diasFavorablesVentana: 2,
      },
    };

    expect(
      evaluarSanidadAgregada([{ ...base, resultado: 60 }], 'Cebada')
        .semaforo,
    ).toBe('amarillo');
    expect(
      evaluarSanidadAgregada([{ ...base, resultado: 70 }], 'Cebada')
        .semaforo,
    ).toBe('rojo');
    expect(
      evaluarSanidadAgregada(
        [
          {
            ...base,
            resultado: 100,
            modelo: { version: 4, validacion: 'operativo_provisional' },
          },
        ],
        'Cebada',
      ).semaforo,
    ).toBe('verde');
  });
});
