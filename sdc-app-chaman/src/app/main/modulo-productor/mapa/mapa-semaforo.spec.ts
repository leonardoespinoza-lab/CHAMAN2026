import {
  COLOR_SEMAFORO_MAPA,
  estadoFrioSemaforo,
  estadoHeladaSemaforo,
  estadoRiegoSemaforo,
  estadoSanidadSemaforo,
} from './mapa-semaforo';

describe('semaforo operativo global del mapa', () => {
  it('representa falta de balance de riego como precaucion y nunca gris', () => {
    expect(estadoRiegoSemaforo('sin_datos')).toBe('precaucion');
    expect(COLOR_SEMAFORO_MAPA[estadoRiegoSemaforo('sin_datos')]).toContain('243, 216, 64');
  });

  it('representa la falta de prediccion sanitaria como precaucion amarilla', () => {
    expect(estadoSanidadSemaforo('sin-prediccion')).toBe('precaucion');
    expect(estadoSanidadSemaforo('bajo')).toBe('ok');
    expect(estadoSanidadSemaforo('medio')).toBe('precaucion');
    expect(estadoSanidadSemaforo('alto')).toBe('alerta');
  });

  it('mantiene verde un cultivo al que no aplica la tarjeta de frio perenne', () => {
    expect(estadoFrioSemaforo(false, false)).toBe('ok');
  });

  it('evalua heladas para cultivos anuales y perennes con la misma escala', () => {
    expect(estadoHeladaSemaforo(-1)).toBe('alerta');
    expect(estadoHeladaSemaforo(1.5)).toBe('precaucion');
    expect(estadoHeladaSemaforo(4)).toBe('ok');
    expect(estadoHeladaSemaforo(null)).toBe('precaucion');
  });
});
