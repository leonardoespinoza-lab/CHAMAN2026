import { IRespuestaAgrometeorologiaSiembra } from 'modelos/src';
import { PrediccionArvejaService } from './arveja';
import { PrediccionCebadaService } from './cebada';

function respuesta(stage: string, stageSource: string) {
  return {
    summary: {},
    dataSource: {
      type: 'open_meteo',
      sources: ['open_meteo'],
      completenessPercentage: 100,
    },
    series: [
      {
        date: '2026-07-16',
        isForecast: false,
        stage,
        stageSource,
        stageConfidence: 'referencia',
        weather: {
          temperatureMinC: 9,
          temperatureMeanC: 15,
          temperatureMaxC: 21,
          relativeHumidityMeanPct: 86,
          precipitationMm: 2,
        },
        metrics: {
          temperatureMinC: 9,
          temperatureMeanC: 15,
          temperatureMaxC: 21,
          relativeHumidityMeanPct: 86,
          precipitationMm: 2,
          leafWetnessHours: 14,
          maxContinuousLeafWetnessHours: 12,
          meanTemperatureDuringLeafWetnessC: 15,
          gddBaseTemperatureC: 0,
          gddAccumulated: 700,
          gddAccumulationComplete: true,
        },
        source: 'open_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        warnings: [],
      },
    ],
    warnings: [],
    calculationVersion: 'test',
    parametersVersion: 'test',
  } as IRespuestaAgrometeorologiaSiembra;
}

describe('screening sanitario con fenologia proyectada', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('calcula Cebada con baja confianza y conserva las cuatro tarjetas sin alertarlas', async () => {
    const creadas: any[] = [];
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
      create: jest.fn(async (value) => {
        creadas.push(value);
        return value;
      }),
    };
    const service = new PrediccionCebadaService(
      repository as any,
      { update: jest.fn() } as any,
      {
        getAgrometeorologiaSiembra: jest
          .fn()
          .mockResolvedValue(
            respuesta('Hoja Bandera', 'cronograma_referencia'),
          ),
      } as any,
      { getByIdSiembra: jest.fn().mockResolvedValue({ datos: [] }) } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-cebada',
      fechaSiembra: '2026-07-15T03:00:00.000Z',
      coordenadas: { lat: -39, lng: -67 },
      semilla: { cultivo: 'Cebada', variedad: 'ANDREIA' },
    } as any);

    expect(creadas).toHaveLength(1);
    expect(creadas[0].enfermedades).toHaveLength(4);
    expect(
      creadas[0].enfermedades.filter(
        (item: any) => item.estado === 'calculado',
      ),
    ).not.toHaveLength(0);
    expect(
      creadas[0].enfermedades.some(
        (item: any) => item.estado === 'sin_datos',
      ),
    ).toBe(false);
    expect(
      creadas[0].enfermedades.map((item: any) => ({
        id: item.idEnfermedad,
        validacion: item.modelo.validacion,
        calidad: item.calidadDatos.nivel,
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          validacion: 'operativo_provisional',
          calidad: 'baja',
        }),
      ]),
    );
    expect(
      creadas[0].enfermedades.every(
        (item: any) => item.modelo.validacion === 'operativo_provisional',
      ),
    ).toBe(true);
    expect(creadas[0].calidadFenologia.nivel).toBe('baja');
    const manchaRed = creadas[0].enfermedades.find(
      (item: any) => item.idEnfermedad === 'cebada.mancha_red',
    );
    expect(manchaRed.modelo.version).toBe(4);
    expect(manchaRed.modelo.resolucion).toBe('horaria');
    expect(manchaRed.variables.diasVentana).toBe(1);
    expect(manchaRed.variables.diasFavorablesVentana).toBe(1);
    expect(manchaRed.variables.agregacionVersion).toBe(2);
    expect(manchaRed.resultado).toBeGreaterThan(0);
    expect(manchaRed.modelo.validacion).toBe('operativo_provisional');
  });

  it('retira de Mancha en Red los episodios que salen de la ventana movil de 14 dias', async () => {
    const base = respuesta('Primer Nudo', 'gdd_validado');
    base.series = Array.from({ length: 15 }, (_, index) => {
      const date = new Date('2026-07-02T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      const wet = index === 0;
      return {
        ...base.series[0],
        date: date.toISOString().slice(0, 10),
        stageConfidence: 'alta',
        metrics: {
          ...base.series[0].metrics,
          leafWetnessHours: wet ? 14 : 0,
          maxContinuousLeafWetnessHours: wet ? 12 : 0,
          meanTemperatureDuringLeafWetnessC: wet ? 20 : undefined,
        },
      };
    }) as any;
    const creadas: any[] = [];
    const service = new PrediccionCebadaService(
      {
        get: jest.fn().mockResolvedValue({ datos: [] }),
        create: jest.fn(async (value) => (creadas.push(value), value)),
      } as any,
      { update: jest.fn() } as any,
      { getAgrometeorologiaSiembra: jest.fn().mockResolvedValue(base) } as any,
      { getByIdSiembra: jest.fn().mockResolvedValue({ datos: [] }) } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-cebada-ventana',
      fechaSiembra: '2026-07-02T03:00:00.000Z',
      coordenadas: { lat: -33.245, lng: -61.384 },
      semilla: {
        cultivo: 'Cebada',
        variedad: 'ANDREIA',
        resistencia: [
          {
            idEnfermedad: 'cebada.mancha_red',
            enfermedad: 'Mancha en Red',
            multiplicador: 0.625,
            perfil: 'I',
            estado: 'observada',
            confianza: 'alta',
          },
        ],
      },
    } as any);

    const primera = creadas[0].enfermedades.find(
      (item: any) => item.idEnfermedad === 'cebada.mancha_red',
    );
    const ultima = creadas[creadas.length - 1].enfermedades.find(
      (item: any) => item.idEnfermedad === 'cebada.mancha_red',
    );
    expect(primera.resultado).toBeGreaterThan(0);
    expect(ultima.resultado).toBe(0);
    expect(ultima.variables.diasVentana).toBe(14);
    expect(ultima.variables.diasHorariosValidos).toBe(14);
    expect(ultima.variables.diasFavorablesVentana).toBe(0);
    expect(ultima.modelo.validacion).toBe('operativo');
    expect(
      creadas[creadas.length - 1].enfermedades
        .filter((item: any) => item.idEnfermedad !== 'cebada.mancha_red')
        .every((item: any) => item.modelo.validacion === 'operativo_provisional'),
    ).toBe(true);
  });

  it('no satura Mancha en Red por repetir rocio nocturno dentro de un mismo ciclo', async () => {
    const base = respuesta('Primer Nudo', 'gdd_validado');
    base.series = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-02T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return {
        ...base.series[0],
        date: date.toISOString().slice(0, 10),
        stageConfidence: 'alta',
        metrics: {
          ...base.series[0].metrics,
          leafWetnessHours: 14,
          maxContinuousLeafWetnessHours: 12,
          meanTemperatureDuringLeafWetnessC: 20,
        },
      };
    }) as any;
    const creadas: any[] = [];
    const service = new PrediccionCebadaService(
      {
        get: jest.fn().mockResolvedValue({ datos: [] }),
        create: jest.fn(async (value) => (creadas.push(value), value)),
      } as any,
      { update: jest.fn() } as any,
      { getAgrometeorologiaSiembra: jest.fn().mockResolvedValue(base) } as any,
      { getByIdSiembra: jest.fn().mockResolvedValue({ datos: [] }) } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-cebada-ciclo-humedo',
      fechaSiembra: '2026-07-02T03:00:00.000Z',
      coordenadas: { lat: -33.245, lng: -61.384 },
      semilla: {
        cultivo: 'Cebada',
        variedad: 'ANDREIA',
        resistencia: [
          {
            idEnfermedad: 'cebada.mancha_red',
            enfermedad: 'Mancha en Red',
            multiplicador: 0.625,
            perfil: 'I',
            estado: 'observada',
            confianza: 'alta',
          },
        ],
      },
    } as any);

    const ultima = creadas[creadas.length - 1].enfermedades.find(
      (item: any) => item.idEnfermedad === 'cebada.mancha_red',
    );
    expect(ultima.variables.diasFavorablesVentana).toBe(14);
    expect(ultima.variables.persistenciaVentana).toBe(1);
    expect(ultima.resultado).toBeGreaterThan(35);
    expect(ultima.resultado).toBeLessThan(60);
  });

  it('muestra screening experimental de Arveja con etapa térmica de referencia', async () => {
    const creadas: any[] = [];
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
      create: jest.fn(async (value) => {
        creadas.push(value);
        return value;
      }),
    };
    const service = new PrediccionArvejaService(
      repository as any,
      { update: jest.fn() } as any,
      {
        getAgrometeorologiaSiembra: jest
          .fn()
          .mockResolvedValue(
            respuesta(
              'E - Emergencia y desarrollo vegetativo',
              'rango_termico_referencia',
            ),
          ),
      } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-arveja',
      fechaSiembra: '2026-07-15T03:00:00.000Z',
      coordenadas: { lat: -39, lng: -67 },
      semilla: { cultivo: 'Arveja', variedad: 'KINGFISHER' },
    } as any);

    expect(creadas).toHaveLength(1);
    expect(creadas[0].enfermedades).toHaveLength(3);
    expect(
      creadas[0].enfermedades.filter(
        (item: any) => item.estado === 'calculado',
      ),
    ).not.toHaveLength(0);
    expect(
      creadas[0].enfermedades.some(
        (item: any) => item.estado === 'sin_datos',
      ),
    ).toBe(false);
    expect(
      creadas[0].enfermedades.every(
        (item: any) =>
          item.modelo.validacion === 'experimental' &&
          item.calidadDatos.nivel === 'baja',
      ),
    ).toBe(true);
    expect(creadas[0].calidadFenologia.nivel).toBe('baja');
  });

  it('conserva screening ambiental de Cebada sin inventar una etapa', async () => {
    const creadas: any[] = [];
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
      create: jest.fn(async (value) => {
        creadas.push(value);
        return value;
      }),
    };
    const service = new PrediccionCebadaService(
      repository as any,
      { update: jest.fn() } as any,
      {
        getAgrometeorologiaSiembra: jest
          .fn()
          .mockResolvedValue(respuesta('Ciclo en seguimiento', 'seguimiento')),
      } as any,
      { getByIdSiembra: jest.fn().mockResolvedValue({ datos: [] }) } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-cebada-sin-etapa',
      fechaSiembra: '2026-07-15T03:00:00.000Z',
      coordenadas: { lat: -39, lng: -67 },
      semilla: { cultivo: 'Cebada', variedad: 'SCARLETT' },
    } as any);

    expect(creadas).toHaveLength(1);
    expect(creadas[0].enfermedades).toHaveLength(4);
    expect(
      creadas[0].enfermedades.filter(
        (item: any) => item.estado === 'calculado',
      ),
    ).toHaveLength(3);
    expect(
      creadas[0].enfermedades.find(
        (item: any) => item.idEnfermedad === 'cebada.fusariosis_espiga',
      ).estado,
    ).toBe('fuera_ventana');
    expect(
      creadas[0].enfermedades.every(
        (item: any) => item.modelo.validacion === 'operativo_provisional',
      ),
    ).toBe(true);
    expect(creadas[0].calidadFenologia.nivel).toBe('sin_datos');
  });

  it('mantiene calculable Arveja con clima diario completo aunque falte mojado horario', async () => {
    const data = respuesta('E - Emergencia y desarrollo vegetativo', 'rango_termico_referencia');
    delete data.series[0].metrics.leafWetnessHours;
    const creadas: any[] = [];
    const service = new PrediccionArvejaService(
      {
        get: jest.fn().mockResolvedValue({ datos: [] }),
        create: jest.fn(async (value) => (creadas.push(value), value)),
      } as any,
      { update: jest.fn() } as any,
      { getAgrometeorologiaSiembra: jest.fn().mockResolvedValue(data) } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-arveja-diaria',
      fechaSiembra: '2026-07-15T03:00:00.000Z',
      coordenadas: { lat: -39, lng: -67 },
      semilla: { cultivo: 'Arveja', variedad: 'KINGFISHER' },
    } as any);

    expect(creadas[0].enfermedades.some((item: any) => item.estado === 'sin_datos')).toBe(false);
    expect(creadas[0].enfermedades[0].modelo.resolucion).toBe('proxy_diario');
  });
});
