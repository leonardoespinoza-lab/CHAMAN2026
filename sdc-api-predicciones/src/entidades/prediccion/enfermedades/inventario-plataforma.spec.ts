import {
  CEBADA_MANCHA_RED_AGREGACION_VERSION,
  CEBADA_MANCHA_RED_MOTOR_VERSION,
  ENFERMEDADES_CANONICAS,
  esLecturaSanitariaOperativa,
  esPrediccionSanitariaAlertable,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';

describe('inventario sanitario integral de CHAMAN2026', () => {
  it('mantiene 34 patologias canonicas sin identificadores duplicados', () => {
    const ids = ENFERMEDADES_CANONICAS.map((item) => item.id);
    const porEstado = ENFERMEDADES_CANONICAS.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.motor] = (acc[item.motor] || 0) + 1;
        return acc;
      },
      {},
    );

    expect(ids).toHaveLength(34);
    expect(new Set(ids).size).toBe(ids.length);
    expect(porEstado).toEqual({
      operativo: 10,
      sin_modelo: 20,
      experimental: 4,
    });
  });

  it.each(
    ENFERMEDADES_CANONICAS.filter((item) => item.motor !== 'operativo'),
  )('$id nunca se vuelve operativo por recibir un numero alto', (definicion) => {
    const lectura = {
      idEnfermedad: definicion.id,
      enfermedad: definicion.nombre,
      resultado: 100,
      estado: 'calculado' as const,
      modelo: { version: 99, validacion: 'operativo' as const },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: '2025/2026',
      },
      calidadDatos: { nivel: 'alta' as const },
      variables: { resultadoCrudo: 100 },
    };

    expect(esLecturaSanitariaOperativa(lectura)).toBe(false);
    expect(esPrediccionSanitariaAlertable(lectura)).toBe(false);
  });

  it('un resultado provisional saturado tampoco emite una alerta', () => {
    const lectura = {
      idEnfermedad: 'trigo.mancha_amarilla' as const,
      enfermedad: 'Mancha Amarilla' as const,
      resultado: 100,
      estado: 'calculado' as const,
      modelo: {
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        validacion: 'operativo_provisional' as const,
      },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: '2025/2026',
      },
      calidadDatos: { nivel: 'alta' as const },
      variables: { resultadoCrudo: 100 },
    };

    expect(esLecturaSanitariaOperativa(lectura)).toBe(false);
    expect(esPrediccionSanitariaAlertable(lectura)).toBe(false);
  });

  it('una lectura legacy sin validacion explicita nunca es operativa', () => {
    const lectura = {
      idEnfermedad: 'soja.fin_ciclo' as const,
      enfermedad: 'Fin de Ciclo' as const,
      resultado: 88,
      estado: 'calculado' as const,
      modelo: { version: 3 },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: '2025/2026',
      },
      calidadDatos: { nivel: 'alta' as const },
      variables: {},
    };

    expect(esLecturaSanitariaOperativa(lectura)).toBe(false);
    expect(esPrediccionSanitariaAlertable(lectura)).toBe(false);
  });

  it('Mancha en Red solo alerta con contrato v4 y evidencia ambiental suficiente', () => {
    const base = {
      idEnfermedad: 'cebada.mancha_red' as const,
      enfermedad: 'Mancha en Red' as const,
      resultado: 75,
      estado: 'calculado' as const,
      modelo: {
        version: CEBADA_MANCHA_RED_MOTOR_VERSION,
        validacion: 'operativo' as const,
      },
      resistenciaUsada: {
        estado: 'observada' as const,
        confianza: 'alta' as const,
        campaniaFuente: '2025/2026',
      },
      calidadDatos: { nivel: 'alta' as const },
      variables: {
        formulaVersion: CEBADA_MANCHA_RED_MOTOR_VERSION,
        agregacionVersion: CEBADA_MANCHA_RED_AGREGACION_VERSION,
        coberturaVentana: 0.95,
        diasFavorablesVentana: 2,
      },
    };

    expect(esLecturaSanitariaOperativa(base)).toBe(true);
    expect(esPrediccionSanitariaAlertable(base)).toBe(true);
    expect(
      esPrediccionSanitariaAlertable({
        ...base,
        variables: { ...base.variables, coberturaVentana: 0.4 },
      }),
    ).toBe(false);
  });
});
