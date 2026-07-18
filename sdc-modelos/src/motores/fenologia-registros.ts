import { esCultivoPerenne } from '../entidades/crono';
import {
  IRegistroFenologico,
  ISiembra,
} from '../entidades/siembra';

export function registroFenologicoPuedeGobernarDecision(
  registro: IRegistroFenologico,
): boolean {
  const cobertura =
    registro.coberturaObservadaPct === undefined ||
    registro.coberturaObservadaPct === null
      ? undefined
      : Number(registro.coberturaObservadaPct);
  return (
    registro.confianza !== 'baja' &&
    (cobertura === undefined || (Number.isFinite(cobertura) && cobertura > 0))
  );
}

export function fechaEfectivaRegistroFenologico(
  registro: IRegistroFenologico,
): string | undefined {
  const observacionPuntual =
    registro.tipoEvento === 'observacion' ||
    (registro.accion === 'observacion' && !registro.fechaInicioEtapa);
  const raw = observacionPuntual
    ? registro.fecha || registro.fechaObservacion || registro.creadoEn
    : registro.fechaInicioEtapa ||
      registro.fecha ||
      registro.fechaObservacion ||
      registro.creadoEn;
  const parsed = raw ? new Date(raw) : undefined;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : undefined;
}

export function registrosFenologicosVigentes(
  registros: IRegistroFenologico[] = [],
): IRegistroFenologico[] {
  const reemplazados = new Set(
    registros
      .map((registro) => String(registro.reemplazaRegistroId || '').trim())
      .filter(Boolean),
  );
  return registros.filter(
    (registro) =>
      !registro.id || !reemplazados.has(String(registro.id).trim()),
  );
}

export function obtenerRegistroFenologicoDecisorioEnFecha(
  siembra: ISiembra | undefined,
  fechaObjetivo: Date,
): IRegistroFenologico | undefined {
  if (!siembra || Number.isNaN(fechaObjetivo.getTime())) {
    return undefined;
  }
  const objetivoKey = fechaObjetivo.toISOString().slice(0, 10);
  const campaniaEsperada = campaniaFenologicaParaFecha(
    siembra,
    fechaObjetivo,
  );
  const cultivoSiembra = normalizar(siembra.semilla?.cultivo);
  const implantacion = fechaValida(siembra.fechaSiembra)?.getTime();
  const cosecha = fechaValida(siembra.fechaCosecha)?.getTime();
  const objetivo = fechaObjetivo.getTime();

  // Una observacion previa a cosecha no puede certificar una escena o una
  // decision posterior al cierre del ciclo. En poscosecha solo corresponde
  // usar una referencia estimada/no confirmada o iniciar una nueva campania.
  if (cosecha !== undefined && objetivo > cosecha) {
    return undefined;
  }

  return registrosFenologicosVigentes(siembra.registrosFenologicos || [])
    .map((registro) => ({
      registro,
      fechaIso: fechaEfectivaRegistroFenologico(registro),
    }))
    .filter(({ registro, fechaIso }) => {
      if (
        !registro.etapa ||
        !fechaIso ||
        !registroFenologicoPuedeGobernarDecision(registro)
      ) {
        return false;
      }
      const time = new Date(fechaIso).getTime();
      if (
        !Number.isFinite(time) ||
        time > objetivo ||
        (implantacion !== undefined && time < implantacion) ||
        (cosecha !== undefined && time > cosecha)
      ) {
        return false;
      }
      if (
        registro.idSiembra &&
        siembra._id &&
        String(registro.idSiembra) !== String(siembra._id)
      ) {
        return false;
      }
      if (
        registro.idLote &&
        siembra.idLote &&
        String(registro.idLote) !== String(siembra.idLote)
      ) {
        return false;
      }
      const cultivoRegistro = normalizar(registro.cultivo);
      if (
        cultivoRegistro &&
        cultivoSiembra &&
        cultivoRegistro !== cultivoSiembra
      ) {
        return false;
      }
      if (
        registro.campania &&
        normalizarCampania(registro.campania) !==
          normalizarCampania(campaniaEsperada)
      ) {
        return false;
      }
      const observacionPuntual =
        registro.tipoEvento === 'observacion' ||
        (registro.accion === 'observacion' && !registro.fechaInicioEtapa);
      return !observacionPuntual || fechaIso.slice(0, 10) === objetivoKey;
    })
    .sort(
      (a, b) =>
        new Date(b.fechaIso as string).getTime() -
          new Date(a.fechaIso as string).getTime() ||
        (fechaValida(b.registro.actualizadoEn)?.getTime() || 0) -
          (fechaValida(a.registro.actualizadoEn)?.getTime() || 0) ||
        String(b.registro.id || '').localeCompare(
          String(a.registro.id || ''),
        ),
    )[0]?.registro;
}

export function campaniaFenologicaParaFecha(
  siembra: ISiembra,
  fechaObjetivo: Date,
): string {
  if (esCultivoPerenne(siembra.semilla?.cultivo)) {
    const year =
      fechaObjetivo.getUTCMonth() >= 6
        ? fechaObjetivo.getUTCFullYear()
        : fechaObjetivo.getUTCFullYear() - 1;
    return `${year}/${year + 1}`;
  }
  const implantacion =
    fechaValida(siembra.fechaSiembra) || fechaObjetivo;
  const year = implantacion.getUTCFullYear();
  return `${year}/${year + 1}`;
}

function fechaValida(value?: string | Date): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizar(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizarCampania(value?: string): string {
  const years = String(value || '').match(/\d{4}/g);
  if (years && years.length >= 2) {
    return `${years[0]}/${years[1]}`;
  }
  return normalizar(value);
}
