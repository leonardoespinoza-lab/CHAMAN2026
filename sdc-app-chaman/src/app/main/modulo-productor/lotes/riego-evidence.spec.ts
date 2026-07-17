import { evaluarRiegoFrontend, tieneSensorHumedadSuelo } from './riego-evidence';

describe('evaluarRiegoFrontend', () => {
  it('infiere legacy V13 solo con cantidades validas y motivo explicito de recomendacion por balance', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        estadoCalculoAguaUtil: 'estimado',
        aguaUtilReal: 0,
        motivoCalculoAguaUtil:
          'Sin lanza/sonda de humedad: recomendacion estimada por balance ET0, Kc, lluvia reciente y pronostico.',
        ultimaPrediccionRiego: [
          { fecha: '2026-07-14', cantidad: 0 },
          { fecha: '2026-07-15', cantidad: 0 },
        ],
      } as any,
      { dispositivos: [] } as any
    );

    expect(evaluacion.origenEstado).toBe('legacy_v13');
    expect(evaluacion.estado).toBe('estimada');
    expect(evaluacion.fuente).toBe('balance_climatico');
    expect(evaluacion.serieDisponible).toBeTrue();
    expect(evaluacion.cantidadHoy).toBe(0);
    expect(evaluacion.sinDemanda).toBeTrue();
  });

  it('no infiere legacy si el motivo no identifica una recomendacion estimada por balance', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        motivoCalculoAguaUtil: 'Balance de agua util pendiente de validacion.',
        ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
      } as any,
      {} as any
    );

    expect(evaluacion.origenEstado).toBe('sin_estado');
    expect(evaluacion.estado).toBeUndefined();
    expect(evaluacion.serieDisponible).toBeFalse();
    expect(evaluacion.sinDemanda).toBeFalse();
  });

  it('no habilita la serie por tener sensor cuando el estado explicito es fallido', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        estadoRecomendacionRiego: 'fallida',
        fuenteRecomendacionRiego: 'sensor_suelo',
        ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 8 }],
      } as any,
      { sondaSuelo: { _id: 'sonda-1' } } as any
    );

    expect(evaluacion.tieneSensor).toBeTrue();
    expect(evaluacion.estado).toBe('fallida');
    expect(evaluacion.serieDisponible).toBeFalse();
    expect(evaluacion.serie).toEqual([]);
    expect(evaluacion.cantidadHoy).toBeNull();
  });

  it('no interpreta una estimacion vacia como ausencia de demanda', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        estadoRecomendacionRiego: 'estimada',
        fuenteRecomendacionRiego: 'balance_climatico',
        ultimaPrediccionRiego: [],
      } as any,
      {} as any
    );

    expect(evaluacion.esEstimada).toBeTrue();
    expect(evaluacion.serieDisponible).toBeFalse();
    expect(evaluacion.sinDemanda).toBeFalse();
    expect(evaluacion.cantidadHoy).toBeNull();
  });

  it('mantiene sensor mas estado estimado como balance modelado y conserva ceros validos', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        estadoRecomendacionRiego: 'estimada',
        fuenteRecomendacionRiego: 'balance_climatico',
        estadoCalculoAguaUtil: 'estimado',
        aguaUtilReal: 18,
        ultimaPrediccionRiego: [
          { fecha: '2026-07-14', cantidad: 0 },
          { fecha: '2026-07-15', cantidad: 3 },
        ],
      } as any,
      { idSondaSuelo: 'sonda-2' } as any
    );

    expect(evaluacion.tieneSensor).toBeTrue();
    expect(evaluacion.esEstimada).toBeTrue();
    expect(evaluacion.serieDisponible).toBeTrue();
    expect(evaluacion.cantidadHoy).toBe(0);
    expect(evaluacion.aportesPositivos.map((item) => item.cantidad)).toEqual([3]);
    expect(evaluacion.sinDemanda).toBeFalse();
  });

  it('unifica la deteccion de sonda, id de sonda y dispositivo de humedad', () => {
    expect(tieneSensorHumedadSuelo({ sondaSuelo: {} } as any)).toBeTrue();
    expect(tieneSensorHumedadSuelo({ idSondaSuelo: 'sonda-3' } as any)).toBeTrue();
    expect(tieneSensorHumedadSuelo({ dispositivos: [{ tipo: 'Sensor de Humedad de Suelo' }] } as any)).toBeTrue();
    expect(tieneSensorHumedadSuelo({ dispositivos: [{ tipo: 'Camara' }] } as any)).toBeFalse();
  });

  it('conserva una recomendacion legacy calculada solo si tiene sensor y agua util calculada', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        estadoCalculoAguaUtil: 'calculado',
        aguaUtilReal: 22,
        ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 5 }],
      } as any,
      { idSondaSuelo: 'sonda-legacy' } as any
    );

    expect(evaluacion.origenEstado).toBe('legacy_sensor');
    expect(evaluacion.estado).toBe('calculada');
    expect(evaluacion.fuente).toBe('sensor_suelo');
    expect(evaluacion.serieDisponible).toBeTrue();
    expect(evaluacion.cantidadHoy).toBe(5);
  });

  it('bloquea una serie aunque tenga cantidades si no existe una reserva hidrica valida', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        estadoRecomendacionRiego: 'estimada',
        fuenteRecomendacionRiego: 'balance_climatico',
        estadoCalculoAguaUtil: 'no_disponible',
        ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
      } as any,
      {} as any
    );

    expect(evaluacion.estado).toBe('estimada');
    expect(evaluacion.serieDisponible).toBeFalse();
    expect(evaluacion.cantidadHoy).toBeNull();
    expect(evaluacion.sinDemanda).toBeFalse();
  });

  it('da prioridad a un estado terminal aunque haya quedado una fuente estimada previa', () => {
    const evaluacion = evaluarRiegoFrontend(
      {
        estadoRecomendacionRiego: 'fallida',
        fuenteRecomendacionRiego: 'balance_climatico',
        ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
      } as any,
      {} as any
    );

    expect(evaluacion.estado).toBe('fallida');
    expect(evaluacion.fuente).toBeUndefined();
    expect(evaluacion.esEstimada).toBeFalse();
    expect(evaluacion.serieDisponible).toBeFalse();
  });
});
