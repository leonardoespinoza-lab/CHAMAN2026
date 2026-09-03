jest.mock(
  'src/entidades/fumigacion/service',
  () => ({ FumigacionsService: class FumigacionsService {} }),
  { virtual: true },
);

import { PrediccionsService } from './service';
import { CEBADA_MANCHA_RED_UMBRAL_ALERTA } from 'modelos/src';

describe('PrediccionsService - alertas sanitarias', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const siembra = {
    _id: 'siembra-1',
    idProductor: 'productor-1',
    idEstablecimiento: 'establecimiento-1',
    semilla: { cultivo: 'Trigo' },
    lote: { nombre: 'Lote Norte' },
  } as any;

  const enfermedad = (
    resultado: number,
    overrides: Record<string, unknown> = {},
  ) =>
    ({
      enfermedad: 'Roya de la Hoja',
      idEnfermedad: 'trigo.roya_hoja',
      resultado,
      estado: 'calculado',
      calidadDatos: { nivel: 'media' },
      resistenciaUsada: {
        estado: 'observada',
        confianza: 'alta',
        campaniaFuente: '2025-2026',
      },
      modelo: {
        id: 'trigo.roya_hoja',
        version: 5,
        fuente: 'formula funcional auditada',
        validacion: 'operativo',
      },
      variables: { resultadoCrudo: resultado },
      ...overrides,
    }) as any;

  const crearServicio = () => {
    const alertas = {
      registrarEventoSiembra: jest.fn().mockResolvedValue(undefined),
      finalizarEventoSiembra: jest.fn().mockResolvedValue(false),
    };
    const service = new PrediccionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      alertas as any,
      {} as any,
    );
    return { service, alertas };
  };

  it('procesa todas las tandas aunque una siembra falle y reporta el resultado incompleto', async () => {
    const ids = Array.from({ length: 7 }, (_, indice) => `siembra-${indice + 1}`);
    const siembras = {
      listarSiembrasParaPrediccionesSanitarias: jest
        .fn()
        .mockResolvedValue(ids.map((_id) => ({ _id }))),
    };
    const service = new PrediccionsService(
      siembras as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const ejecutar = jest
      .spyOn(service, 'prediccion')
      .mockImplementation(async (id) => {
        if (id === 'siembra-2') throw new Error('sin clima');
        return [];
      });

    await expect(service.hacerPredicciones()).rejects.toThrow(
      'Fallaron 1 predicciones sanitarias: siembra-2',
    );
    expect(ejecutar).toHaveBeenCalledTimes(7);
  });

  it('finaliza la alerta si la ultima salida cronologica deja de ser alertable', async () => {
    const { service, alertas } = crearServicio();
    const predicciones = [
      {
        fecha: '2026-07-14T00:00:00.000Z',
        idSiembra: 'siembra-1',
        enfermedades: [enfermedad(45)],
      },
      {
        fecha: '2026-07-15T00:00:00.000Z',
        idSiembra: 'siembra-1',
        enfermedades: [enfermedad(10)],
      },
    ];

    await (service as any).enviarAlertas(predicciones, siembra);

    expect(alertas.registrarEventoSiembra).not.toHaveBeenCalled();
    expect(alertas.finalizarEventoSiembra).toHaveBeenCalledTimes(1);
    expect(alertas.finalizarEventoSiembra).toHaveBeenCalledWith(
      'siembra-1',
      'Predicción sanitaria: Roya de la Hoja',
      expect.stringContaining('No confirma ausencia'),
      'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
    );
  });

  it('muestra precaucion desde 35 pero solo alerta Mancha en Red v4 con evidencia horaria desde el umbral alto', async () => {
    const cebada = {
      ...siembra,
      semilla: { cultivo: 'Cebada' },
    } as any;
    const lecturaCebada = (resultado: number) =>
      enfermedad(resultado, {
        enfermedad: 'Mancha en Red',
        idEnfermedad: 'cebada.mancha_red',
        modelo: {
          id: 'cebada.mancha_red',
          version: 4,
          fuente: 'motor canonico',
          validacion: 'operativo',
        },
        variables: {
          formulaVersion: 4,
          coberturaVentana: 1,
          diasFavorablesVentana: 1,
        },
      });

    const bajo = crearServicio();
    await (bajo.service as any).enviarAlertas(
      [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          idSiembra: 'siembra-1',
          enfermedades: [lecturaCebada(20)],
        },
      ],
      cebada,
    );
    expect(bajo.alertas.registrarEventoSiembra).not.toHaveBeenCalled();
    expect(bajo.alertas.finalizarEventoSiembra).toHaveBeenCalledTimes(1);

    const medioSinAlerta = crearServicio();
    await (medioSinAlerta.service as any).enviarAlertas(
      [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          idSiembra: 'siembra-1',
          enfermedades: [lecturaCebada(35)],
        },
      ],
      cebada,
    );
    expect(
      medioSinAlerta.alertas.registrarEventoSiembra,
    ).not.toHaveBeenCalled();
    expect(
      medioSinAlerta.alertas.finalizarEventoSiembra,
    ).toHaveBeenCalledTimes(1);

    const alto = crearServicio();
    await (alto.service as any).enviarAlertas(
      [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          idSiembra: 'siembra-1',
          enfermedades: [lecturaCebada(CEBADA_MANCHA_RED_UMBRAL_ALERTA)],
        },
      ],
      cebada,
    );
    expect(alto.alertas.registrarEventoSiembra).toHaveBeenCalledTimes(1);
    expect(alto.alertas.finalizarEventoSiembra).not.toHaveBeenCalled();
  });

  it('registra solo la ultima salida con fecha, version y deduplicacion trazables', async () => {
    const { service, alertas } = crearServicio();
    const predicciones = [
      {
        fecha: '2026-07-15T00:00:00.000Z',
        idSiembra: 'siembra-1',
        enfermedades: [enfermedad(22)],
      },
      {
        fecha: '2026-07-13T00:00:00.000Z',
        idSiembra: 'siembra-1',
        enfermedades: [enfermedad(80)],
      },
    ];

    await (service as any).enviarAlertas(predicciones, siembra);

    expect(alertas.finalizarEventoSiembra).not.toHaveBeenCalled();
    expect(alertas.registrarEventoSiembra).toHaveBeenCalledTimes(1);
    expect(alertas.registrarEventoSiembra).toHaveBeenCalledWith(
      expect.objectContaining({
        fecha: '2026-07-15T00:00:00.000Z',
        versionMotor: 'v5',
        dedupeKey: 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
        eventKey: 'enfermedad:siembra-1:roya-de-la-hoja:v5:2026-07-15',
        lectura: expect.stringContaining(
          'predicción meteorológica de severidad/incidencia',
        ),
      }),
    );
    const evento = alertas.registrarEventoSiembra.mock.calls[0][0];
    expect(evento.lectura).toContain('No confirma enfermedad');
    expect(evento.reporte.resultado).toBe(22);
  });

  it.each([
    ['fuera de ventana', { estado: 'fuera_ventana' }],
    [
      'version anterior',
      {
        modelo: {
          id: 'trigo.roya_hoja',
          version: 3,
          fuente: 'anterior',
          validacion: 'operativo',
        },
      },
    ],
    [
      'modelo experimental',
      {
        modelo: {
          id: 'trigo.roya_hoja',
          version: 5,
          fuente: 'prueba',
          validacion: 'experimental',
        },
      },
    ],
  ])('no alerta y finaliza cuando hay %s', async (_caso, overrides) => {
    const { service, alertas } = crearServicio();

    await (service as any).enviarAlertas(
      [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          idSiembra: 'siembra-1',
          enfermedades: [enfermedad(40, overrides)],
        },
      ],
      siembra,
    );

    expect(alertas.registrarEventoSiembra).not.toHaveBeenCalled();
    expect(alertas.finalizarEventoSiembra).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sin datos', { estado: 'sin_datos' }],
    [
      'resistencia desconocida',
      { resistenciaUsada: { estado: 'desconocida' } },
    ],
    ['resultado fuera del dominio', { variables: { resultadoCrudo: 120 } }],
    ['calidad baja', { calidadDatos: { nivel: 'baja' } }],
  ])(
    'no alerta pero tampoco declara resuelto el episodio cuando hay %s',
    async (_caso, overrides) => {
      const { service, alertas } = crearServicio();

      await (service as any).enviarAlertas(
        [
          {
            fecha: '2026-07-15T00:00:00.000Z',
            idSiembra: 'siembra-1',
            enfermedades: [enfermedad(40, overrides)],
          },
        ],
        siembra,
      );

      expect(alertas.registrarEventoSiembra).not.toHaveBeenCalled();
      expect(alertas.finalizarEventoSiembra).not.toHaveBeenCalled();
    },
  );

  it('ignora un backfill historico para no crear ni cerrar alertas actuales', async () => {
    const { service, alertas } = crearServicio();

    await (service as any).enviarAlertas(
      [
        {
          fecha: '2026-06-01T00:00:00.000Z',
          idSiembra: 'siembra-1',
          enfermedades: [enfermedad(10)],
        },
      ],
      siembra,
    );

    expect(alertas.registrarEventoSiembra).not.toHaveBeenCalled();
    expect(alertas.finalizarEventoSiembra).not.toHaveBeenCalled();
  });
});
