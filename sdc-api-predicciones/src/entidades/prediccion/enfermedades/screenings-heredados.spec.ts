import { esPrediccionSanitariaAlertable } from 'modelos/src';
import { FinCicloSojaService } from './fin_ciclo_soja';
import { RoyaDelMaizService } from './roya_del_maiz';

describe('screenings sanitarios heredados', () => {
  it('mantiene Fin de Ciclo de soja visible pero fuera de alertas automaticas', async () => {
    const service = new FinCicloSojaService();
    const prediccion = await service.predecir(
      {
        cultivo: 'Soja',
        resistencia: [
          {
            idEnfermedad: 'soja.fin_ciclo',
            enfermedad: 'Fin de Ciclo',
            multiplicador: 1,
            estado: 'observada',
            confianza: 'alta',
          },
        ],
      } as any,
      { precip: 40 },
      {
        enfermedades: [
          {
            enfermedad: 'Fin de Ciclo',
            resultado: 80,
            variables: { PtAc7: 100, DPr7: 5, Lt7: 500 },
          },
        ],
      } as any,
      true,
    );

    expect(prediccion.resultado).toBeGreaterThan(0);
    expect(prediccion.modelo?.validacion).toBe('operativo_provisional');
    expect(esPrediccionSanitariaAlertable(prediccion)).toBe(false);
  });

  it('no presenta la formula heredada de trigo como alerta validada de roya del maiz', async () => {
    const service = new RoyaDelMaizService();
    const prediccion = await service.predecir(
      {
        cultivo: 'Maiz',
        resistencia: [
          {
            idEnfermedad: 'maiz.roya',
            enfermedad: 'Roya del Maiz',
            multiplicador: 1,
            estado: 'observada',
            confianza: 'alta',
          },
        ],
      } as any,
      { precip: 0, hr: 98, Tavg: 16 },
      undefined,
      true,
    );

    expect(prediccion.resultado).toBeGreaterThanOrEqual(0);
    expect(prediccion.modelo?.validacion).toBe('operativo_provisional');
    expect(esPrediccionSanitariaAlertable(prediccion)).toBe(false);
  });
});
