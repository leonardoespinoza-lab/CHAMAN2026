import { CONFIGURACION_FRIO_CULTIVOS } from 'modelos/src';
import { ClimaService } from './service';

describe('requisitos varietales de frio', () => {
  const crearServicio = (): any => Object.create(ClimaService.prototype) as any;

  it('conserva requisitos finitos atipicos de Pecan y advierte su calidad', () => {
    const service = crearServicio();
    const resultado = service.validarRequerimientosFrio(
      'Pecán',
      {
        horasFrioObjetivo: 1950,
        horasFrioEfectivasObjetivo: 1650,
        porcionesFrioObjetivo: 95,
      },
      CONFIGURACION_FRIO_CULTIVOS.Pecan,
    );

    expect(resultado.requerimientos).toMatchObject({
      horasFrioObjetivo: 1950,
      horasFrioEfectivasObjetivo: 1650,
      porcionesFrioObjetivo: 95,
    });
    expect(resultado.observaciones).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'HF objetivo 1950 fuera del rango tipico de control',
        ),
        expect.stringContaining(
          'HFE objetivo 1650 fuera del rango tipico de control',
        ),
        expect.stringContaining(
          'CP objetivo 95 fuera del rango tipico de control',
        ),
      ]),
    );
    expect(resultado.observaciones.join(' ')).toContain(
      'se conserva el valor varietal',
    );
    expect(resultado.observaciones.join(' ')).not.toContain('se uso base');
  });

  it('usa fallback solo para requisitos ausentes, no finitos o imposibles', () => {
    const service = crearServicio();
    const resultado = service.validarRequerimientosFrio(
      'Manzano',
      {
        horasFrioObjetivo: Number.NaN,
        horasFrioEfectivasObjetivo: 0,
        porcionesFrioObjetivo: undefined,
      },
      CONFIGURACION_FRIO_CULTIVOS.Manzano,
    );

    expect(resultado.requerimientos).toMatchObject({
      horasFrioObjetivo: CONFIGURACION_FRIO_CULTIVOS.Manzano.horasFrioObjetivo,
      horasFrioEfectivasObjetivo:
        CONFIGURACION_FRIO_CULTIVOS.Manzano.horasFrioEfectivasObjetivo,
      porcionesFrioObjetivo:
        CONFIGURACION_FRIO_CULTIVOS.Manzano.porcionesFrioObjetivo,
    });
    expect(resultado.observaciones).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HF objetivo no finito'),
        expect.stringContaining('HFE objetivo imposible (0)'),
        expect.stringContaining('CP objetivo ausente'),
      ]),
    );
  });

  it('resuelve la configuracion perenne sin depender de mayusculas o tildes', () => {
    const service = crearServicio();

    expect(service.getConfiguracionFrioCultivo('pecán')).toBe(
      CONFIGURACION_FRIO_CULTIVOS.Pecan,
    );
    expect(service.getConfiguracionFrioCultivo('MANZANO')).toBe(
      CONFIGURACION_FRIO_CULTIVOS.Manzano,
    );
  });

  it('no transforma valores vacios de temperatura en cero observado', () => {
    const service = crearServicio();

    expect(service.numeroFinito(null)).toBeUndefined();
    expect(service.numeroFinito(undefined)).toBeUndefined();
    expect(service.numeroFinito('')).toBeUndefined();
    expect(service.numeroFinito('   ')).toBeUndefined();
    expect(service.numeroFinito(false)).toBeUndefined();
    expect(service.numeroFinito('0')).toBe(0);
    expect(service.numeroFinito('-3.5')).toBe(-3.5);
  });

  it('no convierte ausencia horaria en HF, HFE ni Chill Portions cero', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    const service = crearServicio();
    service.FRIO_TERMICO_CACHE_TTL_MS = 15 * 60 * 1000;
    service.FRIO_TERMICO_CACHE_MAX = 500;
    service.frioTermicoCache = new Map();
    service.logger = {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    };
    service.fetchHistoricoClimaticoAutomatico = jest.fn().mockResolvedValue([
      {
        fecha: '2026-07-15',
        fuente: 'OpenMeteo',
        temperaturaMin: 2,
        temperaturaMax: 8,
        temperaturaMedia: 5,
        lluvia: 0,
        esPronostico: false,
      },
    ]);
    service.fetchOpenMeteoForecast = jest.fn().mockResolvedValue([]);
    service.fetchOpenMeteoHourlyArchive = jest
      .fn()
      .mockRejectedValue(new Error('serie horaria no disponible'));

    try {
      const resultado = await service.getFrioTermico(-39.03, -67.58, 'Pecan');

      expect(resultado.serie[0].horasFrio).toBeUndefined();
      expect(resultado.serie[0].horasFrioEfectivas).toBeUndefined();
      expect(resultado.serie[0].porcionesFrio).toBeUndefined();
      expect(resultado.acumulados.horasFrio).toBeUndefined();
      expect(resultado.acumulados.horasFrioEfectivas).toBeUndefined();
      expect(resultado.acumulados.porcionesFrio).toBeUndefined();
      expect(resultado.calculo?.porcionesFrio).toBe('no_disponible');
      expect(resultado.calculo?.observaciones).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'las horas ausentes no se convierten en cero',
          ),
        ]),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('limita Standard a 92 dias de Forecast pago sin inventar el tramo anterior', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T15:00:00.000Z'));
    const service = crearServicio();
    service.logger = { warn: jest.fn() };
    service.fetchOpenMeteoJson = jest.fn().mockResolvedValue({
      hourly: { time: [], temperature_2m: [] },
    });

    try {
      await service.fetchOpenMeteoHourlyArchive(
        -39.03,
        -67.58,
        '2026-05-01',
        '2026-08-09',
      );

      expect(service.fetchOpenMeteoJson).toHaveBeenCalledTimes(1);
      expect(service.fetchOpenMeteoJson).toHaveBeenCalledWith(
        expect.not.stringContaining('archive'),
        'forecast',
        expect.objectContaining({
          start_date: '2026-05-11',
          end_date: '2026-08-09',
          hourly: 'temperature_2m',
        }),
        expect.stringContaining('reciente'),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('solicita cinco dias pasados al Forecast horario', async () => {
    const service = crearServicio();
    service.fetchOpenMeteoJson = jest.fn().mockResolvedValue({
      hourly: { time: [], temperature_2m: [] },
    });

    await service.fetchOpenMeteoHourlyForecast(-39.03, -67.58);

    expect(service.fetchOpenMeteoJson).toHaveBeenCalledWith(
      expect.any(String),
      'forecast',
      expect.objectContaining({
        past_days: 5,
        forecast_days: 16,
        hourly: 'temperature_2m',
      }),
      expect.stringContaining('pronostico horario'),
    );
  });

  it('no permite que Forecast reemplace una lectura historica de mayor jerarquia', () => {
    const service = crearServicio();
    const diario = service.mergeSeries(
      [
        {
          fecha: '2026-08-05',
          fuente: 'FieldClimate',
          temperaturaMedia: 4,
          esPronostico: false,
        },
      ],
      [
        {
          fecha: '2026-08-05',
          fuente: 'OpenMeteo',
          temperaturaMedia: 10,
          esPronostico: true,
        },
      ],
    );
    const horario = service.mergeHourlySeries(
      [
        {
          time: '2026-08-05T06:00',
          temperatura: 3,
          esPronostico: false,
        },
      ],
      [
        {
          time: '2026-08-05T06:00',
          temperatura: 11,
          esPronostico: true,
        },
      ],
    );

    expect(diario[0]).toMatchObject({
      fuente: 'FieldClimate',
      temperaturaMedia: 4,
      esPronostico: false,
    });
    expect(horario[0]).toMatchObject({
      temperatura: 3,
      esPronostico: false,
    });
  });

  it('deja faltante un dia reciente sin hourly y no subestima CP con un cero', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-03T15:00:00.000Z'));
    const service = crearServicio();
    service.FRIO_TERMICO_CACHE_TTL_MS = 15 * 60 * 1000;
    service.FRIO_TERMICO_CACHE_MAX = 500;
    service.frioTermicoCache = new Map();
    service.logger = {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    };
    service.fetchHistoricoClimaticoAutomatico = jest.fn().mockResolvedValue([
      {
        fecha: '2026-05-01',
        fuente: 'FieldClimate',
        temperaturaMin: 2,
        temperaturaMax: 8,
        temperaturaMedia: 5,
        lluvia: 0,
        esPronostico: false,
      },
      {
        fecha: '2026-05-02',
        fuente: 'OpenMeteo',
        temperaturaMin: 3,
        temperaturaMax: 9,
        temperaturaMedia: 6,
        lluvia: 0,
        esPronostico: false,
      },
    ]);
    service.fetchOpenMeteoForecast = jest.fn().mockResolvedValue([]);
    service.fetchHistoricoHorarioAutomatico = jest.fn().mockResolvedValue(
      Array.from({ length: 24 }, (_, hour) => ({
        time: `2026-05-01T${String(hour).padStart(2, '0')}:00`,
        temperatura: 5,
        esPronostico: false,
      })),
    );
    service.fetchOpenMeteoHourlyForecast = jest.fn().mockResolvedValue([]);

    try {
      const resultado = await service.getFrioTermico(-39.03, -67.58, 'Pecan');
      const recienteSinHoras = resultado.serie.find(
        (dia) => dia.fecha === '2026-05-02',
      );

      expect(recienteSinHoras).toMatchObject({ fecha: '2026-05-02' });
      expect(recienteSinHoras?.horasFrio).toBeUndefined();
      expect(recienteSinHoras?.horasFrioEfectivas).toBeUndefined();
      expect(recienteSinHoras?.porcionesFrio).toBeUndefined();
      expect(resultado.acumulados.horasFrio).toBeUndefined();
      expect(resultado.acumulados.horasFrioEfectivas).toBeUndefined();
      expect(resultado.acumulados.porcionesFrio).toBeUndefined();
      expect(resultado.calculo?.porcionesFrio).toBe('no_disponible');
      expect(resultado.calculo?.observaciones?.join(' ')).toContain(
        'no se suman como cero',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('no permite que HFE legacy habilite por si solo una salida de dormancia', () => {
    const service = crearServicio();
    const eventos = service.getEventosFrioTermico(
      {
        horasFrioPct: 40,
        horasFrioEfectivasPct: 150,
        porcionesFrioPct: 35,
        brotacionPct: 120,
        floracionPct: 110,
      },
      { nivel: 'bajo', dias: 0 },
      {
        horasFrio: 200,
        horasFrioEfectivas: 900,
        porcionesFrio: 12,
        gradosDia: 500,
        lluvia: 0,
      },
      {
        horasFrioObjetivo: 500,
        horasFrioEfectivasObjetivo: 400,
        porcionesFrioObjetivo: 35,
        temperaturaBaseGradosDia: 7,
        gradosDiaBrotacionObjetivo: 100,
        gradosDiaFloracionObjetivo: 300,
      },
      false,
    );

    expect(eventos.brotacion.estado).toBe('esperando_frio');
    expect(eventos.floracion.estado).toBe('pendiente');
  });

  it('usa HF como modelo rector cuando CP no esta disponible', () => {
    const service = crearServicio();
    const eventos = service.getEventosFrioTermico(
      {
        horasFrioPct: 105,
        horasFrioEfectivasPct: 20,
        porcionesFrioPct: 0,
        brotacionPct: 110,
        floracionPct: 50,
      },
      { nivel: 'bajo', dias: 0 },
      {
        horasFrio: 525,
        horasFrioEfectivas: 80,
        porcionesFrio: undefined,
        gradosDia: 110,
        lluvia: 0,
      },
      {
        horasFrioObjetivo: 500,
        horasFrioEfectivasObjetivo: 400,
        porcionesFrioObjetivo: 35,
        temperaturaBaseGradosDia: 7,
        gradosDiaBrotacionObjetivo: 100,
        gradosDiaFloracionObjetivo: 300,
      },
      false,
    );

    expect(eventos.brotacion.estado).toBe('probable');
    expect(eventos.brotacion.lectura).toContain('horas de frio');
    expect(eventos.floracion.estado).toBe('pendiente');
  });

  it('una compatibilidad frio-calor queda como probable hasta confirmacion de campo', () => {
    const service = crearServicio();
    const eventos = service.getEventosFrioTermico(
      {
        horasFrioPct: 120,
        horasFrioEfectivasPct: 120,
        porcionesFrioPct: 105,
        brotacionPct: 130,
        floracionPct: 110,
      },
      { nivel: 'bajo', dias: 0 },
      {
        horasFrio: 600,
        horasFrioEfectivas: 500,
        porcionesFrio: 38,
        gradosDia: 500,
        lluvia: 0,
      },
      {
        horasFrioObjetivo: 500,
        horasFrioEfectivasObjetivo: 400,
        porcionesFrioObjetivo: 35,
        temperaturaBaseGradosDia: 7,
        gradosDiaBrotacionObjetivo: 100,
        gradosDiaFloracionObjetivo: 300,
      },
      false,
    );

    expect(eventos.brotacion.estado).toBe('probable');
    expect(eventos.brotacion.lectura).toContain('confirmar');
    expect(eventos.floracion.estado).toBe('probable');
    expect(eventos.floracion.lectura).toContain('no se declara alcanzada');
  });
});
