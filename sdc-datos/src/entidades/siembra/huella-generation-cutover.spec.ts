import { AGROMET_ENGINE_VERSION } from 'modelos/src';
import { SiembrasService } from './service';

describe('Huella hidrica: continuidad de lluvia y ET0 durante cutover', () => {
  function setup(generations: Record<string, any[]>) {
    const indicators = {
      getActiveGeneration: jest.fn(async (_id, version) => ({
        generationId: generations[version] ? version : undefined,
        data: generations[version] || [],
      })),
    };
    const service = new SiembrasService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      indicators as any,
      {} as any,
      {} as any,
    );
    return {
      indicators,
      read: (desde = '2026-07-01', hasta = '2026-07-02') =>
        (service as any).getClimaCanonicoHuella('s1', desde, hasta),
    };
  }
  const row = {
    fecha: '2026-07-01',
    esPronostico: false,
    fuente: 'open_meteo',
    metricas: { precipitationMm: 2, et0Mm: 4, gddAccumulated: 120 },
  };

  it('lee las mismas entradas historicas de la version anterior sin utilizar GDD ni fenologia', async () => {
    const c = setup({
      'agromet-1.5.0': [
        row,
        { ...row, fecha: '2026-07-02', esPronostico: true },
      ],
    });
    expect(await c.read()).toEqual({
      clima: [{ fecha: '2026-07-01', lluviaMm: 2, et0Mm: 4 }],
      fuentes: ['open_meteo'],
    });
    expect(
      c.indicators.getActiveGeneration.mock.calls.map((call) => call[1]),
    ).toEqual([AGROMET_ENGINE_VERSION, 'agromet-1.5.0']);
  });
  it('elige solo la actual aunque haya mas fechas en la anterior', async () => {
    const c = setup({
      [AGROMET_ENGINE_VERSION]: [row],
      'agromet-1.5.0': [row, { ...row, fecha: '2026-07-02' }],
    });
    expect((await c.read()).clima).toHaveLength(1);
    expect(c.indicators.getActiveGeneration).toHaveBeenCalledTimes(1);
  });
  it('respeta el intervalo sin rellenarlo con versiones viejas', async () => {
    const c = setup({
      [AGROMET_ENGINE_VERSION]: [row],
      'agromet-1.5.0': [{ ...row, fecha: '2026-07-02' }],
    });
    expect(await c.read('2026-07-02')).toEqual({ clima: [], fuentes: [] });
    expect(c.indicators.getActiveGeneration).toHaveBeenCalledTimes(1);
  });
  it('conserva el estado sin datos ante falla del repositorio, sin datos inventados', async () => {
    const c = setup({});
    c.indicators.getActiveGeneration.mockRejectedValue(
      new Error('unavailable'),
    );
    expect(await c.read()).toEqual({ clima: [], fuentes: [] });
  });
});
