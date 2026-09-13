import {
  calcularSeguimientoHuellaHidrica,
  calcularHuellaHidrica,
} from './huella-hidrica.engine';
import { SiembrasService } from '../siembra/service';

describe('Huella conectada a ETc canonica', () => {
  const siembra: any = {
    _id: 's1',
    fechaSiembra: '2026-09-01',
    fechaCosecha: '2026-09-03',
    semilla: { cultivo: 'Trigo' },
    rendimientoObtenidoKgHaSeco: 1000,
    lluviasPromedio: '< 600',
    fijacionN: '0',
    manejoAgronomico: 'Bueno',
    intensidadLluvias: 'Suaves',
    materiaOrganica: '< 1',
    labranza: 'Siembra Directa',
  };
  const lote: any = {
    depositoN: '< 0.5',
    texturaLixiviacion: 'Franco',
    texturaEscorrentia: 'Franco',
    drenajeNaturalLixiviacion: 'Bien Drenado',
    drenajeNaturalEscorrentia: 'Bien Drenado',
    erosionEscorrentiaPendiente: 'Baja (0 - 3%)',
    contenidoP: '< 12',
  };
  const clima = [1, 2, 3].map((d) => ({
    fecha: `2026-09-0${d}`,
    lluviaMm: 1,
    et0Mm: 5,
    kc: 1.2,
    etcMm: 6,
  }));
  const params = () => ({ siembra, lote, clima, demandaCanonica: true });
  it('usa exactamente ETc del motor y mantiene azul limitado al riego registrado', () => {
    const result = calcularHuellaHidrica({
      ...params(),
      riegos: [{ laminaMm: 2 }],
    });
    expect(result.parciales.etcTotalMm).toBe(18);
    expect(result.parciales.etAzulMm).toBe(2);
    expect(
      result.parciales.etVerdeMm + result.parciales.deficitPotencialMm,
    ).toBeCloseTo(18, 1);
    expect(
      calcularSeguimientoHuellaHidrica(params()).parciales.etcTotalMm,
    ).toBe(18);
  });
  it.each([null, undefined, -1, NaN, '6'])(
    'no fabrica ETc cuando llega %p',
    (value) => {
      const p = {
        ...params(),
        clima: [{ ...clima[0], etcMm: value as any }, clima[1], clima[2]],
      };
      expect(calcularSeguimientoHuellaHidrica(p).periodo.diasClima).toBe(2);
      expect(() => calcularHuellaHidrica(p)).toThrow('ETc canonica');
    },
  );
  it('acepta cero real y no promedia filas duplicadas o de generaciones superpuestas', () => {
    const p = params();
    expect(
      calcularHuellaHidrica({
        ...p,
        clima: clima.map((d) => ({ ...d, etcMm: 0 })),
      }).parciales.etcTotalMm,
    ).toBe(0);
    expect(() =>
      calcularHuellaHidrica({ ...p, clima: [...clima, clima[0]] }),
    ).toThrow('ETc canonica');
    expect(
      calcularSeguimientoHuellaHidrica({ ...p, clima: [...clima, clima[0]] })
        .periodo.diasClima,
    ).toBe(2);
  });
  it('el adaptador conserva ETc, excluye pronosticos y rechaza una generacion anterior al registro', async () => {
    const service: any = Object.create(SiembrasService.prototype);
    service.logger = { warn: jest.fn() };
    service.indicadoresAgrometeorologicosService = {
      getActiveGeneration: jest.fn().mockResolvedValue({
        data: [
          {
            fecha: '2026-09-01',
            calculadoEn: '2026-09-13T10:00:00Z',
            metricas: { precipitationMm: 0, et0Mm: 5, kc: 0.7, etcMm: 3.5 },
          },
          { fecha: '2026-09-02', esPronostico: true, metricas: { etcMm: 99 } },
          { fecha: '2026-08-01', metricas: { etcMm: 99 } },
        ],
      }),
    };
    const result = await service.getClimaCanonicoHuella(
      's1',
      '2026-09-01',
      '2026-09-03',
      siembra,
    );
    expect(result.clima).toEqual([
      { fecha: '2026-09-01', lluviaMm: 0, et0Mm: 5, kc: 0.7, etcMm: 3.5 },
    ]);
    const stale = await service.getClimaCanonicoHuella(
      's1',
      '2026-09-01',
      '2026-09-03',
      {
        ...siembra,
        registrosFenologicos: [{ actualizadoEn: '2026-09-13T11:00:00Z' }],
      },
    );
    expect(stale.clima).toEqual([]);
  });
});
