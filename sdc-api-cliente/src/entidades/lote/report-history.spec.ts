import { reportPeriod, renderHistoryChart, summarizeHistory, historyPoints, renderHistorySummary } from './report-history';
import { LotesService } from './service';

describe('Ventanas del informe sin cambiar el ciclo biologico', () => {
  const now = new Date('2026-09-13T18:00:00Z');
  it('anual incluye siembra a cosecha, no solo los ultimos dias', () => {
    const s: any = {
      fechaSiembra: '2025-11-01',
      fechaCosecha: '2026-04-15',
      semilla: { cultivo: 'Soja' },
    };
    const original = JSON.stringify(s);
    expect(reportPeriod(s, now)).toEqual({
      desde: Date.parse('2025-11-01'),
      hasta: Date.parse('2026-04-15'),
      reason: 'siembra',
    });
    expect(JSON.stringify(s)).toBe(original);
  });
  it('perenne antiguo usa anio actual cuando no hay poscosecha', () => {
    expect(
      reportPeriod(
        { fechaSiembra: '2020-01-01', semilla: { cultivo: 'Peral' } } as any,
        now,
      ),
    ).toEqual({
      desde: Date.parse('2026-01-01'),
      hasta: now.getTime(),
      reason: 'anio_actual',
    });
  });
  it('perenne usa poscosecha real vigente del anio actual y no observa o inventa fechas', () => {
    const s: any = {
      _id: 's1',
      fechaSiembra: '2020-01-01',
      semilla: { cultivo: 'Manzano' },
      registrosFenologicos: [
        { id: 'old', fecha: '2026-03-01', etapa: 'Poscosecha' },
        {
          id: 'new',
          reemplazaRegistroId: 'old',
          fecha: '2026-03-10',
          etapa: 'Poscosecha',
        },
        {
          id: 'obs',
          fecha: '2026-08-01',
          etapa: 'Poscosecha',
          tipoEvento: 'observacion',
        },
        {
          id: 'other',
          fecha: '2026-08-02',
          etapa: 'Poscosecha',
          idSiembra: 'otro',
        },
        {
          id: 'low',
          fecha: '2026-08-03',
          etapa: 'Poscosecha',
          confianza: 'baja',
        },
      ],
    };
    expect(reportPeriod(s, now)?.desde).toBe(Date.parse('2026-03-10'));
    expect(reportPeriod(s, now)?.reason).toBe('poscosecha');
  });
  it.each([
    { fechaSiembra: 'invalida' },
    { fechaSiembra: '2027-01-01' },
    { fechaSiembra: '2026-01-01', fechaCosecha: '2025-12-01' },
  ])('rechaza ventana anual incoherente %j', (data) =>
    expect(
      reportPeriod({ ...data, semilla: { cultivo: 'Trigo' } } as any, now),
    ).toBeUndefined(),
  );
});

describe('Graficos de historia: datos reales y huecos', () => {
  const graph = (points: any[]) =>
    renderHistoryChart({
      title: 'Temperatura <QA>',
      unit: 'C',
      from: Date.parse('2026-01-01'),
      to: Date.parse('2026-01-06'),
      lines: [{ key: 't', name: 'T', color: '#000' }],
      points,
    });
  it('no transforma null ni dias ausentes en ceros o segmentos interpolados', () => {
    const html = graph([
      { date: '2026-01-01', values: { t: 5 } },
      { date: '2026-01-02', values: { t: null } },
      { date: '2026-01-03', values: { t: 6 } },
      { date: '2026-01-05', values: { t: 7 } },
    ]);
    const curve = html.match(/data-series="t" d="([^"]*)"/)?.[1] || '';
    expect((curve.match(/M/g) || []).length).toBe(3);
    expect(curve).not.toContain('L');
    expect(html).toContain('&lt;QA&gt;');
  });
  it('cero es una lectura valida, cadena numerica no lo es y excluye puntos fuera del periodo', () => {
    const html = graph([
      { date: '2026-01-01', values: { t: 0 } },
      { date: '2026-01-02', values: { t: '4' } },
      { date: '2025-01-03', values: { t: 99 } },
    ]);
    expect(html).toContain('2026-01-01 - T: 0 C');
    expect(html).not.toContain('T: 4');
    expect(html).not.toContain('T: 99');
  });
  it('informa sin datos sin dibujar un cero', () =>
    expect(graph([])).toContain('Sin datos historicos suficientes'));
});

describe('Resumenes numericos auditables del informe', () => {
  const from = Date.parse('2026-01-01'), to = Date.parse('2026-01-06');
  const row = (date: string, value: unknown) => ({ date, values: { value } });
  const points = [row('2026-01-01', 0), row('2026-01-02', 8), row('2026-01-03', null), row('2026-01-05', 4)];
  const spec = { key: 'value', label: 'Prueba', unit: 'mm', operation: 'sum' as const };
  it('suma solo valores disponibles y explicita la cobertura, no rellena dias', () => {
    expect(summarizeHistory(points, from, to, spec)).toMatchObject({ value: 12, count: 3, expected: 6 });
    expect(summarizeHistory(points, from, to, { ...spec, operation: 'mean' }).value).toBe(4);
    expect(renderHistorySummary({ points, from, to, summaries: [spec] })).toContain('3/6 dias con dato');
  });
  it.each([undefined, null, NaN, Infinity, '8'])('no convierte %s en dato o cero', value => {
    expect(summarizeHistory([row('2026-01-01', value)], from, to, spec)).toMatchObject({ value: undefined, count: 0 });
  });
  it('no suma dos veces duplicados iguales y no elige un valor arbitrario ante conflicto', () => {
    const rows = [row('2026-01-01', 2), row('2026-01-01', 2), row('2026-01-02', 3), row('2026-01-02', 4)];
    expect(summarizeHistory(rows, from, to, spec)).toMatchObject({ value: 2, count: 1 });
    expect(historyPoints(rows, from, to)).toHaveLength(2);
  });
  it('excluye fechas imposibles, intradiarias y fuera del periodo', () => {
    const rows = [row('2025-12-31', 100), row('2026-01-07', 200), row('2026-01-01T02:00:00Z', 300), row('2026-02-30', 400), ...points];
    expect(summarizeHistory(rows, from, to, spec).value).toBe(12);
  });
  it('mantiene el ultimo acumulado disponible, no suma ni escoge el maximo', () => {
    const rows = [row('2026-01-02', 30), row('2026-01-05', 24), row('2026-01-06', null)];
    expect(summarizeHistory(rows, from, to, { ...spec, operation: 'latest' })).toMatchObject({ value: 24, date: '2026-01-05' });
  });
  it('cuenta dias con helada estrictamente bajo 0, no episodios ni alertas', () => {
    const rows = [row('2026-01-01', -2), row('2026-01-02', -1), row('2026-01-03', 0), row('2026-01-04', null)];
    expect(summarizeHistory(rows, from, to, { ...spec, operation: 'below', threshold: 0 })).toMatchObject({ value: 2, count: 3 });
  });
  it('descarta porcentajes fuera de rango y lluvia negativa conservando ceros reales', () => {
    const rows = [row('2026-01-01', -1), row('2026-01-02', 110), row('2026-01-03', 0)];
    expect(summarizeHistory(rows, from, to, { ...spec, minValue: 0, maxValue: 100 })).toMatchObject({ value: 0, count: 1 });
    expect(summarizeHistory(rows, from, to, { ...spec, minValue: 0 })).toMatchObject({ value: 110, count: 2 });
  });
  it('amplia las fechas disponibles sin esconder el periodo ni inventar valores intermedios', () => {
    const html = renderHistoryChart({ title: 'Lluvia', unit: 'mm', points, from, to, summaries: [spec], lines: [{ key: 'value', name: 'Lluvia', color: '#000' }] });
    expect(html).toContain('viewBox="0 0 760 260"');
    expect(html).toContain('Datos graficados: 01/01/2026 a 05/01/2026');
    expect(html).toContain('12 mm');
    expect(html).toContain('3/6 dias con dato');
    expect(html).toContain('history-summary');
  });
});

describe('Integracion del historico en el informe existente', () => {
  const service = new LotesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;
  const s: any = {
    _id: 's1',
    fechaSiembra: '2026-05-01',
    fechaCosecha: '2026-08-20',
    semilla: { cultivo: 'Trigo' },
  };
  describe('duracion informada del cultivo', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-13T18:00:00Z')));
    afterEach(() => jest.useRealTimers());

    it('cierra los dias en la cosecha, sin acumular hasta la emision del PDF', () => {
      const sowing: any = { fechaSiembra: '2025-11-01', fechaCosecha: '2026-04-15', semilla: { cultivo: 'Soja' } };
      const original = JSON.stringify(sowing);
      expect(service.getDiasCultivoTexto(sowing)).toBe('Ciclo cerrado: 165');
      jest.setSystemTime(new Date('2026-12-01T18:00:00Z'));
      expect(service.getDiasCultivoTexto(sowing)).toBe('Ciclo cerrado: 165');
      expect(JSON.stringify(sowing)).toBe(original);
    });
    it('no trata una fecha de cosecha futura como un ciclo ya cerrado', () => {
      expect(service.getDiasCultivoTexto({ fechaSiembra: '2026-09-01', fechaCosecha: '2026-10-01' }))
        .toBe('Dias desde inicio: 12');
    });
    it('conserva los dias desde la plantacion en un perenne sin cosecha', () => {
      expect(service.getDiasCultivoTexto({ fechaSiembra: '2020-01-01', semilla: { cultivo: 'Peral' } }))
        .toBe('Dias desde inicio: 2447');
    });
    it.each([
      { fechaSiembra: 'invalida' },
      { fechaSiembra: '2027-01-01' },
      { fechaSiembra: '2026-01-01', fechaCosecha: 'invalida' },
      { fechaSiembra: '2026-01-01', fechaCosecha: '2025-12-31' },
    ])('no comunica una duracion valida con fechas incoherentes: %j', (sowing) => {
      expect(service.getDiasCultivoTexto(sowing)).toBe('Sin fecha valida');
    });
  });
  it('consulta toda la campana sanitaria sin sustituir la consulta del riesgo actual', async () => {
    const query = jest
      .spyOn(service, 'getListadoInterno')
      .mockResolvedValue([]);
    await service.getHistoricoSanitarioCertificado(s);
    expect(query).toHaveBeenLastCalledWith(
      'prediccions',
      {
        idSiembra: 's1',
        fechaPrediccion: { $gte: '2026-05-01', $lt: '2026-08-21' },
      },
      { limit: 0, sort: 'fechaPrediccion' },
      expect.any(Number),
    );
    await service.getPrediccionesCertificado('s1');
    expect(query).toHaveBeenLastCalledWith(
      'prediccions',
      { idSiembra: 's1' },
      { limit: 5, sort: '-fechaPrediccion' },
      undefined,
    );
    query.mockRestore();
  });
  it('el informe excluye pronostico, fuera de campana y acumulados futuros', () => {
    const day = (date: string, forecast: boolean, gdd: number): any => ({
      date,
      isForecast: forecast,
      weather: {},
      metrics: { gddAccumulated: gdd },
      source: 'open_meteo',
      sourceByVariable: {},
    });
    const c = service.mapCanonicalClimate(
      {
        summary: { gddAccumulated: 999 },
        dataSource: { type: 'open_meteo' },
        series: [
          day('2026-04-30', false, 1),
          day('2026-05-01', false, 10),
          day('2026-05-02', true, 999),
        ],
        warnings: [],
      },
      undefined,
      s,
    );
    expect(c.serie).toHaveLength(1);
    expect(c.acumulados.gradosDia).toBe(10);
  });
  it('lleva las metricas canonicas al grafico y su resumen sin incluir el pronostico', () => {
    const input: any = { summary: {}, dataSource: { type: 'open_meteo' }, warnings: [], series: [
      { date: '2026-05-01', isForecast: false, metrics: { temperatureMinC: -1, temperatureMaxC: 12, relativeHumidityMeanPct: 60, precipitationMm: 8, gddAccumulated: 4, et0Mm: 2, etcMm: 1, availableWaterPercentage: 25 }, weather: {} },
      { date: '2026-05-02', isForecast: false, metrics: { temperatureMinC: 0, temperatureMaxC: 14, relativeHumidityMeanPct: 80, precipitationMm: 0, gddAccumulated: 9, et0Mm: 3, etcMm: 2, availableWaterPercentage: 20 }, weather: {} },
      { date: '2026-05-03', isForecast: true, metrics: { precipitationMm: 999, relativeHumidityMeanPct: 100, temperatureMinC: -9 }, weather: {} },
    ] };
    const original = JSON.stringify(input);
    const c = service.mapCanonicalClimate(input, undefined, s);
    const html = service.renderGraficosHistoricos(c, s);
    expect(html).toContain('8 mm');
    expect(html).toContain('70 %');
    expect(html).toContain('1 dia');
    expect(html).toContain('9 GDD');
    expect(html).toContain('5 mm');
    expect(html).toContain('3 mm');
    expect(html).toContain('22,5 %');
    expect(html).not.toContain('999');
    expect(html).toContain('No cuenta alertas emitidas');
    expect(html).toContain('history-charts');
    expect(JSON.stringify(input)).toBe(original);
  });
  it('un screening experimental no se dibuja como porcentaje operativo', () => {
    const html = service.renderHistoricoSanitario(
      [
        {
          idSiembra: 's1',
          fechaPrediccion: '2026-05-03',
          enfermedades: [
            {
              enfermedad: 'QA',
              resultado: 90,
              modelo: { validacion: 'experimental' },
            },
          ],
        },
      ],
      s,
    );
    expect(html).toContain('Sin serie sanitaria operativa');
    expect(html).not.toContain('<svg');
  });
  it('el resumen del informe prioriza la etapa observada sobre una prediccion anterior', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-13T18:00:00Z'));
    try {
      const perennial: any = {
        fechaSiembra: '2020-01-01',
        semilla: { cultivo: 'Peral' },
        registrosFenologicos: [
          {
            id: 'brota',
            etapa: 'Brotacion',
            fecha: '2026-09-09',
            tipoEvento: 'inicio_etapa',
          },
        ],
      };
      expect(
        service.getEstadoFenologico(perennial, [
          { nombreEtapa: 'Reposo invernal' },
        ]),
      ).toBe('Brotacion');
      expect(service.formatDate('2026-03-15')).toMatch(/^15/);
    } finally {
      jest.useRealTimers();
    }
  });
});
