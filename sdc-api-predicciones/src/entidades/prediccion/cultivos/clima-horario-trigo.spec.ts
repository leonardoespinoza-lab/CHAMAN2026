import {
  IClimaEstacionMeteorologica,
  ISerieAgrometeorologicaHora,
} from 'modelos/src';
import {
  agregarClimaHorarioPorDia,
  ventanaHorariaRoyaAmarilla,
  ventanaHorariaRoyaAmarillaCanonica,
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

  it('usa 240 horas canonicas completas y conserva la fecha local del lote', () => {
    const filas: ISerieAgrometeorologicaHora[] = [];
    for (let dia = 1; dia <= 10; dia += 1) {
      for (let hora = 0; hora < 24; hora += 1) {
        const fecha = `2026-07-${String(dia).padStart(2, '0')}`;
        filas.push({
          timestamp: `${fecha}T${String(hora).padStart(2, '0')}:00:00.000Z`,
          localDate: fecha,
          timezone: 'America/Argentina/Buenos_Aires',
          isForecast: false,
          state: 'observed',
          weather: {
            temperatureC: 10,
            relativeHumidityPct: 95,
            precipitationMm: 0,
          },
          source: 'open_meteo',
          sourceByVariable: {
            temperatureC: 'open_meteo',
            relativeHumidityPct: 'open_meteo',
            precipitationMm: 'open_meteo',
          },
          qualityFlags: [],
          completenessPercentage: 100,
        });
      }
    }

    const ventana = ventanaHorariaRoyaAmarillaCanonica(
      filas,
      new Date('2026-07-10T03:00:00.000Z'),
    );

    expect(ventana).toHaveLength(240);
    expect(ventana[0]).toEqual(
      expect.objectContaining({
        temperatura: 10,
        humedadRelativa: 95,
        lluviaMm: 0,
      }),
    );
  });

  it('excluye un dia canonico con menos de 22 horas unicas', () => {
    const fechaObjetivo = new Date('2026-07-10T03:00:00.000Z');
    const filas: ISerieAgrometeorologicaHora[] = Array.from(
      { length: 21 },
      (_, hora) => ({
        timestamp: `2026-07-10T${String(hora).padStart(2, '0')}:00:00.000Z`,
        localDate: '2026-07-10',
        timezone: 'America/Argentina/Buenos_Aires',
        isForecast: false,
        state: 'observed',
        weather: {
          temperatureC: 10,
          relativeHumidityPct: 95,
          precipitationMm: 0,
        },
        source: 'open_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        completenessPercentage: 100,
      }),
    );

    expect(
      ventanaHorariaRoyaAmarillaCanonica(filas, fechaObjetivo),
    ).toHaveLength(0);
  });
});
