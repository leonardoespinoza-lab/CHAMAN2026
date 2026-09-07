import {
  COLORES_SERIE_SANITARIA_TRIGO,
  DrawerGraficoEnfermedadesComponent,
} from './drawer-grafico-enfermedades.component';
import Highcharts from 'highcharts';
import { withChamanChartTheme } from '../../../../../auxiliares/componentes/chart/chaman-chart-theme';

describe('DrawerGraficoEnfermedadesComponent - grafico principal', () => {
  const crear = () =>
    new DrawerGraficoEnfermedadesComponent(
      { getFechaInicioEtapaTrigo2: () => undefined, getFechaInicioEtapaCebada2: () => undefined } as any,
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

  it('no agrega un segundo porcentaje global al valor del tooltip', () => {
    const componente = crear();

    const options = (componente as any).chartBasicOptions([], [], []);

    expect(options.tooltip.valueSuffix).toBeUndefined();
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

  it('representa todas las enfermedades de trigo con lineas solidas', () => {
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
    const series = (componente.chartOptions?.series || []) as any[];

    expect(series).toHaveSize(5);
    expect(series.every((serie) => serie.dashStyle === 'Solid')).toBeTrue();
    expect(series.every((serie) => serie.opacity === 1)).toBeTrue();
  });

  const historialCebada = () =>
    [
      {
        fecha: '2026-08-03T03:00:00.000Z',
        enfermedades: [
          {
            enfermedad: 'Mancha en Red',
            idEnfermedad: 'cebada.mancha_red',
            resultado: 99.86,
            estado: 'calculado',
            modelo: { version: 3 },
          },
          {
            enfermedad: 'Fusariosis de la Espiga de Cebada',
            idEnfermedad: 'cebada.fusariosis_espiga',
            resultado: 0,
            estado: 'fuera_ventana',
            modelo: { version: 3 },
          },
        ],
      },
      {
        fecha: '2026-08-04T03:00:00.000Z',
        enfermedades: [
          {
            enfermedad: 'Mancha en Red',
            idEnfermedad: 'cebada.mancha_red',
            resultado: 41.09,
            estado: 'calculado',
            modelo: { version: 4 },
          },
          {
            enfermedad: 'Fusariosis de la Espiga de Cebada',
            idEnfermedad: 'cebada.fusariosis_espiga',
            resultado: 0,
            estado: 'fuera_ventana',
            modelo: { version: 3 },
          },
        ],
      },
    ] as any;

  it('mantiene el historial de cebada separado por versión, sin cero para fuera de ventana', () => {
    const componente = crear();
    componente.siembra = { semilla: { cultivo: 'Cebada' } } as any;
    componente.predicciones = historialCebada();
    (componente as any).crearGraficoPrediccionesCebada();
    const series = componente.chartOptions!.series as any[];
    const mancha = series.filter((s) => s.custom.idEnfermedad === 'cebada.mancha_red');
    expect(mancha.map((s) => s.name)).toEqual(['Mancha en Red · v3', 'Mancha en Red · v4']);
    expect(mancha[0].color).toBe(mancha[1].color);
    expect(mancha.map((s) => s.data.map((p: any) => p.y))).toEqual([
      [99.86, null],
      [null, 41.09],
    ]);
    expect(series.every((s) => s.connectNulls === false && s.dashStyle === 'Solid')).toBeTrue();
    expect(componente.seriesSinLecturas).toEqual([
      { nombre: 'Fusariosis de la Espiga de Cebada', estado: 'Fuera de ventana' },
    ]);
    expect((componente.chartOptions!.yAxis as any).plotBands).toEqual([]);
    expect((componente.chartOptions!.yAxis as any).title.text).not.toContain('%');
  });

  for (const width of [360, 1280]) {
    it(`renderiza el tooltip con nombres, un decimal y estados a ${width}px`, () => {
      const componente = crear();
      componente.siembra = { semilla: { cultivo: 'Cebada' } } as any;
      componente.predicciones = historialCebada();
      (componente as any).crearGraficoPrediccionesCebada();
      const host = document.createElement('div');
      host.style.width = `${width}px`;
      document.body.appendChild(host);
      const options = withChamanChartTheme(componente.chartOptions!);
      const chart = Highcharts.chart(host, {
        ...options,
        chart: { ...options.chart, width, height: 500, animation: false },
      });
      try {
        const active = chart.series.find((s) => s.name === 'Mancha en Red · v4')!;
        chart.tooltip.refresh(active.data[1]);
        const texto = host.textContent || '';
        expect(texto).toContain('41,1 /100');
        expect(texto).toContain('Fuera de ventana');
        expect(texto).not.toContain('0,0 /100');
        const contenido = (componente as any).formatearTooltip(Date.parse('2026-08-04T03:00:00.000Z'), chart.series);
        expect(contenido).toContain('Mancha en Red · v4');
        expect(contenido).not.toContain('Mancha en Red · v3');
        expect(contenido).not.toContain('%');
        const tooltip = host.querySelector('.highcharts-tooltip') as HTMLElement;
        expect(tooltip).toBeTruthy();
        expect(tooltip.getBoundingClientRect().width).toBeLessThanOrEqual(width);
        expect(chart.plotHeight).toBeGreaterThan(180);
      } finally {
        chart.destroy();
        host.remove();
      }
    });
  }
});
