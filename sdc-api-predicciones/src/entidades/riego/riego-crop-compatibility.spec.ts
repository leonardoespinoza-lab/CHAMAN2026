import { calcularRiegoV13Estimado } from './riego-v13-fallback.engine';

describe('Compatibilidad hidrica de anuales sin fenologia manual', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-09-13T12:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  // Fixtures de contrato artificiales. Importes capturados del codigo e4113ede,
  // no valores agronomicos recomendados ni un cronograma varietal calibrado.
  it.each([
    [
      'Trigo',
      {
        R0_R1: 13,
        R1_R2: 102,
        R2_R3: 124,
        R3_R4: 138,
        R4_R5: 144,
        R5_R6: 151,
        R6_R7: 185,
      },
      1.72,
    ],
    [
      'Soja',
      {
        siembra_emergencia: 10,
        emergencia_R1: 44,
        R1_R3: 66,
        R3_R5: 80,
        R5_R7: 118,
      },
      3.88,
    ],
    [
      'Maiz',
      {
        siembra_emergencia: 12,
        emergencia_floracion: 76,
        floracion_madurez: 160,
      },
      4.56,
    ],
  ])(
    'conserva %s, su crono y ET0 sin exigir ETc externa',
    (cultivo, etapas, esperado) => {
      const params: any = {
        cultivo,
        crono: { cultivo, etapas },
        siembra: { fechaSiembra: '2026-07-15', semilla: { cultivo } },
        lote: { capacidadDeRiego: 8 },
        lluviaHistorica: [],
        pronostico7Dias: [
          { fecha: '2026-09-13', et0: 4, lluvia: 0, probabilidadLluvia: 0 },
        ],
      };
      const result = calcularRiegoV13Estimado(params);
      expect(result.pronosticosRiego[0].consumoAgua).toBe(esperado);
      expect(result.et0Promedio).toBe(4);
      params.siembra.registrosFenologicos = [
        { etapa: 'Floracion', fechaInicioEtapa: '2026-09-12' },
      ];
      expect(calcularRiegoV13Estimado(params)).toEqual(result);
    },
  );
});
