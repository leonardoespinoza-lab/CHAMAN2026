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

/** Date-scaled SVG; missing/invalid values and missing days break the line. */
export function renderHistoryChart(input: {
  title: string;
  unit: string;
  points: HistoryPoint[];
  lines: HistoryLine[];
  from: number;
  to: number;
  bounds?: [number, number];
}): string {
  const { title, unit, lines, from, to } = input;
  const unique = new Map<string, HistoryPoint>();
  for (const p of input.points) {
    const t = time(p.date);
    if (Number.isFinite(t) && t >= from && t <= to) unique.set(p.date, p);
  }
  const points = [...unique.values()].sort(
    (a, b) => time(a.date) - time(b.date),
  );
  const all = points.flatMap((p) =>
    lines.map((l) => p.values[l.key]).filter(finite),
  );
  const header = `<header><strong>${escape(title)}</strong><small>${escape(unit)}</small></header>`;
  if (!all.length)
    return `<article class="thermal-chart">${header}<p>Sin datos historicos suficientes para este periodo.</p></article>`;
  const min = input.bounds?.[0] ?? Math.min(0, ...all);
  const max = input.bounds?.[1] ?? Math.max(min + 1, ...all);
  const left = 60,
    right = 502,
    top = 24,
    bottom = 192;
  const x = (t: number) =>
    left + ((t - from) / Math.max(DAY, to - from)) * (right - left);
  const y = (v: number) =>
    bottom - ((v - min) / Math.max(1, max - min)) * (bottom - top);
  const fmt = (v: number) =>
    v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  const grid = [0, 0.5, 1]
    .map((f) => {
      const value = min + f * (max - min),
        py = y(value);
      return `<line x1="${left}" x2="${right}" y1="${py}" y2="${py}" stroke="#dce7f0"/><text x="52" y="${py + 4}" text-anchor="end" fill="#60708c" font-size="11">${escape(fmt(value))}</text>`;
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
        if (!finite(v) || v < min || v > max) {
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
  const dates = [from, from + (to - from) / 2, to]
    .map(
      (t, i) =>
        `<text x="${x(t)}" y="216" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}" font-size="11" fill="#60708c">${new Date(t).toISOString().slice(0, 10)}</text>`,
    )
    .join('');
  const legend = lines
    .map(
      (l) =>
        `<span style="display:inline-block;margin:4px 12px 0 0"><span style="display:inline-block;width:20px;border-top:3px solid ${l.color};vertical-align:middle"></span> ${escape(l.name)}</span>`,
    )
    .join('');
  return `<article class="thermal-chart">${header}<svg viewBox="0 0 520 232" role="img" aria-label="${escape(title)}">${grid}${curves}${dates}</svg><div>${legend}</div></article>`;
}
