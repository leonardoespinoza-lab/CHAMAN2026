import {
  calcularBalanceHidrico,
  calcularEt0Fao56,
  calcularFotoperiodoHoras,
  calcularGdd,
  calcularMojadoFoliarEstimado,
  calcularVpdKpa,
  PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA,
} from 'modelos/src';

describe('calculos agrometeorologicos puros', () => {
  it('calcula grados dia con temperatura base y techo', () => {
    expect(
      calcularGdd({
        temperatureMinC: 5,
        temperatureMaxC: 25,
        baseTemperatureC: 10,
        upperTemperatureC: 30,
      }),
    ).toBeCloseTo(7.5, 6);
    expect(
      calcularGdd({
        temperatureMinC: -4,
        temperatureMaxC: 44,
        baseTemperatureC: 10,
        upperTemperatureC: 30,
      }),
    ).toBeCloseTo(10, 6);
  });

  it('usa en trigo la referencia termica FAO AquaCrop de 0 a 26 C', () => {
    expect(
      PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA.Trigo?.temperaturaBaseC,
    ).toBe(0);
    expect(
      PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA.Trigo?.temperaturaSuperiorC,
    ).toBe(26);
  });

  it('define profundidades radiculares conservadoras para todos los cultivos', () => {
    const expectedDepths = {
      Maiz: 100,
      Soja: 60,
      Trigo: 100,
      Cebada: 100,
      Arveja: 60,
      Papa: 40,
      Vid: 100,
      Manzano: 100,
      Peral: 100,
      Pecan: 100,
    } as const;

    for (const [crop, depthCm] of Object.entries(expectedDepths)) {
      expect(
        PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA[
          crop as keyof typeof PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA
        ]?.profundidadRadicularCm,
      ).toBe(depthCm);
    }
  });

  it('calcula VPD en kPa y conserva los limites fisicos', () => {
    expect(calcularVpdKpa(25, 50)).toBeCloseTo(1.58, 2);
    expect(calcularVpdKpa(25, 100)).toBeCloseTo(0, 6);
    expect(calcularVpdKpa(25, 150)).toBeUndefined();
  });

  it('representa el cambio estacional del fotoperiodo en latitud pampeana', () => {
    const invierno = calcularFotoperiodoHoras('2026-06-21', -33);
    const verano = calcularFotoperiodoHoras('2026-12-21', -33);
    expect(invierno).toBeGreaterThan(9);
    expect(invierno).toBeLessThan(11);
    expect(verano).toBeGreaterThan(13.5);
    expect(verano).toBeLessThan(15);
  });

  it('calcula ET0 FAO-56 diaria en un rango agronomico plausible', () => {
    const et0 = calcularEt0Fao56({
      temperatureMinC: 15,
      temperatureMeanC: 22,
      temperatureMaxC: 30,
      relativeHumidityMinPct: 35,
      relativeHumidityMaxPct: 80,
      windSpeedMs: 2,
      solarRadiationMjM2: 20,
      latitude: -33,
      elevationM: 80,
      dayOfYear: 20,
    });
    expect(et0).toBeGreaterThan(3);
    expect(et0).toBeLessThan(8);
  });

  it('normaliza el viento medido a 10 m a la altura FAO de 2 m', () => {
    const common = {
      temperatureMinC: 15,
      temperatureMeanC: 22,
      temperatureMaxC: 30,
      relativeHumidityMinPct: 35,
      relativeHumidityMaxPct: 80,
      solarRadiationMjM2: 20,
      latitude: -33,
      elevationM: 80,
      dayOfYear: 20,
    };
    const atTenMetres = calcularEt0Fao56({
      ...common,
      windSpeedMs: 2.67,
      windMeasurementHeightM: 10,
    });
    const atTwoMetres = calcularEt0Fao56({
      ...common,
      windSpeedMs: 2,
      windMeasurementHeightM: 2,
    });
    expect(atTenMetres).toBeCloseTo(atTwoMetres as number, 1);
  });

  it('cierra el balance diario separando drenaje y escurrimiento por saturacion', () => {
    const result = calcularBalanceHidrico({
      previousStorageMm: 90,
      availableWaterCapacityMm: 100,
      precipitationMm: 40,
      irrigationMm: 0,
      etcMm: 5,
      effectiveRainCoefficient: 0.8,
      runoffCoefficient: 0.1,
      drainageCoefficient: 0.25,
    });
    expect(result.storageMm).toBe(100);
    expect(result.deepDrainageMm).toBeCloseTo(3.25, 6);
    expect(result.runoffMm).toBeCloseTo(13.75, 6);
    expect(result.availableWaterPercentage).toBe(100);
  });

  it('estima mojado foliar por lluvia o cercania al punto de rocio', () => {
    const wetness = calcularMojadoFoliarEstimado([
      { temperatureC: 12, relativeHumidityPct: 97, precipitationMm: 0 },
      { temperatureC: 12, relativeHumidityPct: 98, precipitationMm: 0.2 },
      { temperatureC: 17, relativeHumidityPct: 60, precipitationMm: 0 },
    ]);
    expect(wetness.hours).toBe(2);
    expect(wetness.maxContinuousHours).toBe(2);
    expect(wetness.estimated).toBe(true);
  });
});
