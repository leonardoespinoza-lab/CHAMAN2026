import {
  ISiembra,
  esCultivoPerenne,
  fechaEfectivaRegistroFenologico,
  registrosFenologicosVigentes,
  registroFenologicoPuedeGobernarDecision,
} from 'modelos/src';

export interface ReportPeriod {
  desde: number;
  hasta: number;
  reason: 'siembra' | 'poscosecha' | 'anio_actual';
}

const DAY = 86400000;
const time = (value?: string) => (value ? new Date(value).getTime() : NaN);
const normalize = (value?: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

// Presentation window only. Never changes planting, harvest, biofix or model dates.
export function reportPeriod(
  siembra?: ISiembra,
  now = new Date(),
): ReportPeriod | undefined {
  if (!siembra || !Number.isFinite(now.getTime())) return undefined;
  const planted = time(siembra.fechaSiembra);
  const harvest = time(siembra.fechaCosecha);
  const end = now.getTime();
  if (
    !esCultivoPerenne(siembra.semilla?.cultivo) &&
    siembra.semilla?.tipoCultivo !== 'Perenne'
  ) {
    if (!Number.isFinite(planted) || planted > end) return undefined;
    const hasta = Number.isFinite(harvest) ? Math.min(harvest, end) : end;
    return hasta >= planted
      ? { desde: planted, hasta, reason: 'siembra' }
      : undefined;
  }
  const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
  const candidates = registrosFenologicosVigentes(
    siembra.registrosFenologicos || [],
  )
    .filter(
      (r) =>
        r.tipoEvento !== 'observacion' &&
        r.accion !== 'observacion' &&
        registroFenologicoPuedeGobernarDecision(r) &&
        (!r.idSiembra ||
          !siembra._id ||
          String(r.idSiembra) === String(siembra._id)) &&
        (!r.idLote ||
          !siembra.idLote ||
          String(r.idLote) === String(siembra.idLote)) &&
        (!r.cultivo ||
          normalize(r.cultivo) === normalize(siembra.semilla?.cultivo)) &&
        ['poscosecha', 'postcosecha', 'findecosecha'].includes(
          normalize(r.etapa),
        ),
    )
    .map((r) => time(fechaEfectivaRegistroFenologico(r)));
  candidates.push(harvest);
  const recent = candidates.filter(
    (t) =>
      Number.isFinite(t) &&
      t >= yearStart &&
      t <= end &&
      (!Number.isFinite(planted) || t >= planted),
  );
  const desde = Math.max(
    yearStart,
    Number.isFinite(planted) ? planted : yearStart,
    ...recent,
  );
  return desde <= end
    ? {
        desde,
        hasta: end,
        reason: recent.length ? 'poscosecha' : 'anio_actual',
      }
    : undefined;
}

export interface HistoryPoint {
  date: string;
  values: Record<string, unknown>;
}
export interface HistoryLine {
  key: string;
  name: string;
  color: string;
  minValue?: number;
  maxValue?: number;
}

export interface HistorySummarySpec {
  key: string;
  label: string;
  unit: string;
  operation: 'sum' | 'mean' | 'min' | 'max' | 'latest' | 'below' | 'above';
  threshold?: number;
  minValue?: number;
  maxValue?: number;
  decimals?: number;
}

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const fmt = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const dateLabel = (date: string) => date.split('-').reverse().join('/');
const valid = (v: unknown, limits: { minValue?: number; maxValue?: number }): v is number =>
  finite(v) && v >= (limits.minValue ?? -Infinity) && v <= (limits.maxValue ?? Infinity);

/** One row per closed daily date. Conflicting duplicates are unknown, not added. */
export function historyPoints(points: HistoryPoint[], from: number, to: number): HistoryPoint[] {
  const unique = new Map<string, HistoryPoint>();
  for (const p of points) {
    const t = time(p.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(t) ||
        new Date(t).toISOString().slice(0, 10) !== p.date || t < from || t > to) continue;
    const previous = unique.get(p.date);
    const values = { ...p.values };
    if (previous) for (const key of new Set([...Object.keys(values), ...Object.keys(previous.values)])) {
      values[key] = Object.is(values[key], previous.values[key]) ? values[key] : undefined;
    }
    unique.set(p.date, { date: p.date, values });
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Descriptive statistics only; no recalculation of agronomic model outputs. */
export function summarizeHistory(points: HistoryPoint[], from: number, to: number, spec: HistorySummarySpec) {
  const rows = historyPoints(points, from, to)
    .map(p => ({ date: p.date, value: p.values[spec.key] }))
    .filter((p): p is { date: string; value: number } => valid(p.value, spec));
  const count = rows.length;
  const expected = Math.max(0, Math.floor((to - from) / DAY) + 1);
  if (!count) return { value: undefined, count, expected, date: undefined };
  const values = rows.map(p => p.value);
  let selected: { date: string; value: number } | undefined;
  let value: number;
  switch (spec.operation) {
    case 'latest': selected = rows.at(-1)!; value = selected.value; break;
    case 'min': selected = rows.reduce((a, b) => b.value < a.value ? b : a); value = selected.value; break;
    case 'max': selected = rows.reduce((a, b) => b.value > a.value ? b : a); value = selected.value; break;
    case 'below': value = values.filter(v => v < (spec.threshold ?? 0)).length; break;
    case 'above': value = values.filter(v => v > (spec.threshold ?? 0)).length; break;
    case 'mean': value = values.reduce((a, b) => a + b, 0) / count; break;
    case 'sum': value = values.reduce((a, b) => a + b, 0); break;
  }
  return { value, count, expected, date: selected?.date };
}

export function renderHistorySummary(input: {
  points: HistoryPoint[]; from: number; to: number; summaries: HistorySummarySpec[]; note?: string;
}): string {
  const cards = input.summaries.map(spec => {
    const result = summarizeHistory(input.points, input.from, input.to, spec);
    const number = result.value?.toLocaleString('es-AR', { maximumFractionDigits: spec.decimals ?? 1 });
    const unit = spec.unit === 'dias' && result.value === 1 ? 'dia' : spec.unit;
    return `<div class="history-stat"><span>${escape(spec.label)}</span><strong>${result.value === undefined ? 'Sin dato' : `${escape(number)} ${escape(unit)}`}</strong><small>${result.date ? `${escape(dateLabel(result.date))} · ` : ''}${result.count}/${result.expected} dias con dato</small></div>`;
  }).join('');
  return `<div class="history-summary">${cards}</div>${input.note ? `<p class="history-note">${escape(input.note)}</p>` : ''}`;
}

/** Date-scaled SVG; missing/invalid values and missing days break the line. */
export function renderHistoryChart(input: {
  title: string;
  unit: string;
  points: HistoryPoint[];
  lines: HistoryLine[];
  from: number;
  to: number;
  bounds?: [number, number];
  summaries?: HistorySummarySpec[];
  note?: string;
}): string {
  const { title, unit, lines, from, to } = input;
  const points = historyPoints(input.points, from, to);
  const all = points.flatMap((p) =>
    lines.flatMap(l => valid(p.values[l.key], l) ? [p.values[l.key] as number] : []),
  );
  const plotted = points.filter(p => lines.some(l => valid(p.values[l.key], l)));
  const plotFrom = plotted.length ? time(plotted[0].date) : from;
  const plotTo = plotted.length ? time(plotted.at(-1)!.date) : to;
  const header = `<header><strong>${escape(title)}</strong><small>${escape(unit)}${plotted.length ? ` · Datos graficados: ${dateLabel(plotted[0].date)} a ${dateLabel(plotted.at(-1)!.date)}` : ''}</small></header>`;
  const summary = renderHistorySummary({ ...input, summaries: input.summaries || [], points });
  if (!all.length)
    return `<article class="thermal-chart history-chart">${header}<p class="history-note">Sin datos historicos suficientes para este periodo.</p>${summary}</article>`;
  const min = input.bounds?.[0] ?? Math.min(0, ...all);
  const max = input.bounds?.[1] ?? Math.max(min + 1, ...all);
  const left = 60,
    right = 740,
    top = 24,
    bottom = 215;
  const x = (t: number) =>
    plotFrom === plotTo ? (left + right) / 2 : left + ((t - plotFrom) / (plotTo - plotFrom)) * (right - left);
  const y = (v: number) =>
    bottom - ((v - min) / Math.max(1, max - min)) * (bottom - top);
  const grid = [0, 0.5, 1]
    .map((f) => {
      const value = min + f * (max - min),
        py = y(value);
      return `<line x1="${left}" x2="${right}" y1="${py}" y2="${py}" stroke="#dce7f0"/><text x="52" y="${py + 4}" text-anchor="end" fill="#60708c" font-size="14">${escape(fmt(value))}</text>`;
    })
    .join('');
  const curves = lines
    .map((line) => {
      let path = '',
        previous: number | undefined;
      const dots: string[] = [];
      for (const p of points) {
        const v = p.values[line.key],
          t = time(p.date);
        if (!valid(v, line) || v < min || v > max) {
          previous = undefined;
          continue;
        }
        path += `${previous === undefined || t - previous > DAY ? 'M' : 'L'}${x(t).toFixed(2)},${y(v).toFixed(2)} `;
        dots.push(
          `<circle cx="${x(t).toFixed(2)}" cy="${y(v).toFixed(2)}" r="1.5" fill="${line.color}"><title>${escape(p.date)} - ${escape(line.name)}: ${escape(fmt(v))} ${escape(unit)}</title></circle>`,
        );
        previous = t;
      }
      return `<path data-series="${escape(line.key)}" d="${path.trim()}" fill="none" stroke="${line.color}" stroke-width="2"/>${dots.join('')}`;
    })
    .join('');
  const dateTicks = plotFrom === plotTo ? [plotFrom] : [plotFrom, plotFrom + (plotTo - plotFrom) / 2, plotTo];
  const dates = dateTicks
    .map(
      (t, i) =>
        `<text x="${x(t)}" y="245" text-anchor="${dateTicks.length === 1 ? 'middle' : i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}" font-size="14" fill="#60708c">${dateLabel(new Date(t).toISOString().slice(0, 10))}</text>`,
    )
    .join('');
  const legend = lines
    .map(
      (l) =>
        `<span style="display:inline-block;margin:4px 12px 0 0"><span style="display:inline-block;width:20px;border-top:3px solid ${l.color};vertical-align:middle"></span> ${escape(l.name)}</span>`,
    )
    .join('');
  return `<article class="thermal-chart history-chart">${header}<svg viewBox="0 0 760 260" role="img" aria-label="${escape(title)}">${grid}${curves}${dates}</svg><div class="history-legend">${legend}</div>${summary}</article>`;
}
