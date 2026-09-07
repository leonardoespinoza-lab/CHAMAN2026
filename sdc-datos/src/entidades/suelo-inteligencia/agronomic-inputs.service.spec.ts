import {
  aplicarEntradasAgronomicasSuelo,
  IEntradasAgronomicasSuelo,
  ILote,
} from 'modelos/src';
import { SoilAgronomicInputsService } from './agronomic-inputs.service';

describe('SoilAgronomicInputsService canonical selection', () => {
  const lots = { findById: jest.fn() };
  const engine = { get: jest.fn() };
  const service = new SoilAgronomicInputsService(lots as any, engine as any);

  const automaticAssessment = () => ({
    loteId: 'lot-1',
    status: 'ready',
    resolutionKey: 'resolution-1',
    calculatedAt: '2026-07-14T10:00:00.000Z',
    summary: {
      estimatedTexture: 'Franco arcilloso',
      canonicalTexture: 'Arcilloso',
      drainageClass: 'well',
      sandPercentage: 20,
      siltPercentage: 30,
      clayPercentage: 50,
      availableWaterMmPerMeter: 163,
      profileAvailableWaterMm: 163,
      rootZoneAvailableWaterMm: 163,
      effectiveDepthCm: 100,
      effectiveDepthSource: 'operational_fallback',
      effectiveDepthConfidence: 'low',
      effectiveDepthIsFallback: true,
    },
    source: { type: 'mixed', confidence: 'medium' },
    sources: [
      { type: 'inta', confidence: 'medium' },
      { type: 'soilgrids', confidence: 'medium' },
    ],
    propertyProvenance: {
      canonicalTexture: {
        value: 'Arcilloso',
        unit: 'clase',
        source: 'inta_local',
        method: 'atributo INTA normalizado',
        depthFromCm: 0,
        depthToCm: 30,
        observedOrEstimated: 'estimated',
        confidence: 'medium',
      },
      availableWaterMmPerMeter: {
        value: 163,
        unit: 'mm/m',
        source: 'soilgrids',
        method: 'CC menos PMP',
        depthFromCm: 0,
        depthToCm: 100,
        observedOrEstimated: 'estimated',
        confidence: 'low',
      },
    },
    depthProfile: [
      {
        depthFromCm: 0,
        depthToCm: 30,
        chamanTexture: 'Arcilloso',
        fieldCapacityPercentage: 31,
        wiltingPointPercentage: 14,
        availableWaterMmPerMeter: 170,
        source: 'soilgrids',
        confidence: 'medium',
      },
      {
        depthFromCm: 30,
        depthToCm: 100,
        chamanTexture: 'Franco arcilloso',
        fieldCapacityPercentage: 29,
        wiltingPointPercentage: 13,
        availableWaterMmPerMeter: 160,
        source: 'soilgrids',
        confidence: 'low',
      },
      {
        depthFromCm: 100,
        depthToCm: 200,
        chamanTexture: 'Franco arcilloso',
        fieldCapacityPercentage: 27,
        wiltingPointPercentage: 12,
        availableWaterMmPerMeter: 150,
        source: 'soilgrids',
        confidence: 'low',
      },
    ],
    warnings: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prioriza assessment automatico y conserva manual como alternativa', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
        texturaEscorrentia: 'Franco',
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
      }),
    });
    engine.get.mockResolvedValue(automaticAssessment());

    const result = await service.getForLot('lot-1');

    expect(engine.get).toHaveBeenCalledWith('lot-1');
    expect(result).toMatchObject({
      status: 'ready',
      stale: false,
      resolutionKey: 'resolution-1',
      selectionReason: 'automatic_assessment',
      operationalTexture: 'Arcilloso',
      fieldCapacityPercentage: 29.6,
      wiltingPointPercentage: 13.3,
      availableWaterMmPerMeter: 163,
      profileAvailableWaterMm: 163,
      rootZoneAvailableWaterMm: 163,
      effectiveDepthCm: 100,
      effectiveDepthSource: 'operational_fallback',
      effectiveDepthConfidence: 'low',
      effectiveDepthIsFallback: true,
    });
    expect(result?.provenance.availableWaterMmPerMeter).toMatchObject({
      source: 'soilgrids',
      depthFromCm: 0,
      depthToCm: 100,
      confidence: 'low',
    });
    expect(result?.alternatives?.[0]).toMatchObject({
      source: 'manual',
      confirmed: true,
      operationalTexture: 'Franco',
    });
    expect(result?.conflicts?.join(' ')).toContain('Textura seleccionada');
  });

  it('prioriza laboratorio explicito y confirmado sobre assessment', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'laboratory',
        sueloConfirmadoPorUsuario: true,
        sueloReferencia: {
          raw: {
            laboratoryReportId: 'lab-2026-17',
            method: 'curva de retencion en placa de presion',
          },
        },
        texturaEscorrentia: 'Franco limoso',
        capacidadDeCampo: 35,
        puntoMarchitez: 17,
        suelos: [
          {
            profundidad: 30,
            textura: 'Franco limoso',
            capacidadDeCampo: 35,
            puntoMarchitez: 17,
          },
        ],
      }),
    });
    engine.get.mockResolvedValue(automaticAssessment());

    const result = await service.getForLot('lot-1');

    expect(result).toMatchObject({
      selectionReason: 'confirmed_laboratory',
      operationalTexture: 'Franco limoso',
      fieldCapacityPercentage: 35,
      wiltingPointPercentage: 17,
      availableWaterMmPerMeter: 180,
      rootZoneAvailableWaterMm: 54,
      effectiveDepthCm: 30,
      confidence: 'medium',
    });
    expect(result?.provenance.operationalTexture).toMatchObject({
      source: 'laboratory',
      observedOrEstimated: 'observed',
    });
    expect(result?.alternatives?.[0].reason).toContain('automatica vigente');
  });

  it('no eleva un laboratorio sin informe, metodo y profundidad', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'laboratory',
        sueloConfirmadoPorUsuario: true,
        texturaEscorrentia: 'Franco limoso',
        capacidadDeCampo: 35,
        puntoMarchitez: 17,
      }),
    });
    engine.get.mockResolvedValue(automaticAssessment());

    const result = await service.getForLot('lot-1');

    expect(result?.selectionReason).toBe('automatic_assessment');
    expect(result?.operationalTexture).toBe('Arcilloso');
    expect(result?.alternatives?.[0]).toMatchObject({
      source: 'unknown',
      confirmed: false,
    });
  });

  it('prioriza una calibracion de sensor explicitamente confirmada', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'sensor',
        sueloConfirmadoPorUsuario: true,
        capacidadDeCampo: 33,
        puntoMarchitez: 16,
        suelos: [
          {
            profundidad: 30,
            capacidadDeCampo: 33,
            puntoMarchitez: 16,
          },
        ],
      }),
    });
    engine.get.mockResolvedValue(automaticAssessment());

    const result = await service.getForLot('lot-1');

    expect(result).toMatchObject({
      selectionReason: 'confirmed_sensor',
      operationalTexture: 'Arcilloso',
      fieldCapacityPercentage: 33,
      wiltingPointPercentage: 16,
      availableWaterMmPerMeter: 170,
      rootZoneAvailableWaterMm: 51,
    });
    expect(result?.provenance.fieldCapacityPercentage).toMatchObject({
      source: 'sensor',
      observedOrEstimated: 'observed',
    });
    expect(result?.provenance.operationalTexture.source).toBe('inta_local');
  });

  it('trata CC cero como sentinel, usa fallback y conserva PMP cero', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'sensor',
        sueloConfirmadoPorUsuario: true,
        capacidadDeCampo: 0,
        puntoMarchitez: -1,
        suelos: [
          {
            profundidad: 30,
            capacidadDeCampo: 35,
            puntoMarchitez: 0,
          },
        ],
      }),
    });
    engine.get.mockResolvedValue(automaticAssessment());

    const result = await service.getForLot('lot-1');

    expect(result).toMatchObject({
      selectionReason: 'confirmed_sensor',
      fieldCapacityPercentage: 35,
      wiltingPointPercentage: 0,
      availableWaterMmPerMeter: 350,
      rootZoneAvailableWaterMm: 105,
    });
    expect(result?.depthLayers[0]).toMatchObject({
      fieldCapacityPercentage: 35,
      wiltingPointPercentage: 0,
      availableWaterMmPerMeter: 350,
    });
  });

  it('descarta negativos, AWC negativo y PMP mayor o igual a CC', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'lot-1' }),
    });
    const assessment = automaticAssessment();
    assessment.summary.profileAvailableWaterMm = -25;
    assessment.summary.rootZoneAvailableWaterMm = -25;
    assessment.depthProfile = [
      {
        depthFromCm: 0,
        depthToCm: 30,
        chamanTexture: 'Arcilloso',
        fieldCapacityPercentage: 20,
        wiltingPointPercentage: 20,
        availableWaterMmPerMeter: -10,
        source: 'soilgrids',
        confidence: 'medium',
      },
      {
        depthFromCm: 30,
        depthToCm: 100,
        chamanTexture: 'Franco arcilloso',
        fieldCapacityPercentage: -5,
        wiltingPointPercentage: -2,
        availableWaterMmPerMeter: -30,
        source: 'soilgrids',
        confidence: 'low',
      },
    ];
    engine.get.mockResolvedValue(assessment);

    const result = await service.getForLot('lot-1');

    // La única CC válida cubre 0–30 cm, no el intervalo completo 0–100 cm.
    expect(result?.fieldCapacityPercentage).toBeUndefined();
    expect(result?.wiltingPointPercentage).toBeUndefined();
    expect(result?.availableWaterMmPerMeter).toBeUndefined();
    expect(result?.profileAvailableWaterMm).toBeUndefined();
    expect(result?.rootZoneAvailableWaterMm).toBeUndefined();
    expect(result?.depthLayers[0]).toMatchObject({
      fieldCapacityPercentage: 20,
      wiltingPointPercentage: undefined,
      availableWaterMmPerMeter: undefined,
    });
    expect(result?.depthLayers[1]).toMatchObject({
      fieldCapacityPercentage: undefined,
      wiltingPointPercentage: undefined,
      availableWaterMmPerMeter: undefined,
    });
  });

  it.each(['ready', 'partial'])(
    'no extrapola un perfil %s de 0–5 y 100–200 cm ni reutiliza reservas antiguas',
    async (status) => {
      lots.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'lot-1' }),
      });
      const assessment = automaticAssessment();
      assessment.status = status;
      assessment.depthProfile = [
        {
          ...assessment.depthProfile[0],
          depthFromCm: 0,
          depthToCm: 5,
          availableWaterMmPerMeter: 175.11,
        },
        {
          ...assessment.depthProfile[1],
          depthFromCm: 100,
          depthToCm: 200,
        },
      ];
      assessment.summary.availableWaterMmPerMeter = 175.11;
      assessment.summary.profileAvailableWaterMm = 175.11;
      assessment.summary.rootZoneAvailableWaterMm = 175.11;
      const original = JSON.parse(JSON.stringify(assessment));
      engine.get.mockResolvedValue(assessment);

      const result = await service.getForLot('lot-1');

      expect(result?.selectionReason).toBe('automatic_assessment');
      expect(result?.stale).toBe(true);
      expect(result?.fieldCapacityPercentage).toBeUndefined();
      expect(result?.wiltingPointPercentage).toBeUndefined();
      expect(result?.availableWaterMmPerMeter).toBeUndefined();
      expect(result?.profileAvailableWaterMm).toBeUndefined();
      expect(result?.rootZoneAvailableWaterMm).toBeUndefined();
      expect(
        result?.depthLayers.map((layer) => [
          layer.depthFromCm,
          layer.depthToCm,
        ]),
      ).toEqual([
        [0, 5],
        [100, 200],
      ]);
      expect(result?.depthLayers[0].availableWaterMmPerMeter).toBe(175.11);
      for (const key of [
        'fieldCapacityPercentage',
        'wiltingPointPercentage',
        'availableWaterMmPerMeter',
      ]) {
        expect(result?.provenance[key]).toMatchObject({
          value: undefined,
          observedOrEstimated: 'unknown',
          confidence: 'unavailable',
        });
      }
      expect(assessment).toEqual(original);
    },
  );

  it('no sustituye el perfil automatico incompleto por datos manuales sin cambiar precedencia', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
      }),
    });
    const assessment = automaticAssessment();
    assessment.depthProfile = [assessment.depthProfile[0]];
    engine.get.mockResolvedValue(assessment);

    const result = await service.getForLot('lot-1');

    expect(result?.selectionReason).toBe('automatic_assessment');
    expect(result?.fieldCapacityPercentage).toBeUndefined();
    expect(result?.wiltingPointPercentage).toBeUndefined();
    expect(result?.availableWaterMmPerMeter).toBeUndefined();
    expect(result?.profileAvailableWaterMm).toBeUndefined();
    expect(result?.alternatives?.[0]).toMatchObject({
      source: 'manual',
      fieldCapacityPercentage: 30,
      wiltingPointPercentage: 14,
    });
  });

  it.each([
    ['nulo', null],
    ['ausente', undefined],
    ['no finito', Number.NaN],
    ['infinito', Number.POSITIVE_INFINITY],
  ])(
    'no promedia una propiedad %s en parte del intervalo',
    async (_label, missing) => {
      lots.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'lot-1' }),
      });
      const assessment = automaticAssessment();
      assessment.depthProfile[1].fieldCapacityPercentage = missing as number;
      engine.get.mockResolvedValue(assessment);

      const result = await service.getForLot('lot-1');

      expect(result?.fieldCapacityPercentage).toBeUndefined();
      expect(result?.provenance.fieldCapacityPercentage).toMatchObject({
        value: undefined,
        confidence: 'unavailable',
        observedOrEstimated: 'unknown',
      });
      expect(result?.depthLayers[0].fieldCapacityPercentage).toBe(31);
      expect(result?.depthLayers[1].fieldCapacityPercentage).toBeUndefined();
    },
  );

  it('rechaza capas superpuestas en lugar de contar dos veces su espesor', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'lot-1' }),
    });
    const assessment = automaticAssessment();
    assessment.depthProfile.splice(1, 0, { ...assessment.depthProfile[0] });
    engine.get.mockResolvedValue(assessment);

    const result = await service.getForLot('lot-1');

    expect(result?.fieldCapacityPercentage).toBeUndefined();
    expect(result?.wiltingPointPercentage).toBeUndefined();
    expect(result?.availableWaterMmPerMeter).toBeUndefined();
    expect(result?.profileAvailableWaterMm).toBeUndefined();
  });

  it('mantiene valores cuando 0–100 cm esta completo aunque falte el horizonte mas profundo', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'lot-1' }),
    });
    const assessment = automaticAssessment();
    assessment.status = 'partial';
    assessment.depthProfile = assessment.depthProfile
      .filter((layer) => layer.depthToCm <= 100)
      .reverse();
    engine.get.mockResolvedValue(assessment);

    const result = await service.getForLot('lot-1');

    expect(result).toMatchObject({
      status: 'partial',
      stale: true,
      fieldCapacityPercentage: 29.6,
      wiltingPointPercentage: 13.3,
      availableWaterMmPerMeter: 163,
      profileAvailableWaterMm: 163,
      rootZoneAvailableWaterMm: 163,
    });
  });

  it('conserva calibracion confirmada sobre 0–30 cm frente a perfil automatico incompleto', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'sensor',
        sueloConfirmadoPorUsuario: true,
        capacidadDeCampo: 33,
        puntoMarchitez: 16,
        suelos: [{ profundidad: 30, capacidadDeCampo: 33, puntoMarchitez: 16 }],
      }),
    });
    const assessment = automaticAssessment();
    assessment.depthProfile = [{ ...assessment.depthProfile[0], depthToCm: 5 }];
    engine.get.mockResolvedValue(assessment);

    const result = await service.getForLot('lot-1');

    expect(result).toMatchObject({
      selectionReason: 'confirmed_sensor',
      fieldCapacityPercentage: 33,
      wiltingPointPercentage: 16,
      availableWaterMmPerMeter: 170,
      profileAvailableWaterMm: 51,
      rootZoneAvailableWaterMm: 51,
      stale: false,
    });
  });

  it('no proyecta horizontes cercanos en los doce niveles de una sonda cuando hay huecos', async () => {
    const lot = {
      _id: 'lot-1',
      capacidadDeCampo: 24,
      puntoMarchitez: 10,
      suelos: Array.from({ length: 12 }, (_, index) => ({
        profundidad: (index + 1) * 10,
        numeroDeSensor: index + 1,
        capacidadDeCampo: 24 + index / 10,
        puntoMarchitez: 10,
      })),
    };
    lots.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(lot) });
    const assessment = automaticAssessment();
    assessment.depthProfile = [
      { ...assessment.depthProfile[0], depthToCm: 5 },
      assessment.depthProfile[2],
    ];
    engine.get.mockResolvedValue(assessment);

    const result = await service.getForLot('lot-1');
    const projected = aplicarEntradasAgronomicasSuelo(lot, result);
    const lotAt15 = {
      ...lot,
      suelos: [{ ...lot.suelos[0], profundidad: 15 }],
    };
    const projectedAt15 = aplicarEntradasAgronomicasSuelo(lotAt15, result);

    expect(result?.stale).toBe(true);
    expect(result?.warnings?.join(' ')).toContain('suelo operativo previo');
    expect(result?.depthLayers).toHaveLength(2);
    expect(projected).toEqual(lot);
    expect(projected).not.toBe(lot);
    expect(projected.suelos).toHaveLength(12);
    expect(projected.suelos[0].capacidadDeCampo).toBe(24);
    expect(projectedAt15).toEqual(lotAt15);
  });

  it('proyecta sin regresión seis horizontes completos sobre los doce sensores', async () => {
    const lot = {
      _id: 'lot-1',
      capacidadDeCampo: 24,
      puntoMarchitez: 10,
      suelos: Array.from({ length: 12 }, (_, index) => ({
        profundidad: (index + 1) * 10,
        numeroDeSensor: index + 1,
        capacidadDeCampo: 24,
        puntoMarchitez: 10,
      })),
    };
    lots.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(lot) });
    const assessment = automaticAssessment();
    const previousLayers = assessment.depthProfile;
    assessment.depthProfile = [
      [0, 5],
      [5, 15],
      [15, 30],
      [30, 60],
      [60, 100],
      [100, 200],
    ].map(([depthFromCm, depthToCm]) => ({
      ...previousLayers[depthToCm <= 30 ? 0 : depthToCm <= 100 ? 1 : 2],
      depthFromCm,
      depthToCm,
    }));
    engine.get.mockResolvedValue(assessment);

    const result = await service.getForLot('lot-1');
    const projected = aplicarEntradasAgronomicasSuelo(lot, result);

    expect(result).toMatchObject({
      stale: false,
      fieldCapacityPercentage: 29.6,
      wiltingPointPercentage: 13.3,
      availableWaterMmPerMeter: 163,
      profileAvailableWaterMm: 163,
    });
    expect(projected.suelos).toHaveLength(12);
    expect(projected.suelos.map((layer) => layer.capacidadDeCampo)).toEqual([
      31, 31, 31, 29, 29, 29, 29, 29, 29, 29, 27, 27,
    ]);
    expect(lot.suelos.every((layer) => layer.capacidadDeCampo === 24)).toBe(
      true,
    );
  });

  it('no presenta el summary anterior de un assessment pending como vigente', async () => {
    lots.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'lot-1',
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
        texturaEscorrentia: 'Franco',
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
      }),
    });
    engine.get.mockResolvedValue({
      ...automaticAssessment(),
      status: 'pending',
      calculatedAt: '2025-01-01T00:00:00.000Z',
    });

    const result = await service.getForLot('lot-1');

    expect(result).toMatchObject({
      status: 'pending',
      stale: true,
      calculatedAt: undefined,
      selectionReason: 'manual_fallback',
      operationalTexture: 'Franco',
      estimatedTexture: undefined,
      sandPercentage: undefined,
    });
    expect(result?.alternatives).toBeUndefined();
  });
});

describe('aplicarEntradasAgronomicasSuelo', () => {
  const inputs = (overrides: Partial<IEntradasAgronomicasSuelo> = {}) =>
    ({
      loteId: 'lot-1',
      status: 'ready',
      stale: false,
      selectionPolicyVersion: 'test-policy',
      selectionReason: 'automatic_assessment',
      operationalTexture: 'Franco arcilloso',
      fieldCapacityPercentage: 32,
      wiltingPointPercentage: 15,
      depthLayers: [
        {
          depthFromCm: 0,
          depthToCm: 30,
          texture: 'Franco arcilloso',
          fieldCapacityPercentage: 33,
          wiltingPointPercentage: 16,
          availableWaterMmPerMeter: 170,
          source: 'soilgrids',
          confidence: 'medium',
        },
      ],
      provenance: {},
      ...overrides,
    }) as IEntradasAgronomicasSuelo;

  it('clona y proyecta seleccion vigente sin mutar el lote', () => {
    const lot = {
      _id: 'lot-1',
      nombre: 'Lote original',
      texturaEscorrentia: 'Arenoso' as const,
      suelos: [{ profundidad: 20, hayRaices: true }],
    };

    const projected = aplicarEntradasAgronomicasSuelo(lot, inputs());

    expect(projected).not.toBe(lot);
    expect(projected.suelos).not.toBe(lot.suelos);
    expect(projected).toMatchObject({
      nombre: 'Lote original',
      texturaEscorrentia: 'Franco arcilloso',
      texturaLixiviacion: 'Franco arcilloso',
      capacidadDeCampo: 32,
      puntoMarchitez: 15,
      suelos: [
        {
          profundidad: 30,
          textura: 'Franco arcilloso',
          capacidadDeCampo: 33,
          puntoMarchitez: 16,
          hayRaices: true,
        },
      ],
    });
    expect(lot.texturaEscorrentia).toBe('Arenoso');
    expect(lot.suelos[0]).toEqual({ profundidad: 20, hayRaices: true });
  });

  it('proyecta el drenaje cartografico solo cuando el lote no tiene un valor operativo', () => {
    const automatic = aplicarEntradasAgronomicasSuelo(
      { _id: 'lot-1' },
      inputs({ drainageClass: 'well' }),
    );
    const preserved = aplicarEntradasAgronomicasSuelo(
      {
        _id: 'lot-1',
        drenajeNaturalLixiviacion: 'Mal Drenado',
        drenajeNaturalEscorrentia: 'Mal Drenado',
      },
      inputs({ drainageClass: 'well' }),
    );

    expect(automatic).toMatchObject({
      drenajeNaturalLixiviacion: 'Bien Drenado',
      drenajeNaturalEscorrentia: 'Bien Drenado',
    });
    expect(preserved).toMatchObject({
      drenajeNaturalLixiviacion: 'Mal Drenado',
      drenajeNaturalEscorrentia: 'Mal Drenado',
    });
  });

  it('preserva capas y sensores operativos y busca el horizonte canonico por profundidad', () => {
    const lot = {
      _id: 'lot-1',
      suelos: [
        { profundidad: 10, numeroDeSensor: 11, hayRaices: true },
        { profundidad: 45, numeroDeSensor: 22, hayRaices: false },
      ],
    };
    const projected = aplicarEntradasAgronomicasSuelo(
      lot,
      inputs({
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 5,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 12,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 5,
            depthToCm: 15,
            fieldCapacityPercentage: 32,
            wiltingPointPercentage: 14,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 30,
            depthToCm: 60,
            fieldCapacityPercentage: 28,
            wiltingPointPercentage: 13,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
      }),
    );

    expect(projected.suelos).toHaveLength(2);
    expect(projected.suelos).toEqual([
      expect.objectContaining({
        profundidad: 10,
        numeroDeSensor: 11,
        hayRaices: true,
        capacidadDeCampo: 32,
        puntoMarchitez: 14,
      }),
      expect.objectContaining({
        profundidad: 45,
        numeroDeSensor: 22,
        hayRaices: false,
        capacidadDeCampo: 28,
        puntoMarchitez: 13,
      }),
    ]);
  });

  it.each([
    ['null', null],
    ['cero', 0],
    ['NaN', Number.NaN],
  ])(
    'no trata numeroDeSensor %s como un canal real',
    (_label, numeroDeSensor) => {
      const projected = aplicarEntradasAgronomicasSuelo(
        {
          _id: 'lot-invalid-sensor-layout',
          suelos: [
            {
              numeroDeSensor: numeroDeSensor as number,
              profundidad: 30,
              hayRaices: true,
            },
          ],
        },
        inputs({
          depthLayers: [
            {
              depthFromCm: 0,
              depthToCm: 5,
              source: 'soilgrids',
              confidence: 'medium',
            },
            {
              depthFromCm: 5,
              depthToCm: 100,
              source: 'soilgrids',
              confidence: 'low',
            },
          ],
        }),
      );

      expect(projected.suelos?.map((layer) => layer.profundidad)).toEqual([
        5, 100,
      ]);
      expect(projected.suelos?.every((layer) => layer.hayRaices)).toBe(true);
    },
  );

  it('expande una capa SoilGrids legacy al perfil canonico completo', () => {
    const lot = {
      _id: 'lot-legacy-layer',
      suelos: [
        {
          profundidad: 30,
          textura: 'Arenoso' as const,
          capacidadDeCampo: 14,
          puntoMarchitez: 6,
          hayRaices: true,
        },
      ],
    };

    const projected = aplicarEntradasAgronomicasSuelo(
      lot,
      inputs({
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 5,
            fieldCapacityPercentage: 31,
            wiltingPointPercentage: 13,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 5,
            depthToCm: 15,
            fieldCapacityPercentage: 32,
            wiltingPointPercentage: 14,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 15,
            depthToCm: 30,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 12,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 30,
            depthToCm: 60,
            fieldCapacityPercentage: 29,
            wiltingPointPercentage: 11,
            source: 'soilgrids',
            confidence: 'low',
          },
          {
            depthFromCm: 60,
            depthToCm: 100,
            fieldCapacityPercentage: 28,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
      }),
    );

    expect(projected.suelos?.map((layer) => layer.profundidad)).toEqual([
      5, 15, 30, 60, 100,
    ]);
    expect(projected.suelos?.every((layer) => layer.hayRaices)).toBe(true);
    expect(projected.suelos?.[4]).toEqual(
      expect.objectContaining({
        textura: 'Franco arcilloso',
        capacidadDeCampo: 28,
        puntoMarchitez: 10,
      }),
    );
  });

  it('crea capas canonicas solamente cuando no hay perfil operativo', () => {
    const projected = aplicarEntradasAgronomicasSuelo(
      { _id: 'lot-1' } as ILote,
      inputs({
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 5,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 5,
            depthToCm: 15,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
      }),
    );

    expect(projected.suelos?.map((layer) => layer.profundidad)).toEqual([
      5, 15,
    ]);
  });

  it('no proyecta inputs stale o con status no apto', () => {
    const lot = {
      _id: 'lot-1',
      texturaEscorrentia: 'Arenoso' as const,
      suelos: [{ profundidad: 20, textura: 'Arenoso' as const }],
    };

    const projected = aplicarEntradasAgronomicasSuelo(
      lot,
      inputs({ status: 'pending', stale: true }),
    );

    expect(projected).toEqual(lot);
    expect(projected).not.toBe(lot);
    expect(projected.suelos).not.toBe(lot.suelos);
  });

  it('ignora CC cero y preserva PMP cero al proyectar escalares y sensores', () => {
    const lot = {
      _id: 'lot-ranges',
      capacidadDeCampo: 30,
      puntoMarchitez: 14,
      suelos: [
        {
          numeroDeSensor: 1,
          profundidad: 10,
          capacidadDeCampo: 28,
          puntoMarchitez: 12,
        },
      ],
    };

    const projected = aplicarEntradasAgronomicasSuelo(
      lot,
      inputs({
        fieldCapacityPercentage: 0,
        wiltingPointPercentage: 0,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 30,
            fieldCapacityPercentage: 0,
            wiltingPointPercentage: 0,
            availableWaterMmPerMeter: -5,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
      }),
    );

    expect(projected.capacidadDeCampo).toBe(30);
    expect(projected.puntoMarchitez).toBe(0);
    expect(projected.suelos?.[0]).toMatchObject({
      capacidadDeCampo: 28,
      puntoMarchitez: 0,
    });
  });

  it('no proyecta PMP mayor o igual a CC en capas canonicas', () => {
    const projected = aplicarEntradasAgronomicasSuelo(
      { _id: 'lot-invalid-pair' } as ILote,
      inputs({
        fieldCapacityPercentage: 20,
        wiltingPointPercentage: 20,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 30,
            fieldCapacityPercentage: 20,
            wiltingPointPercentage: 25,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
      }),
    );

    expect(projected.capacidadDeCampo).toBe(20);
    expect(projected.puntoMarchitez).toBeUndefined();
    expect(projected.suelos?.[0]).toMatchObject({
      capacidadDeCampo: 20,
      puntoMarchitez: undefined,
    });
  });
});
