import { campaniaRiegoVigente } from 'modelos/src';
import { demandaRiegoCanonica } from './riego-demanda-canonica';
import { calcularRiegoV13Estimado } from './riego-v13-fallback.engine';
import { SiembrasService } from '../siembra/service';

describe('Demanda canonica y temporada de riego', () => {
  const sow: any = {
    _id: 's1',
    idLote: 'l1',
    fechaSiembra: '2020-01-01',
    semilla: { cultivo: 'Peral' },
    registrosFenologicos: [
      {
        id: 'r1',
        idSiembra: 's1',
        idLote: 'l1',
        cultivo: 'Peral',
        tipoEvento: 'inicio_etapa',
        etapa: 'Brotacion',
        fechaInicioEtapa: '2026-09-09',
        confianza: 'alta',
        actualizadoEn: '2026-09-13T10:00:00Z',
      },
    ],
  };
  const forecast: any[] = [{ fecha: '2026-09-13', et0: 99, lluvia: 0 }];
  const canonical = (): any => ({
    dataSource: { lastCalculatedAt: '2026-09-13T10:01:00Z' },
    series: [
      {
        date: '2026-09-13',
        stageSource: 'campo',
        metrics: { kc: 0.75, et0Mm: 4, etcMm: 3 },
      },
    ],
  });
  it('toma la ETc ya calculada y no vuelve a la edad de plantacion ni a otro ET0', () => {
    const demanda = demandaRiegoCanonica(sow, forecast, canonical());
    expect(demanda).toEqual([
      { fecha: '2026-09-13', kc: 0.75, et0: 4, consumoAgua: 3 },
    ]);
    const resultado = calcularRiegoV13Estimado({
      siembra: sow,
      lote: {} as any,
      cultivo: 'Peral',
      crono: undefined as any,
      pronostico7Dias: forecast,
      lluviaHistorica: [],
      demandaCanonica: demanda,
    });
    expect(resultado.pronosticosRiego[0].consumoAgua).toBe(3);
    expect(resultado.et0Promedio).toBe(4);
    expect(resultado.estadoCalculoAguaUtil).toBe('no_disponible');
  });
  it.each([undefined, null, NaN, -1, '3'])(
    'no reemplaza ETc invalida %p por cero ni por Kc de calendario',
    (etc) => {
      const c = canonical();
      c.series[0].metrics.etcMm = etc;
      expect(() => demandaRiegoCanonica(sow, forecast, c)).toThrow(
        'no disponible',
      );
    },
  );
  it('acepta cero real y bloquea huecos, duplicados, registros nuevos y etapa perenne de calendario', () => {
    const c = canonical();
    c.series[0].metrics.etcMm = 0;
    expect(demandaRiegoCanonica(sow, forecast, c)[0].consumoAgua).toBe(0);
    expect(() =>
      demandaRiegoCanonica(sow, [...forecast, { fecha: '2026-09-14' }], c),
    ).toThrow();
    expect(() =>
      demandaRiegoCanonica(sow, forecast, {
        ...c,
        series: [...c.series, ...c.series],
      }),
    ).toThrow();
    c.dataSource.lastCalculatedAt = '2026-09-13T09:00:00Z';
    expect(() => demandaRiegoCanonica(sow, forecast, c)).toThrow();
    const ref = canonical();
    ref.series[0].stageSource = 'cronograma_referencia';
    expect(() => demandaRiegoCanonica(sow, forecast, ref)).toThrow();
  });
  it.each(['Manzano', 'Peral', 'Vid', 'Pecan'])(
    'mantiene %s antiguo activo solo con inicio valido de la temporada',
    (cultivo) => {
      const s = {
        ...sow,
        semilla: { cultivo },
        registrosFenologicos: sow.registrosFenologicos.map((r: any) => ({
          ...r,
          cultivo,
        })),
      };
      const now = new Date('2026-09-13T12:00:00Z');
      expect(campaniaRiegoVigente(s as any, now)).toBe(true);
      expect(
        campaniaRiegoVigente({ ...s, registrosFenologicos: [] } as any, now),
      ).toBe(false);
      expect(
        campaniaRiegoVigente({ ...s, fechaCosecha: '2026-09-12' } as any, now),
      ).toBe(false);
      expect(campaniaRiegoVigente({ ...s, activa: false } as any, now)).toBe(
        false,
      );
    },
  );
  it('no amplifica la vigencia de los anuales', () => {
    expect(
      campaniaRiegoVigente(
        { ...sow, semilla: { cultivo: 'Trigo' } },
        new Date('2026-09-13'),
      ),
    ).toBe(false);
  });
  it('incluye perennes antiguos al buscar las siembras del ciclo diario de riego', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-13T12:00:00Z'));
    const repository = {
      get: jest
        .fn()
        .mockResolvedValue({
          datos: [sow, { ...sow, registrosFenologicos: [] }],
        }),
    };
    const result = await new SiembrasService(
      repository as any,
    ).listarSiembrasParaPredicciones();
    expect(result).toEqual([sow]);
    expect(repository.get.mock.calls[0][0]).toMatchObject({
      populate: 'semilla',
      limit: 0,
    });
    jest.useRealTimers();
  });
});
