import { evaluarSanidadFrontend } from './sanidad-evidence';

describe('evidencia sanitaria compartida por mapas y listados', () => {
  const fechaVigente = new Date().toISOString();

  it('no agrega el resultado contractual de una roya experimental', () => {
    const evidencia = evaluarSanidadFrontend({
      ultimaPrediccion: {
        fecha: fechaVigente,
        enfermedades: [
          {
            idEnfermedad: 'trigo.roya_anaranjada',
            enfermedad: 'Roya Anaranjada',
            resultado: 67.81,
            estado: 'calculado',
            modelo: { version: 5, validacion: 'experimental' },
            calidadDatos: { nivel: 'baja' },
            variables: { frecuenciaAmbientalPct: 0, resultadoContractualLimitado: 67.81 },
          },
        ],
      },
    } as any);

    expect(evidencia.estado).toBe('seguimiento');
    expect(evidencia.operativas.length).toBe(0);
    expect(evidencia.maximo).toBeUndefined();
    expect(evidencia.semaforo).toBe('verde');
  });

  it('agrega solamente lecturas operativas, recientes y trazables', () => {
    const evidencia = evaluarSanidadFrontend({
      ultimaPrediccion: {
        fecha: fechaVigente,
        enfermedades: [
          {
            idEnfermedad: 'cebada.mancha_red',
            enfermedad: 'Mancha en Red',
            resultado: 42,
            estado: 'calculado',
            modelo: { version: 3, validacion: 'operativo' },
            calidadDatos: { nivel: 'media' },
            resistenciaUsada: {
              estado: 'observada',
              confianza: 'alta',
              campaniaFuente: '2025-2026',
            },
            variables: { resultadoCrudo: 42 },
          },
          {
            idEnfermedad: 'trigo.roya_anaranjada',
            enfermedad: 'Roya Anaranjada',
            resultado: 90,
            estado: 'calculado',
            modelo: { version: 5, validacion: 'experimental' },
            calidadDatos: { nivel: 'baja' },
          },
        ],
      },
    } as any);

    expect(evidencia.estado).toBe('operativo');
    expect(evidencia.operativas.length).toBe(1);
    expect(evidencia.principal?.enfermedad).toBe('Mancha en Red');
    expect(evidencia.maximo).toBe(42);
    expect(evidencia.semaforo).toBe('amarillo');
  });

  it('solo pinta rojo cuando la lectura satisface el contrato de alerta de Mancha en Red v4', () => {
    const base = {
      idEnfermedad: 'cebada.mancha_red',
      enfermedad: 'Mancha en Red',
      estado: 'calculado',
      modelo: { version: 4, validacion: 'operativo' },
      calidadDatos: { nivel: 'alta' },
      resistenciaUsada: {
        estado: 'observada',
        confianza: 'alta',
        campaniaFuente: '2025-2026',
      },
    };
    const evaluar = (resultado: number) =>
      evaluarSanidadFrontend({
        semilla: { cultivo: 'Cebada' },
        ultimaPrediccion: {
          fecha: fechaVigente,
          enfermedades: [
            {
              ...base,
              resultado,
              variables: {
                formulaVersion: 4,
                coberturaVentana: 0.9,
                diasFavorablesVentana: 2,
              },
            },
          ],
        },
      } as any);

    expect(evaluar(60).semaforo).toBe('amarillo');
    expect(evaluar(70).semaforo).toBe('rojo');
  });
});
