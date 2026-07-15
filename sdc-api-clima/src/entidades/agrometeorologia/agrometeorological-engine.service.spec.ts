import {
  AGROMET_ENGINE_VERSION,
  IObservacionMeteorologicaNormalizada,
} from 'modelos/src';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';

describe('AgrometeorologicalEngineService', () => {
  const engine = new AgrometeorologicalEngineService({} as any, {} as any);
  const daily = (
    date: string,
    min: number,
    mean: number,
    max: number,
  ): IObservacionMeteorologicaNormalizada => ({
    idEstablecimiento: '64b000000000000000000003',
    timestamp: `${date}T15:00:00.000Z`,
    fechaLocal: date,
    timezone: 'America/Argentina/Cordoba',
    granularidad: 'daily',
    estado: 'estimated',
    esPronostico: false,
    valores: {
      temperatureMinC: min,
      temperatureMeanC: mean,
      temperatureMaxC: max,
      relativeHumidityMinPct: 40,
      relativeHumidityMeanPct: 65,
      relativeHumidityMaxPct: 90,
      precipitationMm: 2,
      shortwaveRadiationMjM2: 18,
      windSpeedMs: 2,
      et0Mm: 4,
    },
    fuente: 'open_meteo',
    fuentePorVariable: {
      temperatureMinC: 'open_meteo',
      temperatureMeanC: 'open_meteo',
      temperatureMaxC: 'open_meteo',
      precipitationMm: 'open_meteo',
      et0Mm: 'open_meteo',
    },
    banderasCalidad: [],
    completitudPct: 90,
    obtenidoEn: `${date}T16:00:00.000Z`,
  });
  const dailyWithSoil = (
    date: string,
    soilMoistureM3M3: Record<string, number>,
  ): IObservacionMeteorologicaNormalizada => {
    const observation = daily(date, 8, 16, 24);
    observation.valores.soilMoistureM3M3 = soilMoistureM3M3;
    observation.fuentePorVariable.soilMoistureM3M3 = 'open_meteo';
    return observation;
  };

  it('genera una serie diaria acumulativa, trazable y determinista', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
    const siembra = {
      _id: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fechaSiembra: '2026-07-10',
      semilla: {
        cultivo: 'Maiz',
        parametrosAgrometeorologicos: {
          version: 'test-v1',
          temperaturaBaseC: 10,
          temperaturaSuperiorC: 30,
          kcInicial: 0.3,
          kcMedio: 1.2,
          kcFinal: 0.5,
          profundidadRadicularCm: 60,
        },
      },
      crono: { etapas: { Emergencia: 10, Vegetativo: 30 } },
    } as any;
    const lote = {
      _id: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      capacidadDeCampo: 30,
      puntoMarchitez: 12,
      suelos: [],
    } as any;
    const observations = [
      daily('2026-07-10', 8, 16, 24),
      daily('2026-07-11', 10, 18, 26),
    ];

    const first = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );
    const second = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );

    expect(first).toHaveLength(2);
    expect(first[0].metricas.gddDaily).toBeCloseTo(7, 6);
    expect(first[1].metricas.gddAccumulated).toBeCloseTo(15, 6);
    expect(first[0].metricas.etcMm).toBeCloseTo(1.2, 6);
    expect(first[1].metricas.photoperiodHours).toBeGreaterThan(9);
    expect(first[1].fuentePorVariable.temperatureMeanC).toBe('open_meteo');
    expect(first).toEqual(second);
    jest.useRealTimers();
  });

  it('no inventa riego cuando no hay un evento fechado', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Soja' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );
    expect(result.metricas.irrigationMm).toBeUndefined();
    expect(result.advertencias.join(' ')).toContain(
      'No hay eventos de riego fechados',
    );
  });

  it('no convierte capacidad potencial del perfil en TAW sin capas hidraulicas continuas', () => {
    const siembra = {
      _id: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fechaSiembra: '2026-07-10',
      semilla: { cultivo: 'Soja' },
    } as any;
    const lote = {
      _id: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
    } as any;

    const [estimated] = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: lote._id,
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        depthLayers: [],
        provenance: {},
        rootZoneAvailableWaterMm: 142,
        effectiveDepthCm: 100,
        confidence: 'medium',
      } as any,
    );

    expect(estimated.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(estimated.banderasCalidad).toContain(
      'potential_profile_capacity_not_root_zone',
    );
    expect(estimated.advertencias.join(' ')).toContain(
      'capacidad potencial del perfil es descriptiva',
    );

    const [confirmed] = engine.calculateIndicators(
      siembra,
      {
        ...lote,
        suelos: [
          {
            profundidad: 100,
            capacidadDeCampo: 30,
            puntoMarchitez: 15,
            hayRaices: true,
          },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: lote._id,
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        depthLayers: [],
        provenance: {},
        rootZoneAvailableWaterMm: 142,
        effectiveDepthCm: 100,
        confidence: 'medium',
      } as any,
    );

    expect(confirmed.metricas.availableWaterCapacityMm).toBe(150);
    expect(confirmed.advertencias.join(' ')).not.toContain(
      'perfil edáfico estimado',
    );
  });

  it('aplica capas canonicas antes del balance y conserva su condicion estimada', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Soja' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 18,
        puntoMarchitez: 9,
        suelos: [],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        fieldCapacityPercentage: 30,
        wiltingPointPercentage: 15,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 100,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 15,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(90);
    expect(result.advertencias.join(' ')).toContain('estimado');
  });

  it('conserva el perfil uniforme confirmado cuando el assessment esta vencido', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Soja' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 12,
        sueloConfirmadoPorUsuario: true,
        sueloReferencia: { profundidadCm: 100 },
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: true,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        fieldCapacityPercentage: 40,
        wiltingPointPercentage: 20,
        depthLayers: [],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBeCloseTo(108, 6);
  });

  it('recorta un perfil 0-200 cm a la raiz objetivo sin integrar el ultimo horizonte', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'root-100-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 50, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 100, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 200, capacidadDeCampo: 55, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [
        dailyWithSoil('2026-07-10', {
          '0-50': 0.2,
          '50-100': 0.3,
          '100-200': 0.9,
        }),
      ],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.25, 6);
  });

  it('pondera parcialmente la ultima capa cuando el limite cae dentro del horizonte', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'partial-layer-test',
            estado: 'validado',
            profundidadRadicularCm: 50,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 30, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 100, capacidadDeCampo: 40, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-30': 0.1, '30-100': 0.3 })],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(120);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.18, 6);
  });

  it('integra SoilGrids con bounds explicitos aunque el lote tenga sensores puntuales', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'explicit-bounds-test',
            estado: 'validado',
            profundidadRadicularCm: 60,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 20, numeroDeSensor: 1 },
          { profundidad: 80, numeroDeSensor: 2 },
          { profundidad: 200, numeroDeSensor: 3 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        confidence: 'medium',
        effectiveDepthCm: 100,
        effectiveDepthConfidence: 'medium',
        effectiveDepthIsFallback: false,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 40,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 40,
            depthToCm: 100,
            fieldCapacityPercentage: 25,
            wiltingPointPercentage: 15,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 100,
            depthToCm: 200,
            fieldCapacityPercentage: 50,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBeCloseTo(100, 6);
    expect(result.banderasCalidad).not.toContain(
      'point_sensor_not_hydraulic_profile',
    );
  });

  it('no convierte profundidades de sensores puntuales en horizontes hidraulicos', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'point-sensor-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          {
            profundidad: 20,
            numeroDeSensor: 1,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
          },
          {
            profundidad: 200,
            numeroDeSensor: 2,
            capacidadDeCampo: 50,
            puntoMarchitez: 10,
          },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain(
      'point_sensor_not_hydraulic_profile',
    );
    expect(result.advertencias.join(' ')).toContain(
      'puntos de medicion y no limites de horizontes',
    );
  });

  it('admite un perfil uniforme solo con profundidad y valores confirmados', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Soja',
          parametrosAgrometeorologicos: {
            version: 'confirmed-uniform-profile-test',
            estado: 'validado',
            profundidadRadicularCm: 60,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
        sueloConfirmadoPorUsuario: true,
        sueloReferencia: { profundidadCm: 100, confianza: 'alta' },
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeCloseTo(120, 6);
    expect(result.banderasCalidad).not.toContain(
      'legacy_uniform_hydraulics_not_root_zone',
    );
  });

  it('ignora capas artificiales derivadas de sensores puntuales aunque figuren confirmadas', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'confirmed-point-sensor-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
        sueloConfirmadoPorUsuario: true,
        sueloReferencia: { profundidadCm: 100 },
        suelos: [
          { profundidad: 20, numeroDeSensor: 1 },
          { profundidad: 80, numeroDeSensor: 2 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'confirmed_sensor',
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 20,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'sensor',
            confidence: 'high',
          },
          {
            depthFromCm: 20,
            depthToCm: 80,
            fieldCapacityPercentage: 40,
            wiltingPointPercentage: 15,
            source: 'sensor',
            confidence: 'high',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain(
      'point_sensor_not_hydraulic_profile',
    );
    expect(result.banderasCalidad).toContain(
      'legacy_uniform_hydraulics_not_root_zone',
    );
    expect(result.advertencias.join(' ')).toContain(
      'puntos de medicion y no limites de horizontes',
    );
  });

  it('no llama promedio radicular a capas meteorologicas que cubren solo parte de Zr', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'strict-root-model-coverage-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-7': 0.22, '7-28': 0.2 })],
    );

    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeUndefined();
    expect(result.metricas.soilMoistureM3M3).toEqual({
      '0-7': 0.22,
      '7-28': 0.2,
    });
    expect(result.banderasCalidad).toContain(
      'incomplete_root_zone_model_coverage',
    );
  });

  it('prioriza raiz observada en un perenne y conserva su campana vigente', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Manzano' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          {
            profundidad: 100,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
            hayRaices: true,
          },
          {
            profundidad: 150,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
            hayRaices: true,
          },
          {
            profundidad: 200,
            capacidadDeCampo: 50,
            puntoMarchitez: 10,
            hayRaices: false,
          },
        ],
      } as any,
      { lat: -39, lng: -67.6 },
      [daily('2026-07-10', 1, 8, 15)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(300);
    expect(result.banderasCalidad).not.toContain('screening_root_depth');
  });

  it('no propaga una raiz observada hacia capas SoilGrids mas profundas', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Manzano',
          parametrosAgrometeorologicos: {
            version: 'original-root-evidence-test',
            estado: 'validado',
            profundidadRadicularCm: 180,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          {
            profundidad: 100,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
            hayRaices: true,
          },
        ],
      } as any,
      { lat: -39, lng: -67.6 },
      [daily('2026-07-10', 1, 8, 15)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        effectiveDepthCm: 200,
        effectiveDepthSource: 'inta_cartographic',
        effectiveDepthConfidence: 'medium',
        effectiveDepthIsFallback: false,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 100,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
          {
            depthFromCm: 100,
            depthToCm: 200,
            fieldCapacityPercentage: 50,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.banderasCalidad).not.toContain('screening_root_depth');
  });

  it('sin raiz conocida usa screening 100 cm y nunca infiere 200 cm del perfil', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {},
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 100, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 200, capacidadDeCampo: 50, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-100': 0.2, '100-200': 0.8 })],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.2, 6);
    expect(result.banderasCalidad).toContain('screening_root_depth');
    expect(result.banderasCalidad).toContain('screening_water_balance');
    expect(result.advertencias.join(' ')).toContain(
      'fallback operativo conservador de 100 cm',
    );
  });

  it('usa la profundidad edafica fallback solo como techo de una raiz de cultivo', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'effective-depth-cap-test',
            estado: 'validado',
            profundidadRadicularCm: 150,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-100': 0.2, '100-200': 0.8 })],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        effectiveDepthCm: 100,
        effectiveDepthSource: 'operational_fallback',
        effectiveDepthConfidence: 'low',
        effectiveDepthIsFallback: true,
        confidence: 'low',
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 100,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
          {
            depthFromCm: 100,
            depthToCm: 200,
            fieldCapacityPercentage: 50,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.2, 6);
    expect(result.banderasCalidad).toContain('screening_effective_soil_depth');
    expect(result.banderasCalidad).toContain('screening_water_balance');
    expect(result.advertencias.join(' ')).toContain(
      'se usa solo como techo del calculo',
    );
  });

  it('no informa TAW total cuando la cobertura hidraulica no alcanza la raiz objetivo', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'incomplete-profile-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
        suelos: [{ profundidad: 40, capacidadDeCampo: 30, puntoMarchitez: 10 }],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain('incomplete_hydraulic_root_zone');
    expect(result.advertencias.join(' ')).toContain(
      'No se extrapola la ultima capa',
    );
  });

  it('invalida el balance si FC y PMP abren un hueco dentro de la zona radicular', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'hydraulic-gap-test',
            estado: 'validado',
            profundidadRadicularCm: 90,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 30, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 60, capacidadDeCampo: 10, puntoMarchitez: 10 },
          { profundidad: 100, capacidadDeCampo: 30, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain('incomplete_hydraulic_root_zone');
  });

  it('no interpreta un cero sin estado valido como agua util medida', () => {
    const baseSiembra = {
      _id: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fechaSiembra: '2026-07-10',
      semilla: { cultivo: 'Soja' },
    } as any;
    const lote = {
      _id: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      capacidadDeCampo: 30,
      puntoMarchitez: 12,
      sueloReferencia: { profundidadCm: 100 },
    } as any;
    const observations = [daily('2026-07-10', 8, 16, 24)];

    const [sinLectura] = engine.calculateIndicators(
      baseSiembra,
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );
    const [ceroNoDisponible] = engine.calculateIndicators(
      {
        ...baseSiembra,
        aguaUtilReal: 0,
        estadoCalculoAguaUtil: 'no_disponible',
      },
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );

    expect(ceroNoDisponible.metricas.soilWaterStorageMm).toBe(
      sinLectura.metricas.soilWaterStorageMm,
    );
    expect(ceroNoDisponible.advertencias.join(' ')).toContain(
      'no se interpreta un cero sin sensor como medicion',
    );
  });

  it('calcula horas de frio y calor desde la serie horaria', () => {
    const hourly = [-2, 5, 20, 36].map((temperatureC, index) => ({
      idEstablecimiento: '64b000000000000000000003',
      timestamp: `2026-07-10T${String(index + 10).padStart(2, '0')}:00:00.000Z`,
      fechaLocal: '2026-07-10',
      timezone: 'America/Argentina/Cordoba',
      granularidad: 'hourly',
      estado: 'estimated',
      esPronostico: false,
      valores: {
        temperatureC,
        relativeHumidityPct: 75,
        precipitationMm: 0,
        soilTemperatureC: { '0-7': 11 + index, '7-28': 10 + index },
        soilMoistureM3M3: { '0-7': 0.22, '7-28': 0.2 },
      },
      fuente: 'open_meteo',
      fuentePorVariable: {
        temperatureC: 'open_meteo',
        relativeHumidityPct: 'open_meteo',
        precipitationMm: 'open_meteo',
        soilTemperatureC: 'open_meteo',
        soilMoistureM3M3: 'open_meteo',
      },
      banderasCalidad: [],
      completitudPct: 45,
      obtenidoEn: '2026-07-10T18:00:00.000Z',
    })) as any;
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Trigo',
          parametrosAgrometeorologicos: {
            version: 'threshold-test',
            temperaturaBaseC: 0,
            umbralFrioC: 0,
            umbralCalorC: 35,
            umbralVpdKpa: 2,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          {
            profundidad: 28,
            capacidadDeCampo: 30,
            puntoMarchitez: 12,
            hayRaices: true,
          },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      hourly,
    );
    expect(result.metricas.coldHours).toBe(1);
    expect(result.metricas.heatHours).toBe(1);
    expect(result.metricas.chillingHours).toBe(1);
    expect(result.metricas.vpdMeanKpa).toBeGreaterThanOrEqual(0);
    expect(result.fuentePorVariable.soilMoistureM3M3).toBe(
      'derived_open_meteo',
    );
    expect(result.banderasCalidad).toContain('modeled_soil_open_meteo');
    expect(result.advertencias.join(' ')).toContain(
      'modelo de suelo Open-Meteo',
    );
  });

  it('acumula dias secos y vuelve a cero cuando supera el umbral de lluvia', () => {
    const days = [
      daily('2026-07-10', 8, 16, 24),
      daily('2026-07-11', 8, 16, 24),
      daily('2026-07-12', 8, 16, 24),
      daily('2026-07-13', 8, 16, 24),
    ];
    days[0].valores.precipitationMm = 0;
    days[1].valores.precipitationMm = 0;
    days[2].valores.precipitationMm = 0;
    days[3].valores.precipitationMm = 1;
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Maiz' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      days,
    );
    expect(results[2].metricas.consecutiveDryDays).toBe(3);
    expect(results[3].metricas.consecutiveDryDays).toBe(0);
    expect(results[2].metricas.rain7dMm).toBe(0);
    expect(results[3].metricas.rain7dMm).toBe(1);
  });

  it('devuelve null semantico y advertencia cuando faltan temperaturas', () => {
    const observation = daily('2026-07-10', 8, 16, 24);
    delete observation.valores.temperatureMinC;
    delete observation.valores.temperatureMaxC;
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Maiz' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [observation],
    );
    expect(result.metricas.gddDaily).toBeUndefined();
    expect(result.advertencias.join(' ')).toContain('GDD no calculable');
  });

  it('conserva la implantacion historica de perennes y abre solo la campaña vigente', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));

    expect(
      engine.resolveCycleStart({
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Manzano' },
      } as any),
    ).toBe('2026-07-01');
    expect(
      engine.resolveCycleStart({
        fechaSiembra: '2026-05-10',
        semilla: { cultivo: 'Trigo' },
      } as any),
    ).toBe('2026-05-10');

    jest.useRealTimers();
  });

  it('no mezcla campañas anteriores en acumulados de un cultivo perenne', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Pecan' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [
        daily('2025-07-10', 8, 16, 24),
        daily('2026-06-30', 8, 16, 24),
        daily('2026-07-01', 8, 16, 24),
        daily('2026-07-02', 10, 18, 26),
      ],
    );

    expect(results.map((item) => item.fecha)).toEqual([
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(results[0].metricas.gddAccumulated).toBe(
      results[0].metricas.gddDaily,
    );
    jest.useRealTimers();
  });

  it('usa los nombres y limites del crono oficial en cultivos anuales', () => {
    const cases = [
      {
        crop: 'Trigo',
        sowing: '2026-04-01',
        date: '2026-07-13',
        stages: {
          R0_R1: 9,
          R1_R2: 92,
          R2_R3: 18,
          R3_R4: 19,
          R4_R5: 6,
          R5_R6: 10,
          R6_R7: 36,
        },
        expected: 'Espiguilla Terminal',
      },
      {
        crop: 'Soja',
        sowing: '2026-01-01',
        date: '2026-02-14',
        stages: {
          siembra_emergencia: 8,
          emergencia_R1: 35,
          R1_R3: 18,
          R3_R5: 28,
          R5_R7: 38,
        },
        expected: 'Floracion',
      },
      {
        crop: 'Maiz',
        sowing: '2026-01-01',
        date: '2026-03-16',
        stages: {
          siembra_emergencia: 8,
          emergencia_floracion: 65,
          floracion_madurez: 55,
        },
        expected: 'Floracion',
      },
      {
        crop: 'Cebada',
        sowing: '2026-04-01',
        date: '2026-07-06',
        stages: {
          siembra_emergencia: 15,
          emergencia_primer_nudo: 67,
          primer_nudo_hoja_bandera: 14,
          hoja_bandera_espigazon: 18,
          espigazon_antesis: 7,
          antesis_llenado_granos: 4,
          llenado_granos_madurez_fisiologica: 30,
        },
        expected: 'Hoja Bandera',
      },
    ];

    for (const item of cases) {
      const stage = (engine as any).resolveStage(
        {
          fechaSiembra: item.sowing,
          semilla: {
            cultivo: item.crop,
            fenologiaReferencia: {
              rangosTermicos: { codigo_generico: { min: 0, max: 99999 } },
            },
          },
          crono: { etapas: item.stages },
        },
        item.date,
        500,
      );
      expect(stage).toBe(item.expected);
    }
  });

  it('ordena cronologicamente la respuesta aunque el repositorio entregue filas mezcladas', async () => {
    const getIndicadores = jest.fn().mockResolvedValue({
      datos: [
        {
          idSiembra: '64b000000000000000000001',
          idEstablecimiento: '64b000000000000000000003',
          fecha: '2026-07-03',
          etapaFenologica: 'Emergencia',
          metricas: {
            gddAccumulated: 30,
            gddBaseTemperatureC: 0,
            gddUpperTemperatureC: 26,
          },
          fuente: 'open_meteo',
          fuentePorVariable: {},
          banderasCalidad: [],
          advertencias: [],
          completitudPct: 100,
          esPronostico: false,
          calculadoEn: '2026-07-03T18:00:00.000Z',
          versionParametros: 'test-v1',
        },
        {
          idSiembra: '64b000000000000000000001',
          idEstablecimiento: '64b000000000000000000003',
          fecha: '2026-07-01',
          etapaFenologica: 'Siembra',
          metricas: { gddAccumulated: 10 },
          fuente: 'open_meteo',
          fuentePorVariable: {},
          banderasCalidad: [],
          advertencias: [],
          completitudPct: 100,
          esPronostico: false,
          calculadoEn: '2026-07-01T18:00:00.000Z',
          versionParametros: 'test-v1',
        },
        {
          idSiembra: '64b000000000000000000001',
          idEstablecimiento: '64b000000000000000000003',
          fecha: '2026-07-02',
          etapaFenologica: 'Emergencia',
          metricas: { gddAccumulated: 20 },
          fuente: 'open_meteo',
          fuentePorVariable: {},
          banderasCalidad: [],
          advertencias: [],
          completitudPct: 100,
          esPronostico: false,
          calculadoEn: '2026-07-02T18:00:00.000Z',
          versionParametros: 'test-v1',
        },
      ],
    });
    const service = new AgrometeorologicalEngineService(
      {
        getIndicadores,
        getObservaciones: jest.fn().mockResolvedValue({ datos: [] }),
      } as any,
      {} as any,
    );

    const response = await service.getResponse('64b000000000000000000001');

    expect(response.series.map((item) => item.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(getIndicadores.mock.calls[0][0].sort).toBe('fecha');
    expect(JSON.parse(getIndicadores.mock.calls[0][0].filter)).toMatchObject({
      idSiembra: '64b000000000000000000001',
      versionCalculo: AGROMET_ENGINE_VERSION,
    });
    expect(response.summary.gddThroughDate).toBe('2026-07-03');
    expect(response.summary.gddBaseTemperatureC).toBe(0);
    expect(response.summary.gddUpperTemperatureC).toBe(26);
  });

  it('persiste historiales largos en lotes acotados', async () => {
    const upsertIndicadores = jest.fn().mockResolvedValue(undefined);
    const service = new AgrometeorologicalEngineService(
      { upsertIndicadores } as any,
      {} as any,
    );
    const indicators = Array.from({ length: 251 }, (_, index) => ({
      fecha: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    })) as any;

    await (service as any).persistInBatches(indicators);

    expect(upsertIndicadores).toHaveBeenCalledTimes(3);
    expect(upsertIndicadores.mock.calls.map(([batch]) => batch.length)).toEqual(
      [100, 100, 51],
    );
  });
});
