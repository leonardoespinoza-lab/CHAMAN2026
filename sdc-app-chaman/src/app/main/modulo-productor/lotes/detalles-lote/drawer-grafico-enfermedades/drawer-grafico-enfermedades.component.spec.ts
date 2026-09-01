import {
  COLORES_SERIE_SANITARIA_TRIGO,
  DrawerGraficoEnfermedadesComponent,
} from './drawer-grafico-enfermedades.component';

describe('DrawerGraficoEnfermedadesComponent - grafico principal', () => {
  const crear = () =>
    new DrawerGraficoEnfermedadesComponent(
      { getFechaInicioEtapaTrigo2: () => undefined } as any,
      {} as any,
      { instant: (value: string) => value } as any
    );

  it('usa una escala completa de 0 a 100 para no recortar resultados altos', () => {
    const componente = crear();

    const options = (componente as any).chartBasicOptions([], [], []);

    expect(options.yAxis.max).toBe(100);
  });

  it('toma del modelo compartido los umbrales 15 y 20 para trigo', () => {
    const componente = crear();
    componente.siembra = { semilla: { cultivo: 'Trigo' } } as any;

    const options = (componente as any).chartBasicOptions([], [], []);

    expect(options.yAxis.plotBands.map((band: any) => [band.from, band.to])).toEqual([
      [0, 15],
      [15, 20],
      [20, 100],
    ]);
  });

  it('mantiene cinco colores fijos y diferentes para las enfermedades de trigo', () => {
    const colores = Object.values(COLORES_SERIE_SANITARIA_TRIGO);

    expect(colores.length).toBe(5);
    expect(new Set(colores).size).toBe(5);
  });

  it('evita repetir titulo y subtitulo cuando el grafico esta embebido', () => {
    const componente = crear();
    componente.embedded = true;

    const options = (componente as any).chartBasicOptions([], [], []);

    expect(options.title.text).toBeUndefined();
    expect(options.subtitle.text).toBeUndefined();
  });

  it('muestra al cliente solamente los nombres de las cinco enfermedades', () => {
    const componente = crear();
    componente.siembra = { semilla: { cultivo: 'Trigo' } } as any;
    componente.predicciones = [
      {
        fecha: '2026-07-10T03:00:00.000Z',
        enfermedades: [
          {
            enfermedad: 'Roya de la Hoja',
            idEnfermedad: 'trigo.roya_hoja',
            resultado: 21,
            estado: 'calculado',
            modelo: { id: 'trigo.roya_hoja', version: 5, fuente: 'contrato v5' },
          },
        ],
      } as any,
    ];

    (componente as any).crearGraficoPrediccionesTrigo();
    const nombres = ((componente.chartOptions?.series || []) as any[]).map((serie) => serie.name);

    expect(nombres).toEqual([
      'Mancha Amarilla',
      'Roya de la Hoja',
      'Roya Amarilla/Estriada',
      'Mancha de la Hoja',
      'Fusarium de la Espiga',
    ]);
    expect(nombres.some((nombre) => /v\d|oportunidad|sin curva/i.test(nombre))).toBeFalse();
  });
});
