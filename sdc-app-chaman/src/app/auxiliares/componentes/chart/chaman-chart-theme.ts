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

const CHAMAN_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const axisBase = (kind: 'x' | 'y') => ({
  crosshair: {
    color: 'rgba(34, 207, 199, 0.2)',
    dashStyle: 'Solid' as const,
    width: 1,
  },
  gridLineColor: kind === 'y' ? 'rgba(100, 116, 139, 0.14)' : 'rgba(100, 116, 139, 0.08)',
  gridLineWidth: kind === 'y' ? 1 : 0,
  lineColor: 'rgba(100, 116, 139, 0.22)',
  tickColor: 'rgba(100, 116, 139, 0.18)',
  labels: {
    style: {
      color: '#64748b',
      fontSize: '12px',
      fontWeight: '600',
    },
  },
  title: {
    style: {
      color: '#243149',
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

const columnBase = {
  animation: { duration: 520 },
  borderRadius: 4,
  borderWidth: 0,
  color: 'rgba(34, 207, 199, 0.82)',
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
};

export function applyChamanHighchartsDefaults(highcharts: typeof Highcharts = Highcharts): void {
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
    colors: CHAMAN_CHART_COLORS,
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
        color: '#071827',
        fontSize: '16px',
        fontWeight: '700',
      },
    },
    subtitle: {
      style: {
        color: '#64748b',
        fontSize: '13px',
      },
    },
    xAxis: axisBase('x') as any,
    yAxis: axisBase('y') as any,
    legend: {
      align: 'center',
      itemDistance: 18,
      itemHoverStyle: {
        color: '#0f1f33',
      },
      itemStyle: {
        color: '#35445a',
        fontSize: '13px',
        fontWeight: '650',
      },
      symbolHeight: 8,
      symbolRadius: 4,
      symbolWidth: 20,
    },
    tooltip: {
      backgroundColor: 'rgba(255, 255, 255, 0.97)',
      borderColor: 'rgba(34, 207, 199, 0.32)',
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
        color: '#071827',
        fontSize: '13px',
      },
    },
    plotOptions: {
      area: lineBase,
      areaspline: lineBase,
      line: lineBase,
      spline: lineBase,
      bar: columnBase,
      column: columnBase,
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
  const chart = options.chart || {};
  const plotOptions = options.plotOptions || {};
  const legend = options.legend || {};
  const tooltip = options.tooltip || {};

  return {
    ...options,
    colors: options.colors || CHAMAN_CHART_COLORS,
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
        color: '#071827',
        fontSize: '16px',
        fontWeight: '700',
        ...(options.title?.style || {}),
      } as any,
    },
    subtitle: {
      ...options.subtitle,
      style: {
        color: '#64748b',
        fontSize: '13px',
        ...(options.subtitle?.style || {}),
      } as any,
    },
    xAxis: themeAxis(options.xAxis, 'x'),
    yAxis: themeAxis(options.yAxis, 'y'),
    legend: {
      ...legend,
      align: legend.align || 'center',
      itemDistance: legend.itemDistance || 18,
      itemHoverStyle: {
        color: '#0f1f33',
        ...(legend.itemHoverStyle || {}),
      },
      itemStyle: {
        color: '#35445a',
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
      backgroundColor: 'rgba(255, 255, 255, 0.97)',
      borderColor: 'rgba(34, 207, 199, 0.32)',
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
        color: '#071827',
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
        ...columnBase,
        ...(plotOptions.bar || {}),
      },
      column: {
        ...columnBase,
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

function themeAxis(axis: any, kind: 'x' | 'y'): any {
  if (Array.isArray(axis)) {
    return axis.map((item) => themeAxisItem(item || {}, kind));
  }

  return themeAxisItem(axis || {}, kind);
}

function themeAxisItem(axis: any, kind: 'x' | 'y'): any {
  const base = axisBase(kind);
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
