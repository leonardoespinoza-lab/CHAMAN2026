import Highcharts from 'highcharts';

export const CHAMAN_CHART_COLORS = [
  '#22cfc7',
  '#38a9e8',
  '#36b56b',
  '#e6b84f',
  '#9a6a45',
  '#e05246',
  '#8b9bb0',
];

export interface ChamanChartThemeTokens {
  colors: string[];
  primary: string;
  secondary: string;
  tertiary: string;
  text: string;
  mutedText: string;
  grid: string;
  gridSoft: string;
  axis: string;
  crosshair: string;
  tooltipBackground: string;
  tooltipBorder: string;
}

const CHAMAN_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function resolveChamanChartThemeTokens(): ChamanChartThemeTokens {
  const primary = cssVariable('--chaman-chart-primary', cssVariable('--tenant-primary', CHAMAN_CHART_COLORS[0]));
  const secondary = cssVariable(
    '--chaman-chart-secondary',
    cssVariable('--tenant-secondary', CHAMAN_CHART_COLORS[1]),
  );
  const tertiary = cssVariable('--chaman-chart-tertiary', CHAMAN_CHART_COLORS[2]);

  return {
    colors: [primary, secondary, tertiary, ...CHAMAN_CHART_COLORS.slice(3)],
    primary,
    secondary,
    tertiary,
    text: cssVariable('--chaman-chart-text', '#071827'),
    mutedText: cssVariable('--chaman-chart-muted', '#64748b'),
    grid: cssVariable('--chaman-chart-grid', 'rgba(100, 116, 139, 0.14)'),
    gridSoft: cssVariable('--chaman-chart-grid-soft', 'rgba(100, 116, 139, 0.08)'),
    axis: cssVariable('--chaman-chart-axis', 'rgba(100, 116, 139, 0.22)'),
    crosshair: cssVariable('--chaman-chart-crosshair', 'rgba(34, 207, 199, 0.2)'),
    tooltipBackground: cssVariable('--chaman-chart-tooltip-bg', 'rgba(255, 255, 255, 0.97)'),
    tooltipBorder: cssVariable('--chaman-chart-tooltip-border', 'rgba(34, 207, 199, 0.32)'),
  };
}

const axisBase = (kind: 'x' | 'y', tokens: ChamanChartThemeTokens) => ({
  crosshair: {
    color: tokens.crosshair,
    dashStyle: 'Solid' as const,
    width: 1,
  },
  gridLineColor: kind === 'y' ? tokens.grid : tokens.gridSoft,
  gridLineWidth: kind === 'y' ? 1 : 0,
  lineColor: tokens.axis,
  tickColor: tokens.axis,
  labels: {
    style: {
      color: tokens.mutedText,
      fontSize: '12px',
      fontWeight: '600',
    },
  },
  title: {
    style: {
      color: tokens.text,
      fontSize: '13px',
      fontWeight: '700',
    },
  },
});

const lineBase = {
  animation: { duration: 520 },
  dataLabels: { enabled: false },
  lineWidth: 2,
  marker: {
    enabled: false,
    radius: 3,
    symbol: 'circle',
    states: {
      hover: {
        enabled: true,
        radius: 4,
      },
    },
  },
  states: {
    hover: {
      enabled: true,
      lineWidthPlus: 0.4,
    },
    inactive: {
      opacity: 0.55,
    },
  },
};

const columnBase = (tokens: ChamanChartThemeTokens) => ({
  animation: { duration: 520 },
  borderRadius: 4,
  borderWidth: 0,
  color: tokens.primary,
  groupPadding: 0.08,
  maxPointWidth: 24,
  pointPadding: 0.08,
  states: {
    hover: {
      brightness: 0.08,
    },
    inactive: {
      opacity: 0.6,
    },
  },
});

export function applyChamanHighchartsDefaults(highcharts: typeof Highcharts = Highcharts): void {
  const tokens = resolveChamanChartThemeTokens();
  highcharts.setOptions({
    lang: {
      months: [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre',
      ],
      weekdays: ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'],
      shortMonths: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
      shortWeekdays: ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'],
    },
    colors: tokens.colors,
    chart: {
      backgroundColor: 'transparent',
      borderRadius: 10,
      spacingBottom: 18,
      spacingLeft: 14,
      spacingRight: 18,
      spacingTop: 20,
      style: {
        fontFamily: CHAMAN_FONT,
      },
    },
    credits: { enabled: false },
    title: {
      style: {
        color: tokens.text,
        fontSize: '16px',
        fontWeight: '700',
      },
    },
    subtitle: {
      style: {
        color: tokens.mutedText,
        fontSize: '13px',
      },
    },
    xAxis: axisBase('x', tokens) as any,
    yAxis: axisBase('y', tokens) as any,
    legend: {
      align: 'center',
      itemDistance: 18,
      itemHoverStyle: {
        color: tokens.text,
      },
      itemStyle: {
        color: tokens.mutedText,
        fontSize: '13px',
        fontWeight: '650',
      },
      symbolHeight: 8,
      symbolRadius: 4,
      symbolWidth: 20,
    },
    tooltip: {
      backgroundColor: tokens.tooltipBackground,
      borderColor: tokens.tooltipBorder,
      borderRadius: 10,
      borderWidth: 1,
      shadow: {
        color: 'rgba(15, 23, 42, 0.14)',
        offsetX: 0,
        offsetY: 8,
        opacity: 0.38,
        width: 14,
      },
      style: {
        color: tokens.text,
        fontSize: '13px',
      },
    },
    plotOptions: {
      area: lineBase,
      areaspline: lineBase,
      line: lineBase,
      spline: lineBase,
      bar: columnBase(tokens),
      column: columnBase(tokens),
      series: {
        animation: { duration: 520 },
        connectNulls: false,
        stickyTracking: true,
        turboThreshold: 10000,
      },
    },
  });
}

export function withChamanChartTheme(options: Highcharts.Options): Highcharts.Options {
  const tokens = resolveChamanChartThemeTokens();
  const chart = options.chart || {};
  const plotOptions = options.plotOptions || {};
  const legend = options.legend || {};
  const tooltip = options.tooltip || {};

  return {
    ...options,
    colors: options.colors || tokens.colors,
    chart: {
      ...chart,
      backgroundColor: 'transparent',
      borderRadius: chart.borderRadius ?? 10,
      spacingBottom: chart.spacingBottom ?? 18,
      spacingLeft: chart.spacingLeft ?? 14,
      spacingRight: chart.spacingRight ?? 18,
      spacingTop: chart.spacingTop ?? 20,
      style: {
        fontFamily: CHAMAN_FONT,
        ...(chart.style || {}),
      },
    },
    credits: {
      enabled: false,
      ...(options.credits || {}),
    },
    title: {
      ...options.title,
      style: {
        color: tokens.text,
        fontSize: '16px',
        fontWeight: '700',
        ...(options.title?.style || {}),
      } as any,
    },
    subtitle: {
      ...options.subtitle,
      style: {
        color: tokens.mutedText,
        fontSize: '13px',
        ...(options.subtitle?.style || {}),
      } as any,
    },
    xAxis: themeAxis(options.xAxis, 'x', tokens),
    yAxis: themeAxis(options.yAxis, 'y', tokens),
    legend: {
      ...legend,
      align: legend.align || 'center',
      itemDistance: legend.itemDistance || 18,
      itemHoverStyle: {
        color: tokens.text,
        ...(legend.itemHoverStyle || {}),
      },
      itemStyle: {
        color: tokens.mutedText,
        fontSize: '13px',
        fontWeight: '650',
        ...(legend.itemStyle || {}),
      },
      symbolHeight: legend.symbolHeight || 8,
      symbolRadius: legend.symbolRadius || 4,
      symbolWidth: legend.symbolWidth || 20,
    },
    tooltip: {
      ...tooltip,
      backgroundColor: tokens.tooltipBackground,
      borderColor: tokens.tooltipBorder,
      borderRadius: 10,
      borderWidth: 1,
      shadow: {
        color: 'rgba(15, 23, 42, 0.14)',
        offsetX: 0,
        offsetY: 8,
        opacity: 0.38,
        width: 14,
      },
      style: {
        color: tokens.text,
        fontSize: '13px',
        ...(tooltip.style || {}),
      },
    },
    plotOptions: {
      ...plotOptions,
      area: {
        ...lineBase,
        ...(plotOptions.area || {}),
      },
      areaspline: {
        ...lineBase,
        ...(plotOptions.areaspline || {}),
      },
      line: {
        ...lineBase,
        ...(plotOptions.line || {}),
      },
      spline: {
        ...lineBase,
        ...(plotOptions.spline || {}),
      },
      bar: {
        ...columnBase(tokens),
        ...(plotOptions.bar || {}),
      },
      column: {
        ...columnBase(tokens),
        ...(plotOptions.column || {}),
      },
      series: {
        animation: { duration: 520 },
        connectNulls: false,
        stickyTracking: true,
        turboThreshold: 10000,
        ...(plotOptions.series || {}),
      },
    },
  };
}

function themeAxis(axis: any, kind: 'x' | 'y', tokens: ChamanChartThemeTokens): any {
  if (Array.isArray(axis)) {
    return axis.map((item) => themeAxisItem(item || {}, kind, tokens));
  }

  return themeAxisItem(axis || {}, kind, tokens);
}

function themeAxisItem(axis: any, kind: 'x' | 'y', tokens: ChamanChartThemeTokens): any {
  const base = axisBase(kind, tokens);
  return {
    ...base,
    ...axis,
    crosshair: axis.crosshair ?? base.crosshair,
    gridLineColor: axis.gridLineColor ?? base.gridLineColor,
    labels: {
      ...(base.labels || {}),
      ...(axis.labels || {}),
      style: {
        ...(base.labels.style || {}),
        ...(axis.labels?.style || {}),
      },
    },
    title: {
      ...(base.title || {}),
      ...(axis.title || {}),
      style: {
        ...(base.title.style || {}),
        ...(axis.title?.style || {}),
      },
    },
  };
}

function cssVariable(property: string, fallback: string): string {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(property).trim();
  return value || fallback;
}
