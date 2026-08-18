import {
  adaptarPerfilSueloLoRaWAN,
  evaluarSeguridadRecomendacionRiego,
  normalizarHumedadSueloPct,
  PROFUNDIDADES_SENTEK_CM,
  seleccionarPerfilSentekSeguro,
} from './riego-safety';

function perfil(fecha: string, profundidades = [...PROFUNDIDADES_SENTEK_CM]) {
  return {
    fecha,
    humedadSuelo: Object.fromEntries(
      profundidades.map((profundidad) => [
        profundidad,
        { last: 24, avg: 99 },
      ]),
    ),
  } as any;
}

function capasCalibradas() {
  return PROFUNDIDADES_SENTEK_CM.map((profundidad) => ({
    profundidad,
    numeroDeSensor: profundidad / 10,
    capacidadDeCampo: 30,
    puntoMarchitez: 14,
  }));
}

describe('seguridad de entradas Sentek para riego', () => {
  it('preserva profundidad y usa last sin promediar', () => {
    const [adaptado] = adaptarPerfilSueloLoRaWAN([
      {
        fecha: '2026-08-15T10:00:00.000Z',
        humedadSuelo: {
          40: { avg: 91, last: 24, min: 20, max: 28 },
          50: { avg: 92, last: 25 },
          60: { avg: 93, last: 26 },
        },
      },
    ]);

    expect(Object.keys(adaptado.humedadSuelo || {})).toEqual([
      '40',
      '50',
      '60',
    ]);
    expect(adaptado.humedadSuelo?.[40].last).toBe(24);
    expect(adaptado.humedadSuelo?.[40].avg).toBeUndefined();
  });

  it('rechaza una serie que solo trae avg para no convertir promedios en lecturas crudas', () => {
    const adaptados = adaptarPerfilSueloLoRaWAN([
      {
        fecha: '2026-08-15T10:00:00.000Z',
        humedadSuelo: { 10: { avg: 24 } },
      },
    ]);

    expect(adaptados).toEqual([]);
  });

  it('conserva el ultimo ciclo 12/12 aunque despues llegue uno parcial', () => {
    const completo = perfil('2026-08-15T11:00:00.000Z');
    const parcial = perfil(
      '2026-08-15T11:30:00.000Z',
      PROFUNDIDADES_SENTEK_CM.slice(0, 3),
    );
    const resultado = seleccionarPerfilSentekSeguro(
      [completo, parcial],
      new Date('2026-08-15T12:00:00.000Z'),
    );

    expect(resultado.reportesCompletos).toEqual([completo]);
    expect(resultado.fechaUltimoReporte).toBe('2026-08-15T11:00:00.000Z');
    expect(resultado.completo).toBe(true);
    expect(resultado.fresco).toBe(true);
    expect(resultado.coberturaUltimoReporte).toBe(0.25);
  });

  it('rechaza un perfil completo pero vencido', () => {
    const resultado = seleccionarPerfilSentekSeguro(
      [perfil('2026-08-15T01:00:00.000Z')],
      new Date('2026-08-15T12:00:00.000Z'),
    );
    expect(resultado.completo).toBe(true);
    expect(resultado.fresco).toBe(false);
    expect(resultado.motivo).toContain('supera 6 horas');
  });

  it('no inventa escalas para una humedad porcentual', () => {
    expect(normalizarHumedadSueloPct(2)).toBe(2);
    expect(normalizarHumedadSueloPct(24.123)).toBe(24.12);
    expect(normalizarHumedadSueloPct(240)).toBeUndefined();
  });

  it('bloquea recomendaciones cuando faltan parametros reales del riego', () => {
    const perfilSeguro = seleccionarPerfilSentekSeguro(
      [perfil('2026-08-15T11:00:00.000Z')],
      new Date('2026-08-15T12:00:00.000Z'),
    );
    const resultado = evaluarSeguridadRecomendacionRiego({
      siembra: {
        fechaSiembra: '2026-08-01',
        fechaCosecha: null,
      } as any,
      lote: { capacidadDeCampo: 30, puntoMarchitez: 14 } as any,
      cultivo: 'Trigo',
      tieneSentek: true,
      perfilSentek: perfilSeguro,
      lluviaHistorica: [{ fecha: '2026-08-15T10:00:00Z' }] as any,
      pronostico: [0, 1, 2].map((dia) => ({
        fecha: `2026-08-${15 + dia}`,
        et0: 3,
      })) as any,
      ahora: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(resultado.accionable).toBe(false);
    expect(resultado.limitaciones).toEqual(
      expect.arrayContaining([
        'capacidad real del sistema de riego',
        'area mojada valida (ancho de bulbo y metros lineales)',
        'eficiencia de aplicacion del riego',
      ]),
    );
  });

  it('habilita el calculo solo con campania, perfil, clima y riego completos', () => {
    const perfilSeguro = seleccionarPerfilSentekSeguro(
      [perfil('2026-08-15T11:00:00.000Z')],
      new Date('2026-08-15T12:00:00.000Z'),
    );
    const resultado = evaluarSeguridadRecomendacionRiego({
      siembra: {
        fechaSiembra: '2026-08-01',
        fechaCosecha: null,
        activa: true,
      } as any,
      lote: {
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
        sueloConfirmadoPorUsuario: true,
        suelos: capasCalibradas(),
        capacidadDeRiego: 8,
        anchoDeBulbo: 1,
        metrosLinealesHas: 10000,
        eficienciaRiego: 85,
      } as any,
      cultivo: 'Trigo',
      tieneSentek: true,
      perfilSentek: perfilSeguro,
      lluviaHistorica: [{ fecha: '2026-08-15T10:00:00Z' }] as any,
      pronostico: [0, 1, 2].map((dia) => ({
        fecha: `2026-08-${15 + dia}`,
        et0: 3,
      })) as any,
      ahora: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(resultado).toMatchObject({ accionable: true, limitaciones: [] });
  });

  it('no acepta el 30/14 legacy de una unica capa aunque el lote figure confirmado', () => {
    const perfilSeguro = seleccionarPerfilSentekSeguro(
      [perfil('2026-08-15T11:00:00.000Z')],
      new Date('2026-08-15T12:00:00.000Z'),
    );
    const resultado = evaluarSeguridadRecomendacionRiego({
      siembra: {
        fechaSiembra: '2026-08-01',
        fechaCosecha: null,
        activa: true,
      } as any,
      lote: {
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
        sueloConfirmadoPorUsuario: true,
        suelos: [
          {
            profundidad: null,
            numeroDeSensor: null,
            capacidadDeCampo: 30,
            puntoMarchitez: 14,
          },
        ],
        capacidadDeRiego: 8,
        anchoDeBulbo: 1,
        metrosLinealesHas: 10000,
        eficienciaRiego: 85,
      } as any,
      cultivo: 'Trigo',
      tieneSentek: true,
      perfilSentek: perfilSeguro,
      lluviaHistorica: [{ fecha: '2026-08-15T10:00:00Z' }] as any,
      pronostico: [0, 1, 2].map((dia) => ({
        fecha: `2026-08-${15 + dia}`,
        et0: 3,
      })) as any,
      ahora: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(resultado.accionable).toBe(false);
    expect(resultado.limitaciones).toContain(
      'CC y PMP calibrados o confirmados para el perfil',
    );
  });

  it('bloquea doce capas automaticas mientras el suelo no este confirmado', () => {
    const perfilSeguro = seleccionarPerfilSentekSeguro(
      [perfil('2026-08-15T11:00:00.000Z')],
      new Date('2026-08-15T12:00:00.000Z'),
    );
    const resultado = evaluarSeguridadRecomendacionRiego({
      siembra: {
        fechaSiembra: '2026-08-01',
        fechaCosecha: null,
        activa: true,
      } as any,
      lote: {
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
        sueloConfirmadoPorUsuario: false,
        suelos: capasCalibradas(),
        capacidadDeRiego: 8,
        anchoDeBulbo: 1,
        metrosLinealesHas: 10000,
        eficienciaRiego: 85,
      } as any,
      cultivo: 'Trigo',
      tieneSentek: true,
      perfilSentek: perfilSeguro,
      lluviaHistorica: [{ fecha: '2026-08-15T10:00:00Z' }] as any,
      pronostico: [0, 1, 2].map((dia) => ({
        fecha: `2026-08-${15 + dia}`,
        et0: 3,
      })) as any,
      ahora: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(resultado.accionable).toBe(false);
    expect(resultado.limitaciones).toContain(
      'CC y PMP calibrados o confirmados para el perfil',
    );
  });

  it('bloquea la recomendacion si falla la fuente de lluvia, sin inventar cero', () => {
    const perfilSeguro = seleccionarPerfilSentekSeguro(
      [perfil('2026-08-15T11:00:00.000Z')],
      new Date('2026-08-15T12:00:00.000Z'),
    );
    const resultado = evaluarSeguridadRecomendacionRiego({
      siembra: {
        fechaSiembra: '2026-08-01',
        fechaCosecha: null,
        activa: true,
      } as any,
      lote: {
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
        sueloConfirmadoPorUsuario: true,
        suelos: capasCalibradas(),
        capacidadDeRiego: 8,
        anchoDeBulbo: 1,
        metrosLinealesHas: 10000,
        eficienciaRiego: 85,
      } as any,
      cultivo: 'Trigo',
      tieneSentek: true,
      perfilSentek: perfilSeguro,
      lluviaHistorica: [],
      pronostico: [0, 1, 2].map((dia) => ({
        fecha: `2026-08-${15 + dia}`,
        et0: 3,
      })) as any,
      fuentesConError: ['lluvia_historica'],
      ahora: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(resultado.accionable).toBe(false);
    expect(resultado.limitaciones).toEqual(
      expect.arrayContaining([
        'lluvia historica observada',
        'fuente lluvia_historica no disponible',
      ]),
    );
  });

  it('undefined se omite del contrato serializado de una recomendacion bloqueada', () => {
    const bloqueada = {
      estado: 'no_disponible',
      recomendacionHoyMm: undefined,
      regar: [],
    };
    const serializada = JSON.parse(JSON.stringify(bloqueada));

    expect(serializada).toEqual({
      estado: 'no_disponible',
      regar: [],
    });
    expect(serializada).not.toHaveProperty('recomendacionHoyMm');
  });
});
