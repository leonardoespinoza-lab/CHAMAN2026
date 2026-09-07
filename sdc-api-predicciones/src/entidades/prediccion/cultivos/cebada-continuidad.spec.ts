import {
  esPrediccionSanitariaAlertable,
  IRespuestaAgrometeorologiaSiembra,
  IPrediccion,
  IPrediccionEnfermedad,
  ISiembra,
} from 'modelos/src';
import { PrediccionCebadaService } from './cebada';

const ROYA = 'cebada.roya_hoja';
const FUSARIOSIS = 'cebada.fusariosis_espiga';
const ESCALDADURA = 'cebada.escaldadura';
const MANCHA_RED = 'cebada.mancha_red';

function dia(date: string) {
  return {
    date,
    isForecast: false,
    stage: 'Espigazon',
    stageSource: 'campo',
    stageConfidence: 'alta',
    weather: {
      temperatureMinC: 8,
      temperatureMeanC: 15,
      temperatureMaxC: 28,
      relativeHumidityMeanPct: 90,
      precipitationMm: 1,
    },
    metrics: {
      leafWetnessHours: 18,
      maxContinuousLeafWetnessHours: 18,
      meanTemperatureDuringLeafWetnessC: 15,
      gddBaseTemperatureC: 0,
      gddAccumulated: 900,
      gddAccumulationComplete: true,
    },
    source: 'open_meteo',
    sourceByVariable: {},
    qualityFlags: [],
    warnings: [],
  } as any;
}

function respuesta(series: ReturnType<typeof dia>[]) {
  return {
    summary: {},
    dataSource: {
      type: 'open_meteo',
      sources: ['open_meteo'],
      completenessPercentage: 100,
    },
    series,
    warnings: [],
    calculationVersion: 'test-continuidad',
    parametersVersion: 'test-continuidad',
  } as IRespuestaAgrometeorologiaSiembra;
}

function ultimaConAcumulados(formulaVersion = 3): IPrediccion {
  return {
    _id: 'prediccion-previa-local',
    idSiembra: 'siembra-cebada-local',
    fecha: '2026-07-10T03:00:00.000Z',
    enfermedades: [
      {
        idEnfermedad: ROYA,
        enfermedad: 'Roya de la Hoja de Cebada',
        resultado: 88,
        estado: 'calculado',
        variables: {
          formulaVersion,
          GD: 100,
          DHR: 20,
          resultadoCrudo: 88,
          temperaturaScore: 3,
          etapaScore: 1,
        },
      },
      {
        idEnfermedad: FUSARIOSIS,
        enfermedad: 'Fusariosis de la Espiga de Cebada',
        resultado: 77,
        estado: 'calculado',
        variables: {
          formulaVersion,
          GDAcum: 100,
          PMoj: 2,
          GDN: 3,
          resultadoCrudo: 77,
          temperaturaScore: 3,
          etapaScore: 1,
        },
      },
    ],
  } as any;
}

const siembra = {
  _id: 'siembra-cebada-local',
  fechaSiembra: '2026-07-10T03:00:00.000Z',
  coordenadas: { lat: -33, lng: -64 },
  semilla: {
    cultivo: 'Cebada',
    variedad: 'ANDREIA',
    resistencia: [ROYA, FUSARIOSIS, ESCALDADURA, MANCHA_RED].map(
      (idEnfermedad) => ({
        idEnfermedad,
        multiplicador: 1,
        perfil: 'S',
        estado: 'observada',
        confianza: 'alta',
      }),
    ),
  },
} as ISiembra;

function crearServicio(
  series: ReturnType<typeof dia>[],
  ultima: IPrediccion = ultimaConAcumulados(),
) {
  const creadas: IPrediccion[] = [];
  const repository = {
    get: jest.fn().mockResolvedValue({ datos: ultima ? [ultima] : [] }),
    create: jest.fn(async (value) => {
      const created = { ...value, _id: `prediccion-local-${creadas.length}` };
      creadas.push(created);
      return created;
    }),
  };
  const siembrasService = { update: jest.fn().mockResolvedValue(undefined) };
  const climaService = {
    getAgrometeorologiaSiembra: jest.fn().mockResolvedValue(respuesta(series)),
  };
  const fumigaciones = {
    getByIdSiembra: jest.fn().mockResolvedValue({ datos: [] }),
  };
  return {
    creadas,
    repository,
    fumigaciones,
    service: new PrediccionCebadaService(
      repository as any,
      siembrasService as any,
      climaService as any,
      fumigaciones as any,
    ),
  };
}

function enfermedad(
  prediccion: IPrediccion,
  id: string,
): IPrediccionEnfermedad {
  const item = prediccion.enfermedades.find(
    (value) => value.idEnfermedad === id,
  );
  expect(item).toBeDefined();
  return item!;
}

function expectNoCalculada(item: IPrediccionEnfermedad) {
  expect(item.estado).toBe('sin_datos');
  expect(item.resultado).toBe(0);
  expect(item.calidadDatos?.nivel).toBe('sin_datos');
  expect(esPrediccionSanitariaAlertable(item)).toBe(false);
}

describe('Cebada: ausencias reales y continuidad de acumuladores', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['vacio', ''],
    ['espacios', '   '],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['boolean false', false],
    ['boolean true', true],
  ])(
    'no convierte horas de mojado %s en un cero calculado',
    async (_, value) => {
      const actual = dia('2026-07-11');
      actual.metrics.leafWetnessHours = value;
      actual.metrics.maxContinuousLeafWetnessHours = value;
      actual.metrics.meanTemperatureDuringLeafWetnessC = value;
      const { service, creadas } = crearServicio([dia('2026-07-10'), actual]);

      await service.hacerPredicciones(siembra);

      expect(creadas).toHaveLength(1);
      expectNoCalculada(enfermedad(creadas[0], ESCALDADURA));
      expect(enfermedad(creadas[0], MANCHA_RED).modelo?.resolucion).not.toBe(
        'horaria',
      );
    },
  );

  it.each([0, '0'])(
    'conserva %s horas reales de mojado como dia seco horario',
    async (value) => {
      const actual = dia('2026-07-11');
      actual.metrics.leafWetnessHours = value;
      actual.metrics.maxContinuousLeafWetnessHours = value;
      actual.metrics.meanTemperatureDuringLeafWetnessC = undefined;
      actual.weather.precipitationMm = 0;
      const { service, creadas } = crearServicio([actual]);

      await service.hacerPredicciones(siembra);

      const escaldadura = enfermedad(creadas[0], ESCALDADURA);
      expect(escaldadura.estado).toBe('calculado');
      expect(escaldadura.resultado).toBe(0);
      expect(escaldadura.modelo?.resolucion).toBe('horaria');
      expect(escaldadura.variables).toMatchObject({ horasMojado: 0, fHMF: 0 });
      expect(enfermedad(creadas[0], MANCHA_RED).modelo?.resolucion).toBe(
        'horaria',
      );
    },
  );

  it.each([
    'maxContinuousLeafWetnessHours',
    'meanTemperatureDuringLeafWetnessC',
  ])(
    'no etiqueta evidencia horaria con %s nulo y mojado positivo',
    async (field) => {
      const actual = dia('2026-07-11');
      actual.metrics[field] = null;
      const { service, creadas } = crearServicio([actual]);

      await service.hacerPredicciones(siembra);

      expect(enfermedad(creadas[0], MANCHA_RED).modelo?.resolucion).toBe(
        'proxy_diario',
      );
      expect(enfermedad(creadas[0], MANCHA_RED).modelo?.validacion).toBe(
        'operativo_provisional',
      );
    },
  );

  it('mantiene los resultados diarios existentes de Escaldadura sin convertirlos en acumulacion', async () => {
    const series = [9, 20, 11].map((hours, i) => {
      const value = dia(`2026-07-${11 + i}`);
      value.weather.temperatureMeanC = [10.4, 12.4, 12.7][i];
      value.weather.precipitationMm = [0.4, 1.8, 0.7][i];
      value.metrics.leafWetnessHours = hours;
      value.metrics.maxContinuousLeafWetnessHours = hours;
      return value;
    });
    const { service, creadas } = crearServicio(series);

    await service.hacerPredicciones(siembra);

    expect(
      creadas.map((item) => enfermedad(item, ESCALDADURA).resultado),
    ).toEqual([0, 24, 0]);
  });

  it('preserva ambos acumuladores en una cadena valido -> sin_datos -> valido', async () => {
    const faltaTemperatura = dia('2026-07-12');
    faltaTemperatura.weather.temperatureMeanC = null;
    const { service, creadas } = crearServicio([
      dia('2026-07-10'),
      dia('2026-07-11'),
      faltaTemperatura,
      dia('2026-07-13'),
    ]);

    await service.hacerPredicciones(siembra);

    expect(creadas).toHaveLength(3);
    expect(enfermedad(creadas[0], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
    });
    expect(enfermedad(creadas[0], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
    });
    for (const id of [ROYA, FUSARIOSIS]) {
      const ausente = enfermedad(creadas[1], id);
      expectNoCalculada(ausente);
      expect(ausente.variables).not.toHaveProperty('resultadoCrudo');
      expect(ausente.variables).not.toHaveProperty('temperaturaScore');
      expect(ausente.variables).toMatchObject({ acumulacionIncompleta: 1 });
      const retomada = enfermedad(creadas[2], id);
      expect(retomada.estado).toBe('calculado');
      expect(retomada.variables).toMatchObject({ acumulacionIncompleta: 1 });
      expect(retomada.calidadDatos?.nivel).toBe('baja');
      expect(retomada.calidadDatos?.fallback).toBe(true);
      expect(retomada.modelo?.validacion).toBe('operativo_provisional');
      expect(esPrediccionSanitariaAlertable(retomada)).toBe(false);
    }
    expect(enfermedad(creadas[1], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
    });
    expect(enfermedad(creadas[1], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
    });
    expect(enfermedad(creadas[2], ROYA).variables).toMatchObject({
      GD: 106,
      DHR: 20,
    });
    expect(enfermedad(creadas[2], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 130,
      PMoj: 4,
      GDN: 9,
    });
  });

  it.each([2, 3])(
    'conserva solo acumuladores compatibles v%s durante un dia bloqueado',
    async (version) => {
      const bloqueado = dia('2026-07-11');
      bloqueado.qualityFlags = [
        'insufficient_hourly_temperature_coverage_for_daily_aggregate',
      ];
      const { service, creadas } = crearServicio(
        [dia('2026-07-10'), bloqueado],
        ultimaConAcumulados(version),
      );

      await service.hacerPredicciones(siembra);

      const roya = enfermedad(creadas[0], ROYA);
      const fusariosis = enfermedad(creadas[0], FUSARIOSIS);
      expectNoCalculada(roya);
      expectNoCalculada(fusariosis);
      expect(roya.variables).toMatchObject({ GD: 100, DHR: 20 });
      expect(fusariosis.variables).toMatchObject({
        GDAcum: 100,
        PMoj: 2,
        GDN: 3,
      });
      for (const item of [roya, fusariosis]) {
        expect(item.variables).not.toHaveProperty('resultadoCrudo');
        expect(item.variables).not.toHaveProperty('temperaturaScore');
        expect(item.variables).not.toHaveProperty('etapaScore');
        expect(item.variables).toMatchObject({ acumulacionIncompleta: 1 });
      }
    },
  );

  it('no hereda acumuladores de una version incompatible', async () => {
    const bloqueado = dia('2026-07-11');
    bloqueado.weather.temperatureMeanC = null;
    const { service, creadas } = crearServicio(
      [dia('2026-07-10'), bloqueado],
      ultimaConAcumulados(99),
    );

    await service.hacerPredicciones(siembra);

    for (const id of [ROYA, FUSARIOSIS]) {
      const item = enfermedad(creadas[0], id);
      expectNoCalculada(item);
      for (const name of ['GD', 'DHR', 'GDAcum', 'PMoj', 'GDN']) {
        expect(item.variables).not.toHaveProperty(name);
      }
    }
  });

  it('retoma acumuladores persistidos al reiniciar con ultima prediccion sin_datos', async () => {
    const ausente = dia('2026-07-11');
    ausente.weather.temperatureMeanC = null;
    const primera = crearServicio([dia('2026-07-10'), ausente]);
    await primera.service.hacerPredicciones(siembra);
    const ultimaPersistida = JSON.parse(JSON.stringify(primera.creadas[0]));
    expectNoCalculada(enfermedad(ultimaPersistida, ROYA));
    expectNoCalculada(enfermedad(ultimaPersistida, FUSARIOSIS));

    const reiniciada = crearServicio(
      [dia('2026-07-10'), ausente, dia('2026-07-12')],
      ultimaPersistida,
    );
    await reiniciada.service.hacerPredicciones(siembra);

    expect(reiniciada.creadas).toHaveLength(1);
    expect(reiniciada.creadas[0].fecha).toBe('2026-07-12T03:00:00.000Z');
    expect(enfermedad(reiniciada.creadas[0], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
    });
    expect(
      enfermedad(reiniciada.creadas[0], FUSARIOSIS).variables,
    ).toMatchObject({ GDAcum: 115, PMoj: 3, GDN: 6 });
    for (const id of [ROYA, FUSARIOSIS]) {
      const item = enfermedad(reiniciada.creadas[0], id);
      expect(item.variables).toMatchObject({ acumulacionIncompleta: 1 });
      expect(item.calidadDatos?.nivel).toBe('baja');
      expect(item.calidadDatos?.fallback).toBe(true);
      expect(esPrediccionSanitariaAlertable(item)).toBe(false);
    }
  });

  it('conserva la marca de incompleta tras huecos consecutivos y varios dias recuperados', async () => {
    const ausente1 = dia('2026-07-11');
    const ausente2 = dia('2026-07-12');
    ausente1.weather.temperatureMeanC = undefined;
    ausente2.weather.temperatureMeanC = undefined;
    const { service, creadas } = crearServicio([
      dia('2026-07-10'),
      ausente1,
      ausente2,
      dia('2026-07-13'),
      dia('2026-07-14'),
    ]);

    await service.hacerPredicciones(siembra);

    expect(creadas).toHaveLength(4);
    for (const prediccion of creadas.slice(0, 2)) {
      expectNoCalculada(enfermedad(prediccion, ROYA));
      expectNoCalculada(enfermedad(prediccion, FUSARIOSIS));
      expect(enfermedad(prediccion, ROYA).variables).toMatchObject({
        GD: 100,
        DHR: 20,
      });
      expect(enfermedad(prediccion, FUSARIOSIS).variables).toMatchObject({
        GDAcum: 100,
        PMoj: 2,
        GDN: 3,
      });
    }
    expect(enfermedad(creadas[3], ROYA).variables).toMatchObject({
      GD: 106,
      DHR: 20,
    });
    expect(enfermedad(creadas[3], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 130,
      PMoj: 4,
      GDN: 9,
    });
    for (const prediccion of creadas) {
      for (const id of [ROYA, FUSARIOSIS]) {
        const item = enfermedad(prediccion, id);
        expect(item.variables).toMatchObject({ acumulacionIncompleta: 1 });
        if (item.estado === 'calculado') {
          expect(item.calidadDatos?.nivel).toBe('baja');
          expect(item.calidadDatos?.fallback).toBe(true);
        }
      }
    }
  });

  it('marca incompleta una ultima sin_datos historica sin reconstruir acumuladores perdidos', async () => {
    const ultima = ultimaConAcumulados();
    ultima.enfermedades = ultima.enfermedades.map((item) => ({
      ...item,
      resultado: 0,
      estado: 'sin_datos',
      variables: { formulaVersion: 3 },
      calidadDatos: {
        nivel: 'sin_datos',
        fuente: 'desconocida',
        cobertura: 0,
        fallback: true,
        resumen: 'Registro historico sin acumuladores preservados.',
      },
    }));
    const { service, creadas } = crearServicio(
      [dia('2026-07-10'), dia('2026-07-11')],
      ultima,
    );

    await service.hacerPredicciones(siembra);

    expect(creadas).toHaveLength(1);
    for (const id of [ROYA, FUSARIOSIS]) {
      const item = enfermedad(creadas[0], id);
      expectNoCalculada(item);
      expect(item.variables).toMatchObject({ acumulacionIncompleta: 1 });
      for (const name of ['GD', 'DHR', 'GDAcum', 'PMoj', 'GDN']) {
        expect(item.variables).not.toHaveProperty(name);
      }
      expect(item.calidadDatos?.limitaciones?.join(' ')).toMatch(
        /reconstr|reproces|recalcul/i,
      );
    }
  });

  it('suspende el dia de tratamiento sin borrar acumuladores ni declararlo como cero observado', async () => {
    const { service, creadas, fumigaciones } = crearServicio([
      dia('2026-07-10'),
      dia('2026-07-11'),
      dia('2026-07-12'),
      dia('2026-07-13'),
    ]);
    fumigaciones.getByIdSiembra.mockResolvedValue({
      datos: [{ fechaFumigacion: '2026-07-12T03:00:00.000Z', duracion: 1 }],
    });

    await service.hacerPredicciones(siembra);

    expect(creadas).toHaveLength(3);
    for (const id of [ROYA, FUSARIOSIS]) {
      const suspendida = enfermedad(creadas[1], id);
      expectNoCalculada(suspendida);
      expect(suspendida.variables).toMatchObject({ acumulacionIncompleta: 1 });
      const explicacion = [
        suspendida.modelo?.alcance,
        suspendida.calidadDatos?.resumen,
        ...(suspendida.calidadDatos?.limitaciones || []),
      ].join(' ');
      expect(explicacion).toMatch(/tratamiento|fumigacion|fumigación/i);
      expect(explicacion).not.toMatch(/fuera de la ventana fenol[oó]gica/i);
      expect(enfermedad(creadas[2], id).variables).toMatchObject({
        acumulacionIncompleta: 1,
      });
    }
    expect(enfermedad(creadas[1], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
    });
    expect(enfermedad(creadas[1], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
    });
    expect(enfermedad(creadas[2], ROYA).variables).toMatchObject({
      GD: 106,
      DHR: 20,
    });
    expect(enfermedad(creadas[2], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 130,
      PMoj: 4,
      GDN: 9,
    });
  });

  it('detecta un dia entero ausente sin inventar clima ni completar acumulacion', async () => {
    const { service, creadas } = crearServicio([
      dia('2026-07-10'),
      dia('2026-07-11'),
      dia('2026-07-13'),
    ]);

    await service.hacerPredicciones(siembra);

    expect(creadas.map((item) => item.fecha)).toEqual([
      '2026-07-11T03:00:00.000Z',
      '2026-07-13T03:00:00.000Z',
    ]);
    const roya = enfermedad(creadas[1], ROYA);
    expect(roya.estado).toBe('calculado');
    expect(roya.variables).toMatchObject({
      GD: 106,
      DHR: 20,
      acumulacionIncompleta: 1,
    });
    expect(roya.calidadDatos?.nivel).toBe('baja');
    expect(roya.calidadDatos?.fallback).toBe(true);
    const fusariosis = enfermedad(creadas[1], FUSARIOSIS);
    expectNoCalculada(fusariosis);
    expect(fusariosis.variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
      acumulacionIncompleta: 1,
    });
  });

  it('resuelve continuidad por identificador canonico aunque cambie la etiqueta', async () => {
    const ultima = ultimaConAcumulados();
    ultima.enfermedades.forEach((item) => {
      item.enfermedad = 'Etiqueta historica' as any;
    });
    const { service, creadas } = crearServicio(
      [dia('2026-07-10'), dia('2026-07-11')],
      ultima,
    );

    await service.hacerPredicciones(siembra);

    expect(enfermedad(creadas[0], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
    });
    expect(enfermedad(creadas[0], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
    });
  });

  it('acepta el nombre legado solo cuando la lectura no tiene identificador', async () => {
    const ultima = ultimaConAcumulados();
    ultima.enfermedades.forEach((item) => {
      delete item.idEnfermedad;
    });
    const { service, creadas } = crearServicio(
      [dia('2026-07-10'), dia('2026-07-11')],
      ultima,
    );

    await service.hacerPredicciones(siembra);

    expect(enfermedad(creadas[0], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
    });
    expect(enfermedad(creadas[0], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
    });
  });

  it('no usa el nombre para heredar acumuladores de otro identificador', async () => {
    const ultima = ultimaConAcumulados();
    ultima.enfermedades.forEach((item) => {
      item.idEnfermedad = 'trigo.roya_hoja';
    });
    const { service, creadas } = crearServicio(
      [dia('2026-07-10'), dia('2026-07-11')],
      ultima,
    );

    await service.hacerPredicciones(siembra);

    expect(enfermedad(creadas[0], ROYA).variables).toMatchObject({
      GD: 3,
      DHR: 0,
    });
    expect(enfermedad(creadas[0], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 15,
      PMoj: 1,
      GDN: 3,
    });
  });

  it('conserva acumuladores al salir y reingresar a la ventana fenologica', async () => {
    const fuera = dia('2026-07-12');
    fuera.stage = 'Madurez Fisiologica';
    const { service, creadas } = crearServicio([
      dia('2026-07-10'),
      dia('2026-07-11'),
      fuera,
      dia('2026-07-13'),
    ]);

    await service.hacerPredicciones(siembra);

    expect(creadas).toHaveLength(3);
    for (const id of [ROYA, FUSARIOSIS]) {
      const suspendida = enfermedad(creadas[1], id);
      expect(suspendida.estado).toBe('fuera_ventana');
      expect(suspendida.resultado).toBe(0);
      expect(esPrediccionSanitariaAlertable(suspendida)).toBe(false);
    }
    expect(enfermedad(creadas[1], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
    });
    expect(enfermedad(creadas[1], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
    });
    expect(enfermedad(creadas[2], ROYA).variables).toMatchObject({
      GD: 106,
      DHR: 20,
    });
    expect(enfermedad(creadas[2], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 130,
      PMoj: 4,
      GDN: 9,
    });
    expect(enfermedad(creadas[2], ROYA).estado).toBe('calculado');
    expect(enfermedad(creadas[2], FUSARIOSIS).estado).toBe('calculado');
  });

  it('cierra Fusariosis al alcanzar 530 y no reinicia el acumulador al dia siguiente', async () => {
    const ultima = ultimaConAcumulados();
    const anterior = enfermedad(ultima, FUSARIOSIS);
    anterior.variables = { formulaVersion: 3, GDAcum: 515, PMoj: 2, GDN: 3 };
    const { service, creadas } = crearServicio(
      [dia('2026-07-10'), dia('2026-07-11'), dia('2026-07-12')],
      ultima,
    );

    await service.hacerPredicciones(siembra);

    expect(creadas).toHaveLength(2);
    expect(enfermedad(creadas[0], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 530,
    });
    expect(enfermedad(creadas[1], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 545,
    });
    for (const prediccion of creadas) {
      const item = enfermedad(prediccion, FUSARIOSIS);
      expect(item.estado).toBe('fuera_ventana');
      expect(item.resultado).toBe(0);
      expect(esPrediccionSanitariaAlertable(item)).toBe(false);
    }
  });

  it('no duplica dias ni aportes al ejecutar nuevamente sobre la ultima lectura persistida', async () => {
    const ultima = ultimaConAcumulados();
    const { service, creadas, repository } = crearServicio(
      [dia('2026-07-10'), dia('2026-07-11'), dia('2026-07-12')],
      ultima,
    );
    repository.get.mockImplementation(async () => ({
      datos: [creadas[creadas.length - 1] || ultima],
    }));

    const primera = await service.hacerPredicciones(siembra);
    const snapshot = JSON.stringify(creadas);
    const segunda = await service.hacerPredicciones(siembra);

    expect(primera).toHaveLength(2);
    expect(segunda).toEqual([]);
    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(creadas)).toBe(snapshot);
    expect(enfermedad(creadas[1], ROYA).variables).toMatchObject({
      GD: 106,
      DHR: 20,
    });
    expect(enfermedad(creadas[1], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 130,
      PMoj: 4,
      GDN: 9,
    });
  });

  it('no evade la reconstruccion al pasar de sin_datos historico a fuera de ventana y reingresar', async () => {
    const ultima = ultimaConAcumulados();
    ultima.enfermedades.forEach((item) => {
      item.estado = 'sin_datos';
      item.resultado = 0;
      item.variables = { formulaVersion: 3 };
    });
    const fuera = dia('2026-07-11');
    fuera.stage = 'Madurez Fisiologica';
    const { service, creadas } = crearServicio(
      [dia('2026-07-10'), fuera, dia('2026-07-12')],
      ultima,
    );

    await service.hacerPredicciones(siembra);

    expect(creadas).toHaveLength(2);
    for (const id of [ROYA, FUSARIOSIS]) {
      const suspendida = enfermedad(creadas[0], id);
      expect(suspendida.estado).toBe('fuera_ventana');
      expect(suspendida.variables).toMatchObject({ acumulacionIncompleta: 1 });
      const retomada = enfermedad(creadas[1], id);
      expectNoCalculada(retomada);
      expect(retomada.variables).toMatchObject({ acumulacionIncompleta: 1 });
      for (const name of ['GD', 'DHR', 'GDAcum', 'PMoj', 'GDN']) {
        expect(retomada.variables).not.toHaveProperty(name);
      }
      expect(retomada.calidadDatos?.limitaciones?.join(' ')).toMatch(
        /reconstr|reproces|recalcul/i,
      );
    }
  });

  it('no pierde el hueco temporal cuando la primera fecha recuperada esta fuera de ventana', async () => {
    const fuera = dia('2026-07-12');
    fuera.stage = 'Madurez Fisiologica';
    const { service, creadas } = crearServicio([
      dia('2026-07-10'),
      fuera,
      dia('2026-07-13'),
    ]);

    await service.hacerPredicciones(siembra);

    expect(creadas.map((item) => item.fecha)).toEqual([
      '2026-07-12T03:00:00.000Z',
      '2026-07-13T03:00:00.000Z',
    ]);
    expect(enfermedad(creadas[0], ROYA).variables).toMatchObject({
      GD: 100,
      DHR: 20,
      acumulacionIncompleta: 1,
    });
    expect(enfermedad(creadas[0], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 100,
      PMoj: 2,
      GDN: 3,
      acumulacionIncompleta: 1,
    });
    expect(enfermedad(creadas[1], ROYA).variables).toMatchObject({
      GD: 103,
      DHR: 20,
      acumulacionIncompleta: 1,
    });
    expect(enfermedad(creadas[1], FUSARIOSIS).variables).toMatchObject({
      GDAcum: 115,
      PMoj: 3,
      GDN: 6,
      acumulacionIncompleta: 1,
    });
    for (const id of [ROYA, FUSARIOSIS]) {
      const retomada = enfermedad(creadas[1], id);
      expect(retomada.estado).toBe('calculado');
      expect(retomada.calidadDatos?.nivel).toBe('baja');
      expect(retomada.calidadDatos?.fallback).toBe(true);
      expect(esPrediccionSanitariaAlertable(retomada)).toBe(false);
    }
  });

  it.each([-1, 24.1, 25, 1000])(
    'rechaza %s horas de mojado fuera del dominio diario',
    async (hours) => {
      const actual = dia('2026-07-11');
      actual.metrics.leafWetnessHours = hours;
      actual.metrics.maxContinuousLeafWetnessHours = hours;
      const { service, creadas } = crearServicio([actual]);

      await service.hacerPredicciones(siembra);

      expectNoCalculada(enfermedad(creadas[0], ESCALDADURA));
      expectNoCalculada(enfermedad(creadas[0], MANCHA_RED));
    },
  );

  it('acepta el limite valido de 24 horas sin recortar ni descartar el resultado', async () => {
    const actual = dia('2026-07-11');
    actual.metrics.leafWetnessHours = 24;
    actual.metrics.maxContinuousLeafWetnessHours = 24;
    actual.weather.precipitationMm = 5;
    const { service, creadas } = crearServicio([actual]);

    await service.hacerPredicciones(siembra);

    const escaldadura = enfermedad(creadas[0], ESCALDADURA);
    expect(escaldadura.estado).toBe('calculado');
    expect(escaldadura.resultado).toBe(100);
    expect(escaldadura.variables).toMatchObject({ horasMojado: 24, fHMF: 1 });
  });

  it('acepta una temperatura media real de cero sin declararla ausente', async () => {
    const actual = dia('2026-07-11');
    actual.weather.temperatureMeanC = 0;
    actual.weather.temperatureMinC = -1;
    actual.weather.temperatureMaxC = 1;
    actual.weather.precipitationMm = 0;
    actual.metrics.leafWetnessHours = 0;
    actual.metrics.maxContinuousLeafWetnessHours = 0;
    actual.metrics.meanTemperatureDuringLeafWetnessC = undefined;
    const { service, creadas } = crearServicio([dia('2026-07-10'), actual]);

    await service.hacerPredicciones(siembra);

    const escaldadura = enfermedad(creadas[0], ESCALDADURA);
    expect(escaldadura.estado).toBe('calculado');
    expect(escaldadura.resultado).toBe(0);
    expect(escaldadura.variables).toMatchObject({ fTemp: 0 });
    const roya = enfermedad(creadas[0], ROYA);
    expect(roya.estado).toBe('calculado');
    expect(roya.variables).toMatchObject({ GD: 100, DHR: 21 });
    expect(roya.variables).not.toHaveProperty('acumulacionIncompleta');
  });
});
