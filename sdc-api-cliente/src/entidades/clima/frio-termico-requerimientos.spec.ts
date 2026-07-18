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

  it('no convierte HFE a Chill Portions si falta la serie horaria', async () => {
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

      expect(resultado.serie[0].horasFrioEfectivas).toBeGreaterThan(0);
      expect(resultado.serie[0].porcionesFrio).toBeUndefined();
      expect(resultado.acumulados.porcionesFrio).toBeUndefined();
      expect(resultado.calculo?.porcionesFrio).toBe('no_disponible');
      expect(resultado.calculo?.observaciones).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'no se aplico ninguna conversion aproximada desde HFE',
          ),
        ]),
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
