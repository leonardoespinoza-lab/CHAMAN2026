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
    expect(options.legend.itemStyle.whiteSpace).toBe('normal');
    expect(options.legend.itemStyle.textOverflow).toBe('clip');
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

  it('conserva los cinco nombres de trigo en la leyenda aunque solo una enfermedad tenga valores', () => {
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

    expect(nombres).toHaveSize(5);
    expect(nombres).toContain('Roya de la Hoja');
    const series = componente.chartOptions!.series as any[];
    expect(series.every((serie) => serie.showInLegend)).toBeTrue();
    expect(series.filter((serie) => serie.data.length)).toHaveSize(1);
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
    expect(mancha.map((s) => s.name)).toEqual(['Mancha en Red', 'Mancha en Red']);
    expect(mancha.map((s) => s.showInLegend)).toEqual([true, false]);
    expect(mancha[1].linkedTo).toBe(mancha[0].id);
    expect(mancha[0].color).toBe(mancha[1].color);
    expect(mancha.map((s) => s.data.map((p: any) => p.y))).toEqual([
      [99.86, null],
      [null, 41.09],
    ]);
    expect(series.every((s) => s.connectNulls === false && s.dashStyle === 'Solid')).toBeTrue();
    const fusariosis = series.find((s) => s.name.includes('Fusariosis'));
    expect(fusariosis.showInLegend).toBeTrue();
    expect(fusariosis.data).toEqual([]);
    expect(fusariosis.enableMouseTracking).toBeFalse();
    expect((componente.chartOptions!.yAxis as any).plotBands).toEqual([]);
    expect((componente.chartOptions!.yAxis as any).title.text).not.toContain('%');
  });

  for (const width of [360, 1280]) {
    it(`renderiza solo nombre y valor, sin versiones ni estados a ${width}px`, () => {
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
        const active = chart.series.find((s) => s.options.custom?.['version'] === 'v4')!;
        chart.tooltip.refresh(active.data[1]);
        const texto = host.textContent || '';
        expect(texto).toContain('41,1 /100');
        expect(texto).not.toContain('Fuera de ventana');
        expect(texto).not.toContain('0,0 /100');
        const contenido = (componente as any).formatearTooltip(Date.parse('2026-08-04T03:00:00.000Z'), chart.series);
        expect(contenido).toContain('Mancha en Red');
        expect(contenido).not.toMatch(/v3|v4|Datos a revisar|Sin datos/);
        const tooltip = host.querySelector('div.highcharts-tooltip > span') as HTMLElement;
        expect(tooltip).toBeTruthy();
        expect(tooltip.textContent).not.toContain('%');
        expect(tooltip.getBoundingClientRect().width).toBeLessThanOrEqual(width);
        expect(tooltip.getBoundingClientRect().width).toBeGreaterThanOrEqual(240);
        expect(chart.plotHeight).toBeGreaterThan(180);
      } finally {
        chart.destroy();
        host.remove();
      }
    });
  }

  it('conserva el ancho del tooltip con cuatro nombres largos y calidad baja', () => {
    const componente = crear();
    componente.embedded = true;
    componente.siembra = { semilla: { cultivo: 'Cebada' } } as any;
    componente.predicciones = [
      {
        fecha: '2026-07-26T03:00:00.000Z',
        enfermedades: [
          { idEnfermedad: 'cebada.mancha_red', enfermedad: 'Mancha en Red', resultado: 94.63, estado: 'calculado' },
          {
            idEnfermedad: 'cebada.escaldadura',
            enfermedad: 'Escaldadura de la Cebada',
            resultado: 1.67,
            estado: 'calculado',
          },
          {
            idEnfermedad: 'cebada.roya_hoja',
            enfermedad: 'Roya de la Hoja de Cebada',
            resultado: 0,
            estado: 'fuera_ventana',
          },
          {
            idEnfermedad: 'cebada.fusariosis_espiga',
            enfermedad: 'Fusariosis de la Espiga de Cebada',
            resultado: 0,
            estado: 'fuera_ventana',
          },
        ].map((e) => ({ ...e, modelo: { version: 3 }, calidadDatos: 'baja' })),
      },
    ] as any;
    (componente as any).crearGraficoPrediccionesCebada();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const options = withChamanChartTheme(componente.chartOptions!);
    const chart = Highcharts.chart(host, {
      ...options,
      chart: { ...options.chart, width: 360, height: 500, animation: false },
    });
    try {
      chart.tooltip.refresh(chart.series[0].data[0]);
      const tooltip = host.querySelector('div.highcharts-tooltip > span') as HTMLElement;
      const rect = tooltip.getBoundingClientRect();
      const chartRect = host.querySelector('.highcharts-container')!.getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(240);
      expect(rect.width).toBeLessThanOrEqual(280);
      expect(rect.height).toBeLessThan(300);
      expect(rect.bottom).toBeLessThanOrEqual(chartRect.bottom);
      expect(tooltip.textContent).toContain('94,6 /100');
      expect(tooltip.textContent).toContain('Escaldadura de la Cebada');
      expect(tooltip.querySelectorAll('tbody tr')).toHaveSize(2);
      expect(tooltip.textContent).not.toMatch(/Fusariosis|Roya de la Hoja|Fuera de ventana|Datos a revisar|v3/);
    } finally {
      chart.destroy();
      host.remove();
    }
  });

  it('mantiene nombres y colores en la leyenda sin curvas vacías o en cero y conserva el retorno a cero de curvas activas', () => {
    const componente = crear();
    const series = [
      {
        type: 'line',
        id: 'activa',
        name: 'Activa',
        data: [
          [1, 8],
          [2, 0],
          [3, null],
        ],
      },
      {
        type: 'line',
        id: 'cero',
        name: 'Solo cero',
        color: '#36b56b',
        data: [
          [1, 0],
          [2, 0],
        ],
      },
      {
        type: 'line',
        id: 'vacia',
        name: 'Sin datos',
        color: '#e6b84f',
        data: [
          [1, null],
          [2, null],
        ],
      },
    ];
    const original = JSON.stringify(series);
    const options = (componente as any).chartBasicOptions([], [], series);
    expect(options.series.map((s: any) => s.name)).toEqual(['Activa', 'Solo cero', 'Sin datos']);
    expect(options.series.every((s: any) => s.showInLegend)).toBeTrue();
    expect(options.series.slice(1).map((s: any) => [s.data, s.color, s.enableMouseTracking])).toEqual([
      [[], '#36b56b', false],
      [[], '#e6b84f', false],
    ]);
    expect(options.series[0].data).toEqual([
      [1, 8],
      [2, 0],
      [3, null],
    ]);
    expect(JSON.stringify(series)).toBe(original);
  });

  it('oculta y muestra todas las versiones con una única entrada de leyenda', () => {
    const componente = crear();
    componente.siembra = { semilla: { cultivo: 'Cebada' } } as any;
    componente.predicciones = historialCebada();
    (componente as any).crearGraficoPrediccionesCebada();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const chart = Highcharts.chart(host, componente.chartOptions!);
    try {
      expect(chart.series.filter((s) => s.options.showInLegend)).toHaveSize(2);
      const mancha = chart.series.filter((s) => s.name === 'Mancha en Red');
      const fusariosis = chart.series.find((s) => s.name.includes('Fusariosis'))!;
      chart.series[0].hide();
      expect(mancha.every((s) => !s.visible)).toBeTrue();
      expect(fusariosis.visible).toBeTrue();
      chart.series[0].show();
      expect(chart.series.every((s) => s.visible)).toBeTrue();
      fusariosis.hide();
      fusariosis.show();
      expect(fusariosis.data).toEqual([]);
    } finally {
      chart.destroy();
      host.remove();
    }
  });
});
