import { GraficoHistoricoNapaComponent } from './grafico-historico-napa.component';

describe('GraficoHistoricoNapaComponent', () => {
  it('calcula la profundidad, la columna y una suba de napa con geometria 10/4/6', () => {
    const component = new GraficoHistoricoNapaComponent();
    component.configuracion = {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      salidaMin: 0,
      salidaMax: 10,
      unidadSalida: 'm',
      profundidadInstalacionM: 6,
      longitudCableM: 10,
      tramoCableExteriorM: 4,
    };
    component.rawFrames = [
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T10:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 3,
            unit: 'm',
            waterColumnM: 3,
            installationDepthM: 6,
            quality: 'valid',
          },
        ],
      },
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T11:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 2.72,
            unit: 'm',
            waterColumnM: 3.28,
            installationDepthM: 6,
            quality: 'valid',
          },
        ],
      },
    ];

    component.ngOnChanges({ rawFrames: {} as any });

    expect(component.napaActualM).toBe(2.72);
    expect(component.columnaAguaActualM).toBe(3.28);
    expect(component.profundidadSensorEfectivaM).toBe(6);
    expect(component.direccion).toBe('sube');
    expect(component.variacionCm).toBe(-28);
    expect(component.chartOptions.yAxis.reversed).toBeTrue();
  });

  it('no grafica corriente cruda ni lecturas de napa invalidas', () => {
    const component = new GraficoHistoricoNapaComponent();
    component.rawFrames = [
      {
        devEUI: 'AABBCCDD',
        timestamp: '2026-08-14T10:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          { serviceId: 'entrada-analogica', variable: 'corriente_analogica', value: 9.24, unit: 'mA' },
          {
            serviceId: 'nivel-napa',
            variable: 'nivel_napa',
            value: 9,
            unit: 'm',
            installationDepthM: 6,
            quality: 'invalid',
          },
        ],
      },
    ];

    component.ngOnChanges({ rawFrames: {} as any });

    expect(component.chartOptions).toBeUndefined();
    expect(component.senalSinCalibrar).toBeTrue();
  });

  it('avisa si el controlador comunica pero las tramas recientes omiten 4-20 mA', () => {
    const component = new GraficoHistoricoNapaComponent();
    component.rawFrames = Array.from({ length: 6 }, (_, index) => ({
      devEUI: '24E124454E358347',
      timestamp: `2026-08-14T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
      decodeStatus: 'decoded' as const,
      profileChannels: [11],
      readings: [
        {
          depthCm: 100,
          quality: 'valid' as const,
          serviceId: 'perfil-suelo-sentek',
          unit: 'C',
          value: 14,
          variable: 'temperatura_suelo',
        },
      ],
    }));

    component.ngOnChanges({ rawFrames: {} as any });

    expect(component.alertaEntradaAnalogica).toContain('no incluyen la entrada analogica 4-20 mA');
    expect(component.napaActualM).toBeUndefined();
  });
});
