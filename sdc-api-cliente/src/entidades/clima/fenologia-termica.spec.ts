import {
  construirHitosFenologiaArveja,
  resolverFenologiaTermicaArveja,
} from '../../../../sdc-modelos/src/motores/fenologia-termica';
import { ClimaService } from './service';

const referencia = {
  unidadEtapas: 'grados_dia' as const,
  temperaturaBaseC: 3,
  rangosTermicos: {
    'S-E': { min: 125, max: 140 },
    'E-R1': { min: 685, max: 760 },
    'R1-MF': { min: 585, max: 660 },
    'S-MF': { min: 1395, max: 1560 },
  },
};

describe('fenologia termica de arveja', () => {
  it('convierte rangos por fase en umbrales acumulados y no inventa R3', () => {
    const hitos = construirHitosFenologiaArveja(referencia);

    expect(hitos.map((hito) => hito.codigo)).toEqual(['S', 'E', 'R1', 'R3', 'MF']);
    expect(hitos[1]).toMatchObject({ umbralMinGdd: 125, umbralMaxGdd: 140 });
    expect(hitos[2]).toMatchObject({ umbralMinGdd: 810, umbralMaxGdd: 900 });
    expect(hitos[3]).toMatchObject({ calculable: false });
    expect(hitos[4]).toMatchObject({ umbralMinGdd: 1395, umbralMaxGdd: 1560 });
  });

  it('aplica los umbrales conservadores de vigilancia convectiva en la ruta directa', () => {
    const service = Object.create(ClimaService.prototype) as any;
    const riesgo = service.calcularRiesgoGranizo([
      {
        fecha: '2026-07-17',
        weatherCode: 95,
        cape: 1200,
        lluvia: 2,
        showers: 4,
        probabilidadLluvia: 70,
        rafagaViento: 52,
      },
    ]);

    expect(riesgo.posibilidadPct).toBe(53);
    expect(riesgo.nivel).toBe('medio');
    expect(riesgo.titulo).toBe('Vigilancia convectiva por granizo');
    expect(riesgo.recomendacion).toContain('informativa');
  });

  it('ubica el lote por acumulacion termica', () => {
    const estado = resolverFenologiaTermicaArveja({
      referencia,
      gradosDiaAcumulados: 300,
    });

    expect(estado.codigo).toBe('E');
    expect(estado.fuente).toBe('termica');
    expect(estado.progresoEtapaPct).toBeGreaterThan(0);
    expect(estado.progresoEtapaPct).toBeLessThan(100);
  });

  it('prioriza el registro de campo sobre la estimacion', () => {
    const estado = resolverFenologiaTermicaArveja({
      referencia,
      gradosDiaAcumulados: 300,
      etapaCampo: 'R3 (Formacion de vainas)',
    });

    expect(estado.codigo).toBe('R3');
    expect(estado.fuente).toBe('campo');
  });

  it('usa FieldClimate asociado y conserva la trazabilidad de la fuente', async () => {
    const service = Object.create(ClimaService.prototype) as any;
    service.axiosService = {
      GET: jest.fn().mockResolvedValue([
        {
          fecha: '2026-07-01T00:00:00.000Z',
          fuente: 'FieldClimate',
          temperatura: { min: 3, max: 15, avg: 9 },
          lluvia: { sum: 1.2 },
          calidadDatos: { nivel: 'alta', fuente: 'estacion_asociada', cobertura: 1, fallback: false },
        },
      ]),
    };

    const serie = await service.fetchHistoricoClimaticoAutomatico(
      -32.778,
      -61.9168,
      '2026-07-01',
      '2026-07-01',
      'estacion-1',
    );

    expect(service.axiosService.GET).toHaveBeenCalledWith(
      expect.stringContaining('/clima/estacion/cerca/'),
      expect.objectContaining({
        params: expect.objectContaining({
          idEstacionMeteorologica: 'estacion-1',
          soloEstacionAsociada: 'true',
        }),
      }),
    );
    expect(serie[0]).toMatchObject({
      fuente: 'FieldClimate',
      temperaturaMin: 3,
      temperaturaMax: 15,
      lluvia: 1.2,
    });
  });
});
