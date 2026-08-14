import { ReportesService, SENTEK_12_CONFIG } from './service';

describe('ReportesService - vista previa de frio LoRa', () => {
  const service = new ReportesService({} as any, {} as any);
  const calcular = (dispositivo: any, fecha: string, valores: any) =>
    (service as any).calcularFrioAcumulado(dispositivo, fecha, valores);

  it('acumula solamente HF 0-7,2 C usando temperatura de aire', () => {
    const result = calcular(
      {
        frioAcumulado: {
          temporadaInicio: '2026-05-01',
          fechaInicio: '2026-05-01T00:00:00.000Z',
          fechaUltimoCalculo: '2026-07-10T00:00:00.000Z',
          ultimaTemperatura: 5,
          horasFrio: 100,
          versionModelo: 'hf-field-preview-1.0.0',
        },
      },
      '2026-07-10T03:00:00.000Z',
      {
        Temperatura: [{ valores: { actual: 8 } }],
      },
    );

    expect(result.horasFrio).toBe(103);
    expect(result.ultimaTemperatura).toBe(8);
    expect(result.estadoCalculo).toBe('preview');
    expect(result.versionModelo).toBe('hf-field-preview-1.0.0');
    expect(result).not.toHaveProperty('horasFrioEfectivas');
    expect(result).not.toHaveProperty('porcionesFrio');
  });

  it('no inventa horas durante una brecha de 24 horas o mas', () => {
    const result = calcular(
      {
        frioAcumulado: {
          temporadaInicio: '2026-05-01',
          fechaInicio: '2026-05-01T00:00:00.000Z',
          fechaUltimoCalculo: '2026-07-09T03:00:00.000Z',
          ultimaTemperatura: 4,
          horasFrio: 80,
          versionModelo: 'hf-field-preview-1.0.0',
        },
      },
      '2026-07-10T03:00:00.000Z',
      {
        Temperatura: [{ valores: { actual: 4 } }],
      },
    );

    expect(result.horasFrio).toBe(80);
  });

  it('no usa temperatura de suelo como sustituto de temperatura de aire', () => {
    const result = calcular({}, '2026-07-10T03:00:00.000Z', {
      'Temperatura Suelo': [{ profundidad: 20, valores: { actual: 5 } }],
    });

    expect(result).toBeUndefined();
  });

  it('reinicia la vista previa al comenzar una nueva temporada', () => {
    const result = calcular(
      {
        frioAcumulado: {
          temporadaInicio: '2025-05-01',
          fechaInicio: '2025-05-01T00:00:00.000Z',
          fechaUltimoCalculo: '2026-04-30T23:00:00.000Z',
          ultimaTemperatura: 5,
          horasFrio: 900,
          versionModelo: 'hf-field-preview-1.0.0',
        },
      },
      '2026-05-01T01:00:00.000Z',
      {
        Temperatura: [{ valores: { actual: 5 } }],
      },
    );

    expect(result.temporadaInicio).toBe('2026-05-01');
    expect(result.horasFrio).toBe(0);
  });

  it('mapea el perfil Sentek exitoso en humedad, VIC y temperatura sin cruzar canales', () => {
    const valores = (service as any).parsearDatosSuelo(
      {
        sdi12_1: '0+34.3+39.3+40.0',
        sdi12_5: '0+1487.0+1617.3+1668.4',
        sdi12_9: '0+18.2+17.9+17.5',
      },
      SENTEK_12_CONFIG,
    );

    expect(valores['Humedad Suelo Profundidad'][0]).toMatchObject({
      profundidad: 10,
      unidad: '%',
      valores: { actual: 34.3 },
    });
    expect(valores['Salinidad Suelo'][0]).toMatchObject({
      profundidad: 10,
      unidad: 'VIC',
      valores: { actual: 1487 },
    });
    expect(valores['Temperatura Suelo'][0]).toMatchObject({
      profundidad: 10,
      valores: { actual: 18.2 },
    });
  });

  it('descarta valores fuera de especificacion sin modificar los validos', () => {
    const valores = (service as any).parsearDatosSuelo(
      {
        sdi12_1: '0+34.3+101+-1',
        sdi12_9: '0+18.2+61+-41',
      },
      SENTEK_12_CONFIG,
    );

    expect(
      valores['Humedad Suelo Profundidad']
        .slice(0, 3)
        .map((row) => row.valores.actual),
    ).toEqual([34.3, null, null]);
    expect(
      valores['Temperatura Suelo'].slice(0, 3).map((row) => row.valores.actual),
    ).toEqual([18.2, null, null]);
  });
});
