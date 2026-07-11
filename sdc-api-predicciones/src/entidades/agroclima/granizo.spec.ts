import { evaluarRiesgoGranizoAgroclimatico } from 'modelos/src';

describe('evaluarRiesgoGranizoAgroclimatico', () => {
  it('limita CAPE alto sin soporte humedo para evitar falsos positivos', () => {
    const resultado = evaluarRiesgoGranizoAgroclimatico({
      weatherCode: 3,
      cape: 2200,
      lluvia: 0,
      probabilidadLluvia: 6,
      showers: 0,
      rafagaViento: 22,
      temperaturaMax: 25,
    });

    expect(resultado.posibilidadPct).toBe(8);
    expect(resultado.evidencia).toContain(
      'Sin lluvia/chaparrones suficientes: Chaman limita el riesgo para evitar falso positivo.',
    );
  });

  it('no eleva una tormenta con granizo sin volumen de precipitacion', () => {
    const resultado = evaluarRiesgoGranizoAgroclimatico({
      weatherCode: 99,
      cape: 1600,
      lluvia: 0,
      probabilidadLluvia: 20,
      showers: 0,
      rafagaViento: 55,
      temperaturaMax: 24,
    });

    expect(resultado.posibilidadPct).toBe(15);
  });

  it('eleva el indice cuando coinciden tormenta, CAPE y precipitacion', () => {
    const resultado = evaluarRiesgoGranizoAgroclimatico({
      weatherCode: 95,
      cape: 1500,
      lluvia: 12.6,
      probabilidadLluvia: 38,
      showers: 12.6,
      rafagaViento: 22.9,
      temperaturaMax: 19.9,
    });

    expect(resultado.posibilidadPct).toBe(68);
    expect(resultado.calidadDatos.nivel).toBe('media');
  });

  it('produce un indice alto con multiples soportes severos independientes', () => {
    const resultado = evaluarRiesgoGranizoAgroclimatico({
      weatherCode: 99,
      cape: 2200,
      lluvia: 12.6,
      probabilidadLluvia: 38,
      showers: 10,
      rafagaViento: 60,
      temperaturaMax: 25,
    });

    expect(resultado.posibilidadPct).toBe(92);
    expect(resultado.calidadDatos.nivel).toBe('media');
  });
});
