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
});
