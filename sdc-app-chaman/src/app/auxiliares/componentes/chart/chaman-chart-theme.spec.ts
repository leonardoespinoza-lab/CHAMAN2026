import { resolveChamanChartThemeTokens, withChamanChartTheme } from './chaman-chart-theme';

describe('chaman chart theme', () => {
  const variables = [
    '--chaman-chart-primary',
    '--chaman-chart-secondary',
    '--chaman-chart-tertiary',
    '--chaman-chart-text',
    '--chaman-chart-grid',
    '--chaman-chart-tooltip-border',
  ];

  afterEach(() => {
    for (const variable of variables) {
      document.documentElement.style.removeProperty(variable);
    }
  });

  it('resuelve la paleta vigente del tenant al crear cada grafico', () => {
    const root = document.documentElement.style;
    root.setProperty('--chaman-chart-primary', '#367c2b');
    root.setProperty('--chaman-chart-secondary', '#ffde00');
    root.setProperty('--chaman-chart-tertiary', '#9bad16');
    root.setProperty('--chaman-chart-text', '#10210c');
    root.setProperty('--chaman-chart-grid', 'rgba(16, 33, 12, 0.18)');
    root.setProperty('--chaman-chart-tooltip-border', 'rgba(54, 124, 43, 0.36)');

    const tokens = resolveChamanChartThemeTokens();
    const themed = withChamanChartTheme({
      chart: { type: 'column' },
      series: [{ type: 'column', data: [1] }],
    });

    expect(tokens.colors.slice(0, 3)).toEqual(['#367c2b', '#ffde00', '#9bad16']);
    expect(themed.colors?.slice(0, 3)).toEqual(tokens.colors.slice(0, 3));
    expect((themed.plotOptions?.column as any)?.color).toBe('#367c2b');
    expect((themed.yAxis as any)?.gridLineColor).toBe('rgba(16, 33, 12, 0.18)');
    expect(themed.tooltip?.borderColor).toBe('rgba(54, 124, 43, 0.36)');
  });

  it('respeta colores explicitos del grafico', () => {
    document.documentElement.style.setProperty('--chaman-chart-primary', '#367c2b');

    const themed = withChamanChartTheme({
      colors: ['#123456'],
      chart: { type: 'line' },
      series: [{ type: 'line', data: [1] }],
    });

    expect(themed.colors).toEqual(['#123456']);
  });
});
