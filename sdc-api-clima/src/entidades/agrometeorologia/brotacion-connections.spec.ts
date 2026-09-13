import {
  CULTIVOS_PERENNES,
  obtenerInicioForzadoObservado,
  fechaEfectivaRegistroFenologico,
  revisionFenologica,
  obtenerRegistroFenologicoDecisorioEnFecha,
} from 'modelos/src';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';

describe('Brotacion perenne: conexion de campo y acumulacion', () => {
  const now = new Date('2026-09-13T18:00:00Z');
  const brota = {
    id: 'brota',
    etapa: 'Brotación',
    tipoEvento: 'inicio_etapa',
    fechaInicioEtapa: '2026-09-09T15:00:00Z',
    confianza: 'media',
    coberturaObservadaPct: 100,
  };
  const sow = (records: any[] = [brota], cultivo = 'Peral'): any => ({
    _id: 's1',
    idLote: 'l1',
    idEstablecimiento: 'e1',
    fechaSiembra: '2020-01-01',
    semilla: {
      cultivo,
      parametrosAgrometeorologicos: {
        version: 'fixture',
        temperaturaBaseC: 4,
        temperaturaSuperiorC: 30,
      },
    },
    registrosFenologicos: records,
  });
  const start = (s: any) => {
    const r = obtenerInicioForzadoObservado(s, now);
    return r && fechaEfectivaRegistroFenologico(r)?.slice(0, 10);
  };
  it.each([...CULTIVOS_PERENNES])(
    'habilita %s desde inicio de brotacion',
    (cultivo) => {
      expect(start(sow([brota], cultivo))).toBe('2026-09-09');
    },
  );
  it.each([
    { etapa: 'Yema hinchada' },
    { tipoEvento: 'observacion' },
    { confianza: 'baja' },
    { coberturaObservadaPct: 0 },
    { idSiembra: 'otra' },
    { idLote: 'otro' },
    { cultivo: 'Manzano' },
    { campania: '2025/2026' },
    { fechaInicioEtapa: '2025-09-09' },
    { fechaInicioEtapa: '2026-09-14' },
    { fechaInicioEtapa: 'invalida' },
    { fechaInicioEtapa: '2019-09-01' },
  ])('no inicia con registro no decisorio %j', (override) =>
    expect(start(sow([{ ...brota, ...override }]))).toBeUndefined(),
  );
  it('no reinicia por nuevas etapas o por una segunda brotacion sin correccion', () => {
    expect(
      start(
        sow([
          brota,
          {
            ...brota,
            id: 'flor',
            etapa: 'Floracion',
            fechaInicioEtapa: '2026-09-10',
          },
          { ...brota, id: 'segunda', fechaInicioEtapa: '2026-09-11' },
        ]),
      ),
    ).toBe('2026-09-09');
  });
  it('la correccion sustituye el ancla sin borrar el original', () => {
    const s = sow([
      brota,
      {
        ...brota,
        id: 'corregido',
        reemplazaRegistroId: 'brota',
        fechaInicioEtapa: '2026-09-08',
      },
    ]);
    expect(start(s)).toBe('2026-09-08');
    expect(s.registrosFenologicos).toHaveLength(2);
  });
  it('conserva un reinicio explicito autorizado y no inicia con biofix solo de anclaje', () => {
    expect(start(sow([{ ...brota, tipoEvento: 'biofix' }]))).toBeUndefined();
    expect(
      start(
        sow([
          brota,
          {
            ...brota,
            id: 'reset',
            tipoEvento: 'biofix',
            objetivosBiofix: ['reinicio_gdd_forzado'],
            fechaInicioEtapa: '2026-09-11',
          },
        ]),
      ),
    ).toBe('2026-09-11');
  });
  it('no modifica el ultimo estadio aunque contradiga una etapa anterior', () => {
    const s = sow([
      brota,
      {
        ...brota,
        id: 'yema',
        etapa: 'Yema hinchada',
        fechaInicioEtapa: '2026-09-10',
      },
    ]);
    expect(start(s)).toBe('2026-09-09');
    expect(obtenerRegistroFenologicoDecisorioEnFecha(s, now)?.etapa).toBe(
      'Yema hinchada',
    );
  });
  it('cambia revision con correcciones pero no incluye datos personales', () => {
    expect(revisionFenologica(sow([brota]))).not.toBe(
      revisionFenologica(sow([{ ...brota, fechaInicioEtapa: '2026-09-10' }])),
    );
    expect(
      revisionFenologica(
        sow([
          { ...brota, observador: 'PRIVADO', observaciones: 'NOTA PRIVADA' },
        ]),
      ),
    ).not.toContain('PRIVAD');
  });
  it('el motor acumula desde brotacion sin reiniciar en floracion y conserva el frio', () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const engine = new AgrometeorologicalEngineService({} as any, {} as any);
      const s = sow([
        brota,
        {
          ...brota,
          id: 'flor',
          etapa: 'Floracion',
          fechaInicioEtapa: '2026-09-11',
        },
      ]);
      const observations = [8, 9, 10, 11, 12].map((d) => ({
        idEstablecimiento: 'e1',
        fechaLocal: `2026-09-${String(d).padStart(2, '0')}`,
        timestamp: `2026-09-${String(d).padStart(2, '0')}T15:00:00Z`,
        timezone: 'America/Argentina/Buenos_Aires',
        granularidad: 'daily',
        estado: 'estimated',
        esPronostico: false,
        fuente: 'open_meteo',
        completitudPct: 100,
        banderasCalidad: [],
        valores: {
          temperatureMinC: 10,
          temperatureMeanC: 14,
          temperatureMaxC: 18,
          precipitationMm: 0,
        },
        fuentePorVariable: {
          temperatureMinC: 'open_meteo',
          temperatureMeanC: 'open_meteo',
          temperatureMaxC: 'open_meteo',
        },
      }));
      const result = engine.calculateIndicators(
        s,
        { _id: 'l1', idEstablecimiento: 'e1' } as any,
        { lat: -39, lng: -67 },
        observations as any,
      );
      expect(result.map((r) => r.metricas.gddAccumulated)).toEqual([
        undefined,
        10,
        20,
        30,
        40,
      ]);
      const old = engine.calculateIndicators(
        { ...s, registrosFenologicos: [] },
        { _id: 'l1', idEstablecimiento: 'e1' } as any,
        { lat: -39, lng: -67 },
        observations as any,
      );
      expect(result.map((r) => r.metricas.chillingHoursAccumulated)).toEqual(
        old.map((r) => r.metricas.chillingHoursAccumulated),
      );
      expect(
        (engine as any).resolveThermalStart(
          { ...s, semilla: { cultivo: 'Trigo' }, fechaSiembra: '2026-05-01' },
          '2026-09-13',
        ),
      ).toBe('2026-05-01');
    } finally {
      jest.useRealTimers();
    }
  });
});
