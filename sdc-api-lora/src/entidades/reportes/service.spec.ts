import { ReportesService } from './service';

describe('ReportesService - vista previa de frio LoRa', () => {
  const service = new ReportesService({} as any, {} as any);
  const calcular = (
    dispositivo: any,
    fecha: string,
    valores: any,
  ) =>
    (service as any).calcularFrioAcumulado(
      dispositivo,
      fecha,
      valores,
    );

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
    const result = calcular(
      {},
      '2026-07-10T03:00:00.000Z',
      {
        'Temperatura Suelo': [
          { profundidad: 20, valores: { actual: 5 } },
        ],
      },
    );

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
});
