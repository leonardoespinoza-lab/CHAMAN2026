import { AGROMET_ENGINE_VERSION } from 'modelos/src';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';

describe('Lectura segura durante el cutover agromet 1.5.0 -> 1.5.1', () => {
  const previous = 'agromet-1.5.0';
  function row(version = previous, fecha = '2026-07-01') {
    return {
      idSiembra: 's1',
      idLote: 'l1',
      idEstablecimiento: 'e1',
      fecha,
      versionCalculo: version,
      versionParametros: 'test',
      metricas: { gddAccumulated: 120, et0Mm: 4 },
      fuente: 'open_meteo',
      fuentePorVariable: {},
      banderasCalidad: [],
      advertencias: [],
      completitudPct: 100,
      esPronostico: false,
      calculadoEn: '2026-07-01T18:00:00.000Z',
    };
  }
  function setup(generations: Record<string, any> = {}) {
    const repository = {
      getActiveIndicadoresGeneration: jest.fn(
        async (_id, version) => generations[version] || { data: [] },
      ),
      getIndicadores: jest.fn().mockResolvedValue({ datos: [] }),
      getObservaciones: jest.fn().mockResolvedValue({ datos: [] }),
      getSiembra: jest.fn().mockResolvedValue({
        _id: 's1',
        fechaSiembra: '2026-07-01',
        semilla: { cultivo: 'Trigo' },
      }),
    };
    return {
      repository,
      service: new AgrometeorologicalEngineService(
        repository as any,
        {} as any,
      ),
    };
  }

  it('conserva la generacion activa anterior y declara su version real sin recalcular', async () => {
    const c = setup({
      [previous]: { generationId: 'previous', data: [row()] },
    });
    const response = await c.service.getResponse('s1');
    expect(
      c.repository.getActiveIndicadoresGeneration.mock.calls.map(
        (call) => call[1],
      ),
    ).toEqual([AGROMET_ENGINE_VERSION, previous]);
    expect(response.series).toHaveLength(1);
    expect(response.calculationVersion).toBe(previous);
    expect(response.warnings.join(' ')).toContain(
      'ultima serie meteorologica estable',
    );
    expect(c.repository.getIndicadores).not.toHaveBeenCalled();
  });

  it('prefiere la actual sin completar huecos con filas anteriores', async () => {
    const c = setup({
      [AGROMET_ENGINE_VERSION]: {
        generationId: 'current',
        data: [row(AGROMET_ENGINE_VERSION)],
      },
      [previous]: {
        generationId: 'previous',
        data: [row(), row(previous, '2026-07-02')],
      },
    });
    const response = await c.service.getResponse('s1');
    expect(response.series).toHaveLength(1);
    expect(response.calculationVersion).toBe(AGROMET_ENGINE_VERSION);
    expect(c.repository.getActiveIndicadoresGeneration).toHaveBeenCalledTimes(
      1,
    );
  });

  it.each([previous, AGROMET_ENGINE_VERSION])(
    'no rescata un ciclo corregido desde %s',
    async (version) => {
      const c = setup({
        [version]: { generationId: 'old-cycle', data: [row(version)] },
      });
      c.repository.getSiembra.mockResolvedValue({
        _id: 's1',
        fechaSiembra: '2026-07-02',
        semilla: { cultivo: 'Trigo' },
      });
      const response = await c.service.getResponse('s1');
      expect(response.series).toEqual([]);
      expect(response.warnings.join(' ')).toContain('fecha agronomica cambio');
      expect(c.repository.getIndicadores).not.toHaveBeenCalled();
    },
  );

  it('excluye completa la generacion anterior por kill switch, no solo sus filas Chaman-Meteo', async () => {
    const c = setup({
      [previous]: {
        generationId: 'mixed',
        data: [
          row(),
          { ...row(previous, '2026-07-02'), fuente: 'chaman_meteo' },
        ],
      },
    });
    const response = await c.service.getResponse('s1');
    expect(response.series).toEqual([]);
    expect(response.warnings.join(' ')).toContain('kill switch');
  });

  it('ignora filas preparatorias sin generacion activa', async () => {
    const c = setup({
      [AGROMET_ENGINE_VERSION]: { data: [row(AGROMET_ENGINE_VERSION)] },
      [previous]: { generationId: 'stable', data: [row()] },
    });
    expect((await c.service.getResponse('s1')).calculationVersion).toBe(
      previous,
    );
  });

  it('no trae filas viejas si el rango pedido no esta en la generacion actual', async () => {
    const c = setup({
      [AGROMET_ENGINE_VERSION]: {
        generationId: 'current',
        data: [row(AGROMET_ENGINE_VERSION)],
      },
      [previous]: {
        generationId: 'previous',
        data: [row(), row(previous, '2026-07-02')],
      },
    });
    expect((await c.service.getResponse('s1', '2026-07-02')).series).toEqual(
      [],
    );
    expect(c.repository.getActiveIndicadoresGeneration).toHaveBeenCalledTimes(
      1,
    );
  });
});
