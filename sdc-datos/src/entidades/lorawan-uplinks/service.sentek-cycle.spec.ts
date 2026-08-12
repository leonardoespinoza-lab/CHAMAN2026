import { IReporte } from 'modelos/src';
import { LorawanUplinksService } from './service';

describe('LorawanUplinksService Sentek aggregation cycle', () => {
  const service = new LorawanUplinksService({} as any, {} as any, {} as any);

  const reporteConTemperaturaFinal: IReporte = {
    deveui: '24E124454E358347',
    fecha: '2026-08-12T18:00:00.000Z',
    estado: 'parcial',
    datos: {
      valores: {
        'Temperatura Suelo': Array.from({ length: 12 }, (_, index) => ({
          profundidad: 5 + index * 10,
          unidad: 'C',
          valores: { actual: index >= 9 ? 14 + index / 100 : (null as any) },
        })),
      },
    },
  };

  it('starts a new snapshot when an SDI-12 channel repeats', () => {
    const compatible = (service as any).reporteCompatibleConCiclo(
      reporteConTemperaturaFinal,
      [11],
    );
    expect(compatible).toBeNull();
  });

  it('merges another SDI-12 channel from the same sweep', () => {
    const compatible = (service as any).reporteCompatibleConCiclo(
      reporteConTemperaturaFinal,
      [0],
    );
    expect(compatible).toBe(reporteConTemperaturaFinal);
  });

  it('allows the independent analog sensor to complete the recent controller snapshot', () => {
    const compatible = (service as any).reporteCompatibleConCiclo(
      reporteConTemperaturaFinal,
      [],
    );
    expect(compatible).toBe(reporteConTemperaturaFinal);
  });
});
