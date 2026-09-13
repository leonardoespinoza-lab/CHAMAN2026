import { reportPeriod, renderHistoryChart } from './report-history';
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
