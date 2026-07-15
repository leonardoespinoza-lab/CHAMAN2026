import { IClimaEstacionMeteorologica } from 'modelos/src';
import {
  agregarClimaHorarioPorDia,
  ventanaHorariaRoyaAmarilla,
} from './clima-horario-trigo';

function hora(
  fecha: string,
  temperatura: number,
  humedad: number,
  lluvia: number,
): IClimaEstacionMeteorologica {
  return {
    fecha,
    fuente: 'OpenMeteo',
    temperatura: { avg: temperatura },
    humedad: { avg: humedad },
    lluvia: { sum: lluvia },
  };
}

describe('clima horario sanitario de trigo', () => {
  it('agrega todas las horas y no usa la primera como resumen diario', () => {
    const filas = Array.from({ length: 24 }, (_, indice) =>
      hora(
        `2026-07-01T${String(indice).padStart(2, '0')}:00:00-03:00`,
        indice,
        60 + indice,
        0.1,
      ),
    );
    const [dia] = agregarClimaHorarioPorDia(filas);
    expect(dia.temperatura).toEqual(
      expect.objectContaining({ avg: 11.5, min: 0, max: 23 }),
    );
    expect(dia.humedad?.avg).toBe(71.5);
    expect(dia.lluvia?.sum).toBe(2.4);
    expect(dia.calidadDatos?.cobertura).toBe(1);
  });

  it('no convierte un agregado diario en una observacion horaria', () => {
    const daily = hora('2026-07-10T12:00:00Z', 10, 95, 0);
    expect(
      ventanaHorariaRoyaAmarilla([daily], new Date('2026-07-10T12:00:00Z')),
    ).toHaveLength(0);
  });

  it('no suma dos veces lluvia cuando una hora llega duplicada', () => {
    const filas = Array.from({ length: 24 }, (_, indice) =>
      hora(
        `2026-07-01T${String(indice).padStart(2, '0')}:00:00-03:00`,
        indice,
        70,
        0.1,
      ),
    );
    filas.push(
      hora('2026-07-01T00:00:00-03:00', 0, 70, 9),
      hora('2026-07-01T03:00:00Z', 0, 70, 9),
    );

    const [dia] = agregarClimaHorarioPorDia(filas);

    expect(dia.lluvia?.sum).toBe(2.4);
    expect(dia.temperatura?.avg).toBe(11.5);
    expect(dia.calidadDatos?.cobertura).toBe(1);
  });

  it('no habilita la ventana horaria con duplicados de un solo instante', () => {
    const duplicadas = Array.from({ length: 18 }, () =>
      hora('2026-07-10T00:00:00-03:00', 10, 95, 0),
    );

    expect(
      ventanaHorariaRoyaAmarilla(duplicadas, new Date('2026-07-10T12:00:00Z')),
    ).toHaveLength(0);
  });
});
