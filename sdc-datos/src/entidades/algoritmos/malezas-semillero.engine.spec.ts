import { IReporteNDVI } from 'modelos/src';
import {
  calcularSerieHidrotermalMalezas,
  capaSuperficialModelada,
  combinarClimaSemillero,
  contextoSatelitalMalezas,
  diasSemilleroDesdeOpenMeteo,
  humedadSemillero0a5,
  campaniaMalezasParaFecha,
  resolverSeguimientoMalezasLote,
  temporadaMalezasActual,
  temperaturaSemillero0a5,
} from './malezas-semillero.engine';

describe('motor superficial de emergencia de malezas', () => {
  it('interpola temperatura y pondera humedad en la zona de semillas 0-5 cm', () => {
    expect(temperaturaSemillero0a5(20, 14)).toBeCloseTo(17.5, 6);
    expect(humedadSemillero0a5(0.1, 0.2, 0.3)).toBeCloseTo(0.22, 6);
    expect(humedadSemillero0a5(0.1, undefined, undefined)).toBeUndefined();
  });

  it('convierte las variables horarias superficiales de Open-Meteo sin usar aire', () => {
    const times = Array.from(
      { length: 24 },
      (_, hour) => `2026-09-03T${String(hour).padStart(2, '0')}:00`,
    );
    const result = diasSemilleroDesdeOpenMeteo(
      {
        hourly: {
          time: times,
          soil_temperature_0cm: times.map(() => 20),
          soil_temperature_6cm: times.map(() => 14),
          soil_moisture_0_to_1cm: times.map(() => 0.1),
          soil_moisture_1_to_3cm: times.map(() => 0.2),
          soil_moisture_3_to_9cm: times.map(() => 0.3),
          precipitation: times.map(() => 0),
          et0_fao_evapotranspiration: times.map(() => 0.1),
        },
      },
      '2026-09-04',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fecha: '2026-09-03',
      tipo: 'historico',
      temperaturaSuelo: 17.5,
      humedadSuelo: 0.22,
      coberturaHorariaPct: 100,
      profundidadReferenciaCm: '0-5',
    });
    expect(result[0].horas).toHaveLength(24);
  });

  it('acepta solo la capa modelada 0-7 y excluye sondas profundas', () => {
    const capas = { '0-7': 0.16, '10': 0.31, '20': 0.35 };

    expect(capaSuperficialModelada(capas, 'mixed')).toBe(0.16);
    expect(capaSuperficialModelada(capas, 'chaman_meteo')).toBe(0.16);
    expect(capaSuperficialModelada(capas, 'sensor')).toBeUndefined();
    expect(capaSuperficialModelada({ '10': 0.31 }, 'mixed')).toBeUndefined();
  });

  it('prioriza Open-Meteo superficial y usa Chaman-Meteo solo para huecos', () => {
    const result = combinarClimaSemillero(
      [
        {
          fecha: '2026-09-03',
          tipo: 'historico',
          temperaturaSuelo: 16,
          humedadSuelo: 0.18,
          fuente: 'Open-Meteo · semillero 0-5 cm',
        },
      ],
      [
        {
          fecha: '2026-09-02',
          tipo: 'historico',
          temperaturaSuelo: 14,
          humedadSuelo: 0.22,
          fuente: 'Chaman-Meteo · suelo 0-7 cm',
        },
        {
          fecha: '2026-09-03',
          tipo: 'historico',
          temperaturaSuelo: 12,
          humedadSuelo: 0.31,
          lluviaMm: 4,
          fuente: 'Chaman-Meteo · suelo 0-7 cm',
        },
      ],
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      temperaturaSuelo: 16,
      humedadSuelo: 0.18,
      lluviaMm: 4,
      fuente: 'Open-Meteo · semillero 0-5 cm',
    });
  });

  it('acumula tiempo hidrotermal hora por hora con la humedad superficial', () => {
    const result = calcularSerieHidrotermalMalezas(
      [
        {
          fecha: '2026-09-03',
          tipo: 'historico',
          horas: [
            {
              timestamp: '2026-09-03T00:00',
              temperaturaSuelo: 20,
              humedadSuelo: 0.2,
            },
            {
              timestamp: '2026-09-03T01:00',
              temperaturaSuelo: 20,
              humedadSuelo: 0.2,
            },
          ],
        },
      ],
      {
        temperaturaBase: 10,
        humedadTheta50: 0.2,
        humedadEscala: 0.03,
        deltaHorasDiario: 24,
        emergencia: (htt) => htt,
      },
    );

    expect(result.httHistorico).toBeCloseTo(10, 6);
    expect(result.serie[0].httDia).toBe(10);
    expect(result.humedadReferencia).toBe(0.2);
  });

  it('usa el satelite como contexto y no lo habilita con una escena vencida', () => {
    const reporte = {
      fechaDeLaImagen: '2026-09-02',
      indices: { ndvi: 0.12, savi: 0.1, ndmi: -0.05 },
      metadataImagen: {
        renderQa: { ndvi: { validCoveragePct: 85 } },
      },
    } as unknown as IReporteNDVI;

    expect(contextoSatelitalMalezas(reporte, '2026-09-04')).toMatchObject({
      estado: 'suelo_expuesto',
      etiqueta: 'Suelo mayormente expuesto',
      confianza: 'alta',
    });
    expect(contextoSatelitalMalezas(reporte, '2026-10-10').estado).toBe(
      'no_evaluable',
    );
  });

  it('separa campañas estivales e invernales sin depender de una siembra', () => {
    expect(temporadaMalezasActual('2026-09-04')).toBe('estival');
    expect(temporadaMalezasActual('2027-02-28')).toBe('estival');
    expect(temporadaMalezasActual('2027-03-01')).toBe('invernal');
    expect(temporadaMalezasActual('2027-08-31')).toBe('invernal');

    expect(campaniaMalezasParaFecha('2027-01-10')).toEqual({
      temporada: 'estival',
      fechaInicio: '2026-09-01',
      fechaFin: '2027-02-28',
    });
    expect(campaniaMalezasParaFecha('2027-06-10')).toEqual({
      temporada: 'invernal',
      fechaInicio: '2027-03-01',
      fechaFin: '2027-08-31',
    });
  });

  it('inicia el seguimiento con la campaña climática y conserva un reinicio manual', () => {
    const inicial = resolverSeguimientoMalezasLote({
      hoy: '2026-09-04',
    });
    expect(inicial).toMatchObject({
      fechaInicio: '2026-09-01',
      origen: 'campania_estival',
      temporada: 'estival',
    });

    const reiniciado = resolverSeguimientoMalezasLote({
      hoy: '2026-10-12',
      seguimiento: inicial,
      reiniciar: true,
    });
    expect(reiniciado).toMatchObject({
      fechaInicio: '2026-10-12',
      origen: 'reinicio_manual',
      temporada: 'estival',
    });
    expect(
      resolverSeguimientoMalezasLote({
        hoy: '2027-01-15',
        seguimiento: reiniciado,
      }),
    ).toEqual(reiniciado);
  });

  it('abre una campaña nueva aunque exista un reinicio de la temporada anterior', () => {
    expect(
      resolverSeguimientoMalezasLote({
        hoy: '2027-03-02',
        seguimiento: {
          fechaInicio: '2026-10-12',
          origen: 'reinicio_manual',
          temporada: 'estival',
        },
      }),
    ).toMatchObject({
      fechaInicio: '2027-03-01',
      origen: 'campania_invernal',
      temporada: 'invernal',
    });
  });
});
