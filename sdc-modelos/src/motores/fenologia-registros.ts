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
        !registroFenologicoPerteneceCampania(
          siembra,
          registro,
          fechaObjetivo,
        )
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
    // La campania operativa perenne comienza con la temporada de frio. Mayo y
    // junio pertenecen al ciclo productivo que continuara luego del 1 de julio;
    // el 1-jul sigue siendo solamente el ancla del cronograma de referencia.
    const year =
      fechaObjetivo.getUTCMonth() >= 4
        ? fechaObjetivo.getUTCFullYear()
        : fechaObjetivo.getUTCFullYear() - 1;
    return `${year}/${year + 1}`;
  }
  const implantacion =
    fechaValida(siembra.fechaSiembra) || fechaObjetivo;
  const year = implantacion.getUTCFullYear();
  return `${year}/${year + 1}`;
}

/**
 * Compara un registro con la campania operativa canonica. Tambien admite los
 * inicios de mayo-junio ya guardados con la antigua frontera del 1-jul, para
 * conservar su trazabilidad sin una migracion destructiva de datos.
 */
export function registroFenologicoPerteneceCampania(
  siembra: ISiembra,
  registro: IRegistroFenologico,
  fechaObjetivo: Date,
): boolean {
  if (!registro.campania) {
    if (!esCultivoPerenne(siembra.semilla?.cultivo)) return true;
    const fechaRegistro = fechaValida(
      fechaEfectivaRegistroFenologico(registro),
    );
    return !!(
      fechaRegistro &&
      normalizarCampania(
        campaniaFenologicaParaFecha(siembra, fechaRegistro),
      ) ===
        normalizarCampania(
          campaniaFenologicaParaFecha(siembra, fechaObjetivo),
        )
    );
  }
  const campaniaRegistro = normalizarCampania(registro.campania);
  if (
    campaniaRegistro ===
    normalizarCampania(campaniaFenologicaParaFecha(siembra, fechaObjetivo))
  ) {
    return true;
  }
  if (!esCultivoPerenne(siembra.semilla?.cultivo)) return false;

  const fechaRegistro = fechaValida(fechaEfectivaRegistroFenologico(registro));
  if (!fechaRegistro || ![4, 5].includes(fechaRegistro.getUTCMonth())) {
    return false;
  }
  if (
    normalizarCampania(
      campaniaFenologicaParaFecha(siembra, fechaRegistro),
    ) !==
    normalizarCampania(campaniaFenologicaParaFecha(siembra, fechaObjetivo))
  ) {
    return false;
  }
  const year = fechaRegistro.getUTCFullYear() - 1;
  return campaniaRegistro === `${year}/${year + 1}`;
}

/**
 * Devuelve el registro de campo que ancla el inicio de la temporada de frio
 * de la campania perenne vigente. Una observacion puntual nunca se transforma
 * en un inicio persistente. No exige que exista un objetivo varietal.
 */
export function obtenerInicioTemporadaFrioObservado(
  siembra: ISiembra | undefined,
  fechaObjetivo: Date,
): IRegistroFenologico | undefined {
  if (
    !siembra ||
    !esCultivoPerenne(siembra.semilla?.cultivo) ||
    Number.isNaN(fechaObjetivo.getTime())
  ) {
    return undefined;
  }
  const cultivoSiembra = normalizar(siembra.semilla?.cultivo);
  const objetivo = fechaObjetivo.getTime();

  return registrosFenologicosVigentes(siembra.registrosFenologicos || [])
    .map((registro) => ({
      registro,
      fechaIso: fechaEfectivaRegistroFenologico(registro),
      biofixExplicito: (registro.objetivosBiofix || []).includes(
        'inicio_acumulacion_frio',
      ),
    }))
    .filter(({ registro, fechaIso }) => {
      const observacionPuntual =
        registro.tipoEvento === 'observacion' ||
        (registro.accion === 'observacion' && !registro.fechaInicioEtapa);
      if (
        observacionPuntual ||
        !fechaIso ||
        !registroFenologicoPuedeGobernarDecision(registro)
      ) {
        return false;
      }
      const fecha = new Date(fechaIso).getTime();
      if (!Number.isFinite(fecha) || fecha > objetivo) return false;
      if (
        !registroFenologicoPerteneceCampania(
          siembra,
          registro,
          fechaObjetivo,
        )
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
      const etapa = normalizar(registro.etapa).replace(/[^A-Z0-9]+/g, '_');
      return (
        (registro.objetivosBiofix || []).includes('inicio_acumulacion_frio') ||
        ['DORMANCIA', 'REPOSO', 'REPOSO_INVERNAL'].includes(etapa)
      );
    })
    .sort(
      (a, b) =>
        Number(b.biofixExplicito) - Number(a.biofixExplicito) ||
        new Date(a.fechaIso as string).getTime() -
          new Date(b.fechaIso as string).getTime() ||
        (fechaValida(b.registro.actualizadoEn)?.getTime() || 0) -
          (fechaValida(a.registro.actualizadoEn)?.getTime() || 0),
    )[0]?.registro;
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
