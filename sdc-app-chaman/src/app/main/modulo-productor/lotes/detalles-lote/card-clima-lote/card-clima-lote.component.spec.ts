import { SimpleChange } from '@angular/core';
import {
  CardClimaLoteComponent,
  filtrarPronosticosVigentes,
} from './card-clima-lote.component';

describe('CardClimaLoteComponent', () => {
  it('muestra la senal convectiva con las mismas variables del motor de granizo', () => {
    const component = new CardClimaLoteComponent();
    component.lote = {
      nombre: 'Lote de prueba',
      establecimiento: {
        nombre: 'Los Recentrales',
        prediccionClimatica: {
          pronosticos: [
            {
              fuente: 'OpenMeteo',
              fecha: '2026-07-17T15:00:00.000Z',
              temperatura: { max: 19.9, min: 14.1, avg: 17 },
              humedad: { max: 99, avg: 90 },
              lluvia: 12.6,
              probabilidadLluvia: 38,
              showers: 12.6,
              weatherCode: 95,
              cape: 1500,
              rafagaViento: 22.9,
              velocidadViento: { max: 22.9 },
              et0: 1.2,
            },
          ],
        },
      },
    } as any;

    component.ngOnChanges({
      lote: new SimpleChange(undefined, component.lote, true),
    });

    expect(component.dias[0].estado).toBe('Tormenta prevista');
    expect(component.dias[0].riesgoConvectivo).toBe('51/100');
    expect(component.metricas.find((item) => item.label === 'Riesgo conv. 7 d')?.value).toBe('51/100');
  });

  it('elimina dias vencidos, ordena el horizonte y no llama Hoy al primer dia futuro', () => {
    const vigentes = filtrarPronosticosVigentes(
      [
        { fecha: '2026-07-16T15:00:00.000Z', lluvia: 99 },
        { fecha: '2026-07-19T15:00:00.000Z', lluvia: 2 },
        { fecha: '2026-07-18T15:00:00.000Z', lluvia: 1 },
      ] as any,
      new Date('2026-07-17T15:00:00.000Z')
    );

    expect(vigentes.map((item) => item.fecha)).toEqual([
      '2026-07-18T15:00:00.000Z',
      '2026-07-19T15:00:00.000Z',
    ]);

    const component = new CardClimaLoteComponent();
    component.lote = {
      establecimiento: { prediccionClimatica: { pronosticos: vigentes } },
    } as any;
    component.ngOnChanges({ lote: new SimpleChange(undefined, component.lote, true) });

    expect(component.dias[0].label).not.toBe('Hoy');
  });
});
