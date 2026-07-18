import { IPrediccion, TRIGO_MOTOR_SANITARIO_VERSION } from 'modelos/src';

jest.mock(
  'src/entidades/fumigacion/service',
  () => ({ FumigacionsService: class FumigacionsService {} }),
  { virtual: true },
);

import { PrediccionTrigoService } from './trigo';

describe('continuidad diaria del orquestador sanitario trigo v4', () => {
  const crono = {
    etapas: {
      R0_R1: 1,
      R1_R2: 10,
      R2_R3: 10,
      R3_R4: 10,
      R4_R5: 10,
      R5_R6: 10,
      R6_R7: 10,
    },
  } as any;
  const siembra = {
    _id: 'siembra-1',
    fechaSiembra: '2026-05-01T03:00:00.000Z',
    coordenadas: { lat: -34, lng: -60 },
    semilla: { cultivo: 'Trigo', resistencia: [] },
  } as any;
  const climaEntre = (desde: string, hasta: string) => {
    const datos: any[] = [];
    for (
      const fecha = new Date(desde);
      fecha <= new Date(hasta);
      fecha.setUTCDate(fecha.getUTCDate() + 1)
    ) {
      datos.push({
        fecha: fecha.toISOString(),
        fuente: 'OpenMeteo',
        estacion: 'open-meteo',
        distancia: 1200,
        temperatura: { min: 10, avg: 20, max: 25 },
        humedad: { avg: 70 },
        lluvia: { sum: 0 },
        velocidadViento: { avg: 5 },
        calidadDatos: {
          nivel: 'media',
          fuente: 'open_meteo',
          cobertura: 1,
          fallback: true,
          resumen: 'Open-Meteo diario.',
          limitaciones: [],
        },
      });
    }
    return datos;
  };

  const respuestaCanonica = (
    clima: any[],
    etapa = 'Emergencia',
    stageSource = 'gdd_validado',
  ): any => ({
    summary: {},
    dataSource: {
      type: 'open_meteo',
      sources: ['open_meteo'],
      completenessPercentage: clima.length ? 100 : 0,
    },
    series: clima.map((item, index) => ({
      date: item.fecha.slice(0, 10),
      isForecast: false,
      stage: etapa,
      stageSource,
      stageConfidence:
        stageSource === 'cronograma_referencia' ? 'referencia' : 'media',
      weather: {
        temperatureMinC: item.temperatura.min,
        temperatureMeanC: item.temperatura.avg,
        temperatureMaxC: item.temperatura.max,
        relativeHumidityMeanPct: item.humedad.avg,
        precipitationMm: item.lluvia.sum,
        windSpeedMs: item.velocidadViento.avg,
      },
      metrics: {
        temperatureMinC: item.temperatura.min,
        temperatureMeanC: item.temperatura.avg,
        temperatureMaxC: item.temperatura.max,
        relativeHumidityMeanPct: item.humedad.avg,
        precipitationMm: item.lluvia.sum,
        gddBaseTemperatureC: 0,
        gddAccumulated: 880 + index * 20,
        gddAccumulationComplete: true,
      },
      source: 'open_meteo',
      sourceByVariable: {},
      qualityFlags: [],
      warnings: [],
    })),
    warnings: [],
    calculationVersion: 'test',
    parametersVersion: 'test',
  });

  const crear = (
    anterior: IPrediccion,
    clima: any[],
    etapa = 'Emergencia',
    opciones: {
      stageSource?: string;
      motor?: () => any;
    } = {},
  ) => {
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [anterior] }),
      create: jest.fn(async (item) => ({ ...item, _id: 'nueva' })),
    };
    const siembras = { update: jest.fn() };
    const servicios = {
      predecir: jest.fn(
        opciones.motor ||
          (() => {
            throw new Error('No debe invocar un motor fuera de ventana');
          }),
      ),
    };
    const service = new PrediccionTrigoService(
      repository as any,
      siembras as any,
      { get: jest.fn().mockResolvedValue(crono) } as any,
      {
        getAgrometeorologiaSiembra: jest
          .fn()
          .mockResolvedValue(
            respuestaCanonica(clima, etapa, opciones.stageSource),
          ),
      } as any,
      { getByIdSiembra: jest.fn().mockResolvedValue({ datos: [] }) } as any,
      servicios as any,
      servicios as any,
      servicios as any,
      servicios as any,
      servicios as any,
    );
    return { service, repository, siembras, servicios };
  };

  it('degrada calidad si el crudo sale de 0-100 sin alterar resultado ni estado', () => {
    const { service } = crear({ enfermedades: [] }, []);
    const prediccion: any = {
      enfermedad: 'Roya de la Hoja',
      idEnfermedad: 'trigo.roya_hoja',
      estado: 'calculado',
      resultado: 100,
      calidadDatos: {
        nivel: 'alta',
        fuente: 'catalogo',
        limitaciones: [],
      },
      variables: { resultadoCrudo: 120 },
    };

    (service as any).aplicarControlDominioResultado(prediccion);

    expect(prediccion.estado).toBe('calculado');
    expect(prediccion.resultado).toBe(100);
    expect(prediccion.calidadDatos.nivel).toBe('baja');
    expect(prediccion.calidadDatos.limitaciones).toContain(
      'Salida fuera del dominio 0-100; no alertar/prescribir.',
    );
  });

  it('valida la frecuencia horaria de roya amarilla sin exigir el contrato en sombra', () => {
    const { service } = crear({ enfermedades: [] }, []);
    const prediccion: any = {
      enfermedad: 'Roya Anaranjada',
      idEnfermedad: 'trigo.roya_anaranjada',
      estado: 'calculado',
      resultado: 15,
      modelo: {
        id: 'trigo.roya_anaranjada',
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        fuente: 'El Jarroudi 2017',
        resolucion: 'horaria',
        validacion: 'experimental',
      },
      calidadDatos: {
        nivel: 'baja',
        fuente: 'open_meteo',
        limitaciones: ['Experimental; sin automatizacion.'],
      },
      variables: {
        frecuenciaAmbientalPct: 15,
        resultadoContractualCrudo: 180,
      },
    };

    (service as any).aplicarControlDominioResultado(prediccion);

    expect(prediccion.calidadDatos.limitaciones).not.toContain(
      'Salida fuera del dominio 0-100; no alertar/prescribir.',
    );
    expect(prediccion.calidadDatos.fuente).toBe('open_meteo');
  });

  it('no abre las manchas durante Emergencia y las habilita desde Espiguilla Terminal', () => {
    const { service } = crear({ enfermedades: [] }, []);

    expect((service as any).estaEnVentanaManchas(1)).toBe(false);
    expect((service as any).estaEnVentanaManchas(2)).toBe(true);
    expect((service as any).estaEnVentanaManchas(4)).toBe(true);
    expect((service as any).estaEnVentanaManchas(5)).toBe(false);
  });

  it('calcula enfermedades foliares por GDD completo aunque la etapa sea solo de referencia', async () => {
    const legacy = {
      fecha: '2026-05-03T03:00:00.000Z',
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          resultado: 0,
          modelo: { id: 'trigo.roya_hoja', version: 4, fuente: 'legacy' },
          variables: { GDDBase0Siembra: 840, coberturaGdd: 1 },
        },
      ],
    } as IPrediccion;
    const motor = () => ({
      enfermedad: 'Screening foliar',
      idEnfermedad: 'trigo.mancha_amarilla',
      resultado: 12,
      estado: 'calculado',
      calidadDatos: { nivel: 'media', fuente: 'open_meteo', cobertura: 1 },
      modelo: {
        id: 'trigo.mancha_amarilla',
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        fuente: 'test',
      },
      variables: { resultadoCrudo: 12 },
    });
    const { service, repository, servicios } = crear(
      legacy,
      climaEntre('2026-05-01T03:00:00.000Z', '2026-05-04T03:00:00.000Z'),
      'Espiguilla Terminal',
      { stageSource: 'cronograma_referencia', motor },
    );
    jest
      .spyOn(service as any, 'getFechaHasta')
      .mockReturnValue(new Date('2026-05-05T03:00:00.000Z'));

    const creadas = await service.hacerPredicciones(siembra);

    expect(servicios.predecir).toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(creadas[0].calidadFenologia).toMatchObject({
      nivel: 'baja',
      fallback: true,
    });
    expect(
      creadas[0].enfermedades.some((item) => item.estado === 'calculado'),
    ).toBe(true);
  });

  it('no persiste un falso sin-datos para una fecha aun no consolidada', async () => {
    const anterior = {
      fecha: '2026-05-02T03:00:00.000Z',
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          idEnfermedad: 'trigo.roya_hoja',
          resultado: 0,
          estado: 'fuera_ventana',
          modelo: {
            id: 'trigo.roya_hoja',
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            fuente: 'test',
          },
          variables: { GDDBase0Siembra: 40, coberturaGdd: 1 },
        },
      ],
    } as IPrediccion;
    const { service, repository } = crear(
      anterior,
      climaEntre('2026-05-03T03:00:00.000Z', '2026-05-03T03:00:00.000Z'),
    );
    jest
      .spyOn(service as any, 'getFechaHasta')
      .mockReturnValue(new Date('2026-05-05T03:00:00.000Z'));

    await service.hacerPredicciones(siembra);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create.mock.calls[0][0].fecha).toBe(
      '2026-05-03T03:00:00.000Z',
    );
  });

  it('reconstruye v4 en memoria sin chocar fechas legacy y persiste solo dias nuevos', async () => {
    const legacy = {
      fecha: '2026-05-03T03:00:00.000Z',
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          resultado: 50,
          modelo: { id: 'trigo.roya_hoja', version: 3, fuente: 'legacy' },
          variables: { GD: 500 },
        },
      ],
    } as IPrediccion;
    const { service, repository } = crear(
      legacy,
      climaEntre('2026-05-01T03:00:00.000Z', '2026-05-04T03:00:00.000Z'),
    );
    jest
      .spyOn(service as any, 'getFechaHasta')
      .mockReturnValue(new Date('2026-05-05T03:00:00.000Z'));
    const creadas = await service.hacerPredicciones(siembra);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create.mock.calls[0][0].fecha).toBe(
      '2026-05-04T03:00:00.000Z',
    );
    expect(creadas).toHaveLength(1);
    expect(creadas[0].enfermedades).toHaveLength(5);
    expect(creadas[0].estacion).toMatchObject({
      idEstacion: 'agrometeorologia:open_meteo',
      fuente: 'OpenMeteo',
      distanciaMetros: 0,
    });
    expect(
      creadas[0].enfermedades.every((item) => item.estado === 'fuera_ventana'),
    ).toBe(true);
  });

  it('persiste un cierre terminal de etapa 7 y conserva acumuladores', async () => {
    const anterior = {
      fecha: '2026-05-06T03:00:00.000Z',
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          idEnfermedad: 'trigo.roya_hoja',
          resultado: 22,
          estado: 'calculado',
          modelo: {
            id: 'trigo.roya_hoja',
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            fuente: 'test',
          },
          variables: {
            GD: 12,
            DHR: 3,
            GDDBase0Siembra: 900,
            coberturaGdd: 1,
          },
        },
      ],
    } as IPrediccion;
    const { service, repository, servicios } = crear(
      anterior,
      climaEntre('2026-05-05T03:00:00.000Z', '2026-05-07T03:00:00.000Z'),
      'Madurez Fisiologica',
    );
    jest
      .spyOn(service as any, 'getFechaHasta')
      .mockReturnValue(new Date('2026-05-08T03:00:00.000Z'));
    await service.hacerPredicciones(siembra);

    expect(servicios.predecir).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledTimes(1);
    const cierre = repository.create.mock.calls[0][0];
    expect(cierre.enfermedades).toHaveLength(5);
    expect(
      cierre.enfermedades.every(
        (item) => item.estado === 'fuera_ventana' && item.resultado === 0,
      ),
    ).toBe(true);
    expect(
      cierre.enfermedades.find(
        (item) => item.idEnfermedad === 'trigo.roya_hoja',
      ).variables,
    ).toMatchObject({ GD: 12, DHR: 3, GDDBase0Siembra: 920 });
  });

  it('aborta la serie si una fecha nueva no se puede persistir', async () => {
    const anterior = {
      fecha: '2026-05-06T03:00:00.000Z',
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          idEnfermedad: 'trigo.roya_hoja',
          resultado: 0,
          modelo: {
            id: 'trigo.roya_hoja',
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            fuente: 'test',
          },
          variables: { GDDBase0Siembra: 900, coberturaGdd: 1 },
        },
      ],
    } as IPrediccion;
    const { service, repository } = crear(
      anterior,
      climaEntre('2026-05-05T03:00:00.000Z', '2026-05-09T03:00:00.000Z'),
      'Madurez Fisiologica',
    );
    repository.create.mockRejectedValueOnce(new Error('duplicado/transitorio'));
    jest
      .spyOn(service as any, 'getFechaHasta')
      .mockReturnValue(new Date('2026-05-10T03:00:00.000Z'));
    await expect(service.hacerPredicciones(siembra)).rejects.toThrow(
      'duplicado/transitorio',
    );
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('devuelve cierre sintetico no persistido para un ciclo legacy ya finalizado', async () => {
    const legacy = {
      fecha: '2026-05-20T03:00:00.000Z',
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          resultado: 80,
          modelo: { id: 'trigo.roya_hoja', version: 3, fuente: 'legacy' },
          variables: { GD: 500 },
        },
      ],
    } as IPrediccion;
    const { service, repository, siembras } = crear(
      legacy,
      climaEntre('2026-05-01T03:00:00.000Z', '2026-05-04T03:00:00.000Z'),
      'Madurez Fisiologica',
    );
    jest
      .spyOn(service as any, 'getFechaHasta')
      .mockReturnValue(new Date('2026-05-05T03:00:00.000Z'));
    const salidas = await service.hacerPredicciones(siembra);

    expect(repository.create).not.toHaveBeenCalled();
    expect(siembras.update).not.toHaveBeenCalled();
    expect(salidas).toHaveLength(1);
    expect(salidas[0]._id).toBeUndefined();
    expect(salidas[0].etapa).toBe(7);
    expect(salidas[0].enfermedades).toHaveLength(5);
    expect(
      salidas[0].enfermedades.every(
        (item) => item.estado === 'fuera_ventana' && item.resultado === 0,
      ),
    ).toBe(true);
    expect(Date.now() - new Date(salidas[0].fecha).getTime()).toBeLessThan(
      5000,
    );
  });

  it('no infiere un cierre fenologico cuando la serie canonica no existe', async () => {
    const legacy = {
      fecha: '2026-05-20T03:00:00.000Z',
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          resultado: 80,
          modelo: { id: 'trigo.roya_hoja', version: 3, fuente: 'legacy' },
          variables: { GD: 500 },
        },
      ],
    } as IPrediccion;
    const { service, repository } = crear(legacy, []);
    jest
      .spyOn(service as any, 'getFechaHasta')
      .mockReturnValue(new Date('2026-05-05T03:00:00.000Z'));
    const salidas = await service.hacerPredicciones(siembra);

    expect(repository.create).not.toHaveBeenCalled();
    expect(salidas).toBeUndefined();
  });
});
