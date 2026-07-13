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

  it('mantiene como vigilancia la convergencia moderada sin duplicar lluvia y chaparrones', () => {
    const resultado = evaluarRiesgoGranizoAgroclimatico({
      weatherCode: 95,
      cape: 1500,
      lluvia: 12.6,
      probabilidadLluvia: 38,
      showers: 12.6,
      rafagaViento: 22.9,
      temperaturaMax: 19.9,
    });

    expect(resultado.posibilidadPct).toBe(51);
    expect(resultado.calidadDatos.nivel).toBe('media');
    expect(resultado.calidadDatos.score).toBeLessThanOrEqual(64);
  });

  it('produce senal fuerte solo con codigo de granizo y soportes severos convergentes', () => {
    const resultado = evaluarRiesgoGranizoAgroclimatico({
      weatherCode: 99,
      cape: 2200,
      lluvia: 12.6,
      probabilidadLluvia: 38,
      showers: 10,
      rafagaViento: 60,
      temperaturaMax: 25,
    });

    expect(resultado.posibilidadPct).toBe(71);
    expect(resultado.calidadDatos.nivel).toBe('media');
  });

  it('no cuenta dos veces el volumen si lluvia y chaparrones expresan el mismo evento', () => {
    const base = {
      weatherCode: 95,
      cape: 1500,
      lluvia: 12,
      probabilidadLluvia: 38,
      rafagaViento: 25,
      temperaturaMax: 20,
    };

    const soloLluvia = evaluarRiesgoGranizoAgroclimatico({
      ...base,
      showers: 0,
    });
    const lluviaYChaparron = evaluarRiesgoGranizoAgroclimatico({
      ...base,
      showers: 12,
    });

    expect(lluviaYChaparron.posibilidadPct).toBe(soloLluvia.posibilidadPct);
    expect(lluviaYChaparron.posibilidadPct).toBeLessThan(70);
  });

  it('permite senal fuerte sin codigo explicito solo ante convergencia excepcional', () => {
    const resultado = evaluarRiesgoGranizoAgroclimatico({
      weatherCode: 95,
      cape: 2600,
      lluvia: 12,
      probabilidadLluvia: 65,
      showers: 12,
      rafagaViento: 65,
      temperaturaMax: 27,
    });

    expect(resultado.posibilidadPct).toBe(70);
    expect(resultado.evidencia).toContain(
      'Convergencia severa excepcional sin codigo explicito de granizo.',
    );
  });
});
