import { IRespuestaAgrometeorologiaSiembra, ISiembra } from 'modelos/src';
import { hash } from './contract';

/** Only a public projection of the canonical result; no formula, thresholds or raw series. */
export function projectPhenology(
  externalId: string,
  sowing: ISiembra,
  snapshot: IRespuestaAgrometeorologiaSiembra | undefined,
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10);
  const date = (value: unknown) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  const start = String(sowing.fechaSiembra || '').slice(0, 10);
  const rows = (snapshot?.series || [])
    .filter(
      (day) =>
        date(day.date) &&
        day.date <= today &&
        day.date >= start &&
        // isForecast describes the weather row, not an independently confirmed
        // field stage. Today's canonical observation must not be hidden until
        // tomorrow's weather close. All unobserved forecasts stay excluded.
        (day.isForecast === false ||
          (day.isForecast === true && day.stageSource === 'campo')) &&
        typeof day.stage === 'string' &&
        day.stage.trim(),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows[rows.length - 1];
  const origins = {
    campo: 'observada',
    proyeccion_anclada_campo: 'estimada_con_observacion',
    gdd_validado: 'estimada_termica',
    cronograma_referencia: 'referencia_calendario',
    rango_termico_referencia: 'referencia_termica',
    seguimiento: 'seguimiento',
  };
  const origin = origins[latest?.stageSource] || 'no_disponible';
  const retired = sowing.activa === false || !!sowing.fechaCosecha;
  const status = retired
    ? 'cosechada'
    : !latest
      ? 'pendiente'
      : Date.parse(today) - Date.parse(latest.date) > 2 * 86400000
        ? 'desactualizada'
        : 'disponible';
  const publicResult = {
    siembraIdExterno: externalId,
    cultivo: sowing.semilla?.cultivo || null,
    variedad: sowing.semilla?.variedad || null,
    fechaSiembra: start || null,
    estado: status,
    etapa: latest?.stage.trim() || null,
    fechaDato: latest?.date || null,
    origen: origin,
    confirmadaEnCampo: latest?.stageSource === 'campo',
    confianza: ['alta', 'media', 'referencia'].includes(latest?.stageConfidence)
      ? latest.stageConfidence
      : null,
    actualizadoEn: snapshot?.dataSource?.lastCalculatedAt || null,
  };
  return {
    ...publicResult,
    revision: hash(JSON.stringify(publicResult)),
    consultadoEn: now.toISOString(),
  };
}
