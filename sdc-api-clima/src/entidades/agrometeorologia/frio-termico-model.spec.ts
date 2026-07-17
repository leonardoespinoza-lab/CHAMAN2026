import { calcularFrioTermico } from 'modelos/src';

describe('Motor cientifico de frio termico', () => {
  const serieConstante = (temperaturaC: number, horas: number) =>
    Array.from({ length: horas }, (_, index) => ({
      fecha: new Date(Date.UTC(2026, 4, 1, index)).toISOString(),
      temperaturaC,
      fuente: 'sensor',
      calidad: 'observada' as const,
    }));

  it('calcula HF, Utah y Dynamic Model como modelos independientes', () => {
    const resultado = calcularFrioTermico(serieConstante(5, 240), {
      desfaseHorarioMinutos: -180,
      prioridadFuentes: ['sensor', 'station', 'open_meteo'],
    });

    expect(resultado.acumulado.horasFrio).toBe(240);
    expect(resultado.acumulado.unidadesFrioUtah).toBe(240);
    expect(resultado.acumulado.porcionesFrioDinamicas).toBeGreaterThan(0);
    expect(resultado.acumulado.porcionesFrioDinamicas).not.toBeCloseTo(
      resultado.acumulado.horasFrio / 28,
      4,
    );
    // Vector de referencia calculado con los parametros Fishman/Erez usados
    // por chillR. Chaman interpreta cada observacion como la media de una hora
    // completa, incluida la primera.
    expect(resultado.acumulado.porcionesFrioDinamicas).toBeCloseTo(
      7.555141015634145,
      10,
    );
  });

  it('prioriza el sensor de campo cuando dos fuentes cubren la misma hora', () => {
    const fecha = '2026-05-01T03:00:00.000Z';
    const resultado = calcularFrioTermico(
      [
        {
          fecha,
          temperaturaC: 20,
          fuente: 'open_meteo',
          calidad: 'estimada',
        },
        {
          fecha,
          temperaturaC: 5,
          fuente: 'sensor',
          calidad: 'observada',
        },
      ],
      {
        prioridadFuentes: ['sensor', 'station', 'open_meteo'],
      },
    );

    expect(resultado.horas).toHaveLength(1);
    expect(resultado.horas[0].fuente).toBe('sensor');
    expect(resultado.acumulado.horasFrio).toBe(1);
  });

  it('declara las brechas y no inventa frio durante horas faltantes', () => {
    const resultado = calcularFrioTermico(
      [
        {
          fecha: '2026-05-01T03:00:00.000Z',
          temperaturaC: 5,
          fuente: 'station',
        },
        {
          fecha: '2026-05-01T06:00:00.000Z',
          temperaturaC: 5,
          fuente: 'station',
        },
      ],
      {
        fechaInicio: '2026-05-01T03:00:00.000Z',
        fechaFin: '2026-05-01T06:00:00.000Z',
        coberturaMinimaPct: 90,
      },
    );

    expect(resultado.acumulado.horasFrio).toBe(2);
    expect(resultado.continuidad.horasEsperadas).toBe(4);
    expect(resultado.continuidad.horasFaltantes).toBe(2);
    expect(resultado.continuidad.coberturaPct).toBe(50);
    expect(resultado.continuidad.coberturaSuficiente).toBe(false);
  });

  it('respeta el dia civil de 23 horas durante el inicio de DST', () => {
    const inicio = Date.parse('2026-03-08T05:00:00.000Z');
    const resultado = calcularFrioTermico(
      Array.from({ length: 23 }, (_, hora) => ({
        fecha: new Date(inicio + hora * 3600000).toISOString(),
        temperaturaC: 5,
        fuente: 'station',
      })),
      {
        fechaInicio: '2026-03-08T05:00:00.000Z',
        fechaFin: '2026-03-09T03:00:00.000Z',
        zonaHoraria: 'America/New_York',
        desfaseHorarioMinutos: -180,
      },
    );

    expect(resultado.porDia).toHaveLength(1);
    expect(resultado.porDia[0]).toMatchObject({
      dia: '2026-03-08',
      horasEsperadas: 23,
      horasConDato: 23,
      coberturaPct: 100,
    });
  });

  it('respeta el dia civil de 25 horas durante el fin de DST', () => {
    const inicio = Date.parse('2026-11-01T04:00:00.000Z');
    const resultado = calcularFrioTermico(
      Array.from({ length: 25 }, (_, hora) => ({
        fecha: new Date(inicio + hora * 3600000).toISOString(),
        temperaturaC: 5,
        fuente: 'sensor',
      })),
      {
        fechaInicio: '2026-11-01T04:00:00.000Z',
        fechaFin: '2026-11-02T04:00:00.000Z',
        zonaHoraria: 'America/New_York',
      },
    );

    expect(resultado.porDia).toHaveLength(1);
    expect(resultado.porDia[0]).toMatchObject({
      dia: '2026-11-01',
      horasEsperadas: 25,
      horasConDato: 25,
      coberturaPct: 100,
    });
  });

  it('conserva el resultado historico argentino con IANA o UTC-3 fijo', () => {
    const observaciones = serieConstante(5, 48).map((item, hora) => ({
      ...item,
      fecha: new Date(
        Date.parse('2026-05-01T03:00:00.000Z') + hora * 3600000,
      ).toISOString(),
    }));
    const fijo = calcularFrioTermico(observaciones, {
      desfaseHorarioMinutos: -180,
    });
    const iana = calcularFrioTermico(observaciones, {
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      desfaseHorarioMinutos: -180,
    });

    expect(iana.acumulado).toEqual(fijo.acumulado);
    expect(iana.porDia).toEqual(fijo.porDia);
    expect(iana.continuidad).toEqual(fijo.continuidad);
  });

  it('degrada de forma explicita al desfase fijo si la zona IANA es invalida', () => {
    const resultado = calcularFrioTermico(
      [
        {
          fecha: '2026-05-01T03:00:00.000Z',
          temperaturaC: 5,
          fuente: 'sensor',
        },
      ],
      {
        zonaHoraria: 'Zona/Inexistente',
        desfaseHorarioMinutos: -180,
      },
    );

    expect(resultado.porDia[0].dia).toBe('2026-05-01');
    expect(resultado.diagnostico.advertencias.join(' ')).toContain(
      'no es valida',
    );
  });
});
