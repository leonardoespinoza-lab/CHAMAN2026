import {
  construirHitosFenologiaArveja,
  ICalidadDatoMotor,
  IFenologiaReferencia,
  IRegistroFenologico,
  ISiembra,
  registroFenologicoPuedeGobernarDecision as registroFenologicoPuedeGobernarDecisionCanonico,
} from 'modelos/src';

export type TCultivoFenologiaManual =
  | 'Trigo'
  | 'Soja'
  | 'Maiz'
  | 'Cebada'
  | 'Arveja';

export type TAplicacionRegistroFenologico = 'observacion_puntual' | 'reanclaje';

export interface IRegistroFenologicoAplicable {
  registro: IRegistroFenologico;
  tipoAplicacion: TAplicacionRegistroFenologico;
  fechaRegistro: string;
  diasDesdeRegistro: number;
}

export interface IContextoFenologicoManual {
  observacion?: IRegistroFenologicoAplicable;
  anclaje?: IRegistroFenologicoAplicable;
}

export function registroFenologicoPuedeGobernarDecision(
  registro: IRegistroFenologico,
): boolean {
  return registroFenologicoPuedeGobernarDecisionCanonico(registro);
}

export function calidadFenologiaManual(
  aplicable: IRegistroFenologicoAplicable,
): ICalidadDatoMotor {
  const registro = aplicable.registro;
  const coberturaPct =
    registro.coberturaObservadaPct === undefined ||
    registro.coberturaObservadaPct === null
      ? undefined
      : Number(registro.coberturaObservadaPct);
  const tieneCobertura = Number.isFinite(coberturaPct);
  const limitaciones: string[] = [];
  if (!registro.confianza) {
    limitaciones.push(
      'El registro de campo legacy no declara confianza explicita; se trata como confianza media.',
    );
  }
  if (!tieneCobertura) {
    limitaciones.push(
      'El registro de campo no declara cobertura observada.',
    );
  }
  return {
    nivel: registro.confianza === 'alta' ? 'alta' : 'media',
    fuente: 'manual',
    cobertura: tieneCobertura
      ? Math.max(0, Math.min(1, coberturaPct / 100))
      : undefined,
    fechaActualizacion:
      registro.actualizadoEn ||
      registro.creadoEn ||
      aplicable.fechaRegistro,
    fallback: false,
    resumen:
      aplicable.tipoAplicacion === 'observacion_puntual'
        ? 'Etapa observada a campo para la fecha evaluada.'
        : 'Etapa proyectada desde un inicio de etapa registrado a campo.',
    limitaciones,
  };
}

export interface IEtapaCronologica<T extends number | string> {
  etapa: T;
  /**
   * Dias completos desde el inicio de esta etapa hasta el inicio de la
   * siguiente. La etapa final no necesita duracion.
   */
  duracionDias?: number;
}

export interface IEtapaFenologicaObservada<
  T extends number | string = number | string,
> extends IRegistroFenologicoAplicable {
  etapa: T;
  etapaRegistrada: T;
}

export function aplicarEtapaFenologicaObservada<T extends number | string>(
  etapaCrono: T,
  observada?: IEtapaFenologicaObservada<T>,
): T {
  return observada?.etapa ?? etapaCrono;
}

const normalizar = (value?: string): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const ETAPAS_NUMERICAS: Record<string, Array<string[]>> = {
  TRIGO: [
    ['SIEMBRA'],
    ['EMERGENCIA'],
    ['ESPIGUILLA TERMINAL', 'PRIMER NUDO'],
    ['HOJA BANDERA'],
    ['ESPIGAZON'],
    ['ANTESIS'],
    ['LLENADO DE GRANOS', 'LLENADO'],
    ['MADUREZ FISIOLOGICA', 'MADUREZ'],
  ],
  MAIZ: [
    ['SIEMBRA'],
    ['EMERGENCIA'],
    ['FLORACION', 'VT', 'R1'],
    ['MADUREZ', 'MADUREZ FISIOLOGICA', 'R6'],
  ],
  CEBADA: [
    ['SIEMBRA'],
    ['EMERGENCIA'],
    ['PRIMER NUDO'],
    ['HOJA BANDERA'],
    ['ESPIGAZON'],
    ['ANTESIS'],
    ['LLENADO DE GRANOS', 'LLENADO'],
    ['MADUREZ FISIOLOGICA', 'MADUREZ'],
  ],
};

const ETAPAS_SOJA: Array<{ aliases: string[]; etapa: string }> = [
  { aliases: ['SIEMBRA'], etapa: 'Siembra' },
  { aliases: ['EMERGENCIA'], etapa: 'Emergencia' },
  { aliases: ['R1', 'FLORACION', 'INICIO DE FLORACION'], etapa: 'R1' },
  { aliases: ['R3', 'FRUCTIFICACION', 'FORMACION DE VAINAS'], etapa: 'R3' },
  { aliases: ['R5', 'INICIO DE LLENADO', 'LLENADO'], etapa: 'R5' },
  { aliases: ['R7', 'MADUREZ', 'MADUREZ FISIOLOGICA'], etapa: 'R7' },
];

const ETAPAS_ARVEJA: Array<{ aliases: string[]; etapa: string }> = [
  { aliases: ['S', 'SIEMBRA', 'PREEMERGENCIA'], etapa: 'S' },
  {
    aliases: ['E', 'EMERGENCIA', 'DESARROLLO VEGETATIVO'],
    etapa: 'E',
  },
  { aliases: ['R1', 'INICIO DE FLORACION', 'FLORACION'], etapa: 'R1' },
  {
    aliases: ['R3', 'FIN DE FLORACION', 'FORMACION DE VAINAS'],
    etapa: 'R3',
  },
  { aliases: ['MF', 'MADUREZ FISIOLOGICA', 'MADUREZ'], etapa: 'MF' },
];

export function getContextoFenologicoManual(
  siembra: ISiembra,
  fecha: Date,
  cultivo: TCultivoFenologiaManual,
): IContextoFenologicoManual {
  const fechaObjetivo = fechaKey(fecha);
  if (!fechaObjetivo || !fechaCompatibleConSiembra(siembra, fechaObjetivo)) {
    return {};
  }

  const registros = getRegistrosFenologicosVigentes(siembra)
    .map((registro) => {
      const tipoAplicacion = getTipoAplicacion(registro);
      const fechaRegistro = getFechaEfectiva(registro, tipoAplicacion);
      return {
        registro,
        tipoAplicacion,
        fechaRegistro,
        fechaKey: fechaKey(fechaRegistro),
        ordenActualizacion: getOrdenActualizacion(registro),
      };
    })
    .filter(
      (item) =>
        !!item.registro.etapa &&
        registroFenologicoPuedeGobernarDecision(item.registro) &&
        !!item.fechaKey &&
        item.fechaKey <= fechaObjetivo &&
        registroCompatible(siembra, item.registro, cultivo, item.fechaKey),
    )
    .sort((a, b) => {
      const fechaComparada = b.fechaKey.localeCompare(a.fechaKey);
      if (fechaComparada !== 0) return fechaComparada;
      if (a.ordenActualizacion !== b.ordenActualizacion) {
        return b.ordenActualizacion - a.ordenActualizacion;
      }
      return String(b.registro.id || '').localeCompare(
        String(a.registro.id || ''),
      );
    });

  const convertir = (
    item: (typeof registros)[number] | undefined,
  ): IRegistroFenologicoAplicable | undefined =>
    item
      ? {
          registro: item.registro,
          tipoAplicacion: item.tipoAplicacion,
          fechaRegistro: item.fechaRegistro,
          diasDesdeRegistro: diferenciaDias(item.fechaKey, fechaObjetivo),
        }
      : undefined;

  return {
    observacion: convertir(
      registros.find(
        (item) =>
          item.tipoAplicacion === 'observacion_puntual' &&
          item.fechaKey === fechaObjetivo,
      ),
    ),
    anclaje: convertir(
      registros.find((item) => item.tipoAplicacion === 'reanclaje'),
    ),
  };
}

/**
 * Compatibilidad para consumidores legacy: prioriza la observacion del dia y,
 * si no existe, devuelve el ultimo anclaje vigente. No debe usarse por si solo
 * para fijar indefinidamente una etapa.
 */
export function getUltimoRegistroFenologicoObservado(
  siembra: ISiembra,
  fecha: Date,
  cultivo?: TCultivoFenologiaManual,
): IRegistroFenologico | undefined {
  const cultivoAplicable =
    cultivo ||
    (canonicalCultivo(siembra.semilla?.cultivo) as TCultivoFenologiaManual);
  if (!cultivoAplicable) return undefined;
  const contexto = getContextoFenologicoManual(
    siembra,
    fecha,
    cultivoAplicable,
  );
  return contexto.observacion?.registro || contexto.anclaje?.registro;
}

export function resolverEtapaFenologicaRegistro(
  cultivo: TCultivoFenologiaManual,
  registro: IRegistroFenologico,
): number | string | undefined {
  const etapaNormalizada = normalizar(registro.codigoEtapa || registro.etapa);
  if (!etapaNormalizada) return undefined;

  if (cultivo === 'Soja') {
    return ETAPAS_SOJA.find((item) =>
      item.aliases.some((alias) => coincideEtapa(etapaNormalizada, alias)),
    )?.etapa;
  }

  if (cultivo === 'Arveja') {
    return ETAPAS_ARVEJA.find((item) =>
      item.aliases.some((alias) => coincideEtapa(etapaNormalizada, alias)),
    )?.etapa;
  }

  const index = ETAPAS_NUMERICAS[normalizar(cultivo)]?.findIndex((aliases) =>
    aliases.some((alias) => coincideEtapa(etapaNormalizada, alias)),
  );
  return index >= 0 ? index : undefined;
}

export function resolverEtapaFenologicaObservada<T extends number | string>(
  siembra: ISiembra,
  fecha: Date,
  cultivo: Exclude<TCultivoFenologiaManual, 'Arveja'>,
  cronologia?: IEtapaCronologica<T>[],
): IEtapaFenologicaObservada<T> | undefined {
  const contexto = getContextoFenologicoManual(siembra, fecha, cultivo);
  const registroAplicable = contexto.observacion || contexto.anclaje;
  if (!registroAplicable) return undefined;

  const etapaRegistrada = resolverEtapaFenologicaRegistro(
    cultivo,
    registroAplicable.registro,
  ) as T | undefined;
  if (etapaRegistrada === undefined) return undefined;

  if (registroAplicable.tipoAplicacion === 'observacion_puntual') {
    return {
      ...registroAplicable,
      etapa: etapaRegistrada,
      etapaRegistrada,
    };
  }

  if (!cronologia?.length) {
    return registroAplicable.diasDesdeRegistro === 0
      ? {
          ...registroAplicable,
          etapa: etapaRegistrada,
          etapaRegistrada,
        }
      : undefined;
  }

  const etapa = avanzarCronologia(
    cronologia,
    etapaRegistrada,
    registroAplicable.diasDesdeRegistro,
  );
  return etapa === undefined
    ? undefined
    : {
        ...registroAplicable,
        etapa,
        etapaRegistrada,
      };
}

/**
 * Umbral central utilizado por el propio motor termico de Arveja. R3 queda
 * deliberadamente sin umbral porque la referencia cargada no permite
 * calcularlo.
 */
export function getUmbralGddEtapaArveja(
  referencia: IFenologiaReferencia | undefined,
  etapa: string | undefined,
): number | undefined {
  const codigo = resolverEtapaFenologicaRegistro('Arveja', {
    etapa,
  }) as string | undefined;
  if (!codigo) return undefined;
  const hito = construirHitosFenologiaArveja(referencia).find(
    (item) => item.codigo === codigo,
  );
  if (codigo === 'S') return 0;
  if (
    !hito?.calculable ||
    !Number.isFinite(hito.umbralMinGdd) ||
    !Number.isFinite(hito.umbralMaxGdd)
  ) {
    return undefined;
  }
  return (Number(hito.umbralMinGdd) + Number(hito.umbralMaxGdd)) / 2;
}

export function reanclarGddFenologico(
  gddActual: number,
  gddEnFechaRegistro: number,
  umbralEtapa: number,
): number {
  if (
    !Number.isFinite(gddActual) ||
    !Number.isFinite(gddEnFechaRegistro) ||
    !Number.isFinite(umbralEtapa)
  ) {
    return gddActual;
  }
  return Math.max(0, gddActual + umbralEtapa - gddEnFechaRegistro);
}

function getRegistrosFenologicosVigentes(
  siembra: ISiembra,
): IRegistroFenologico[] {
  const registros = [...(siembra.registrosFenologicos || [])];
  const idsReemplazados = new Set(
    registros
      .map((registro) => String(registro.reemplazaRegistroId || '').trim())
      .filter(Boolean),
  );
  return registros.filter(
    (registro) =>
      !registro.id || !idsReemplazados.has(String(registro.id).trim()),
  );
}

function registroCompatible(
  siembra: ISiembra,
  registro: IRegistroFenologico,
  cultivo: TCultivoFenologiaManual,
  fechaRegistro: string,
): boolean {
  const cultivoRegistro = canonicalCultivo(registro.cultivo);
  if (cultivoRegistro && cultivoRegistro !== cultivo) return false;
  if (
    registro.idSiembra &&
    siembra._id &&
    String(registro.idSiembra) !== String(siembra._id)
  ) {
    return false;
  }

  const campaniaEsperada = getCampaniaSiembra(siembra);
  if (
    registro.campania &&
    campaniaEsperada &&
    normalizarCampania(registro.campania) !==
      normalizarCampania(campaniaEsperada)
  ) {
    return false;
  }

  const implantacion = fechaKey(siembra.fechaSiembra);
  if (implantacion && fechaRegistro < implantacion) return false;
  const cosecha = fechaKey(siembra.fechaCosecha);
  if (cosecha && fechaRegistro > cosecha) return false;
  return true;
}

function fechaCompatibleConSiembra(
  siembra: ISiembra,
  fechaObjetivo: string,
): boolean {
  const implantacion = fechaKey(siembra.fechaSiembra);
  if (implantacion && fechaObjetivo < implantacion) return false;
  const cosecha = fechaKey(siembra.fechaCosecha);
  return !cosecha || fechaObjetivo <= cosecha;
}

function getCampaniaSiembra(siembra: ISiembra): string | undefined {
  const implantacion = parseFecha(siembra.fechaSiembra);
  if (!implantacion) return undefined;
  const year = implantacion.getUTCFullYear();
  return `${year}/${year + 1}`;
}

function normalizarCampania(value?: string): string {
  const years = String(value || '').match(/\d{4}/g);
  if (years?.length >= 2) return `${years[0]}/${years[1]}`;
  return normalizar(value);
}

function canonicalCultivo(value?: string): string {
  const cultivos: Record<string, string> = {
    TRIGO: 'Trigo',
    SOJA: 'Soja',
    MAIZ: 'Maiz',
    CEBADA: 'Cebada',
    ARVEJA: 'Arveja',
  };
  return cultivos[normalizar(value)] || '';
}

function getTipoAplicacion(
  registro: IRegistroFenologico,
): TAplicacionRegistroFenologico {
  if (
    registro.tipoEvento === 'observacion' ||
    (registro.accion === 'observacion' && !registro.fechaInicioEtapa)
  ) {
    return 'observacion_puntual';
  }
  return 'reanclaje';
}

function getFechaEfectiva(
  registro: IRegistroFenologico,
  tipo: TAplicacionRegistroFenologico,
): string {
  const value =
    tipo === 'observacion_puntual'
      ? registro.fecha || registro.fechaObservacion || registro.creadoEn
      : registro.fechaInicioEtapa ||
        registro.fecha ||
        registro.fechaObservacion ||
        registro.creadoEn;
  return parseFecha(value)?.toISOString() || '';
}

function getOrdenActualizacion(registro: IRegistroFenologico): number {
  return (
    parseFecha(registro.actualizadoEn)?.getTime() ||
    parseFecha(registro.creadoEn)?.getTime() ||
    0
  );
}

function avanzarCronologia<T extends number | string>(
  cronologia: IEtapaCronologica<T>[],
  etapaInicial: T,
  diasDesdeInicio: number,
): T | undefined {
  let index = cronologia.findIndex(
    (item) =>
      normalizar(String(item.etapa)) === normalizar(String(etapaInicial)),
  );
  if (index < 0) return undefined;

  let diasRestantes = Math.max(0, Math.floor(diasDesdeInicio));
  while (index < cronologia.length - 1) {
    const duracion = Number(cronologia[index].duracionDias);
    if (!Number.isFinite(duracion) || duracion < 0) return undefined;
    if (diasRestantes < duracion) break;
    diasRestantes -= duracion;
    index += 1;
  }
  return cronologia[index].etapa;
}

function coincideEtapa(etapaNormalizada: string, alias: string): boolean {
  const aliasNormalizado = normalizar(alias);
  return (
    etapaNormalizada === aliasNormalizado ||
    etapaNormalizada.startsWith(`${aliasNormalizado} -`) ||
    etapaNormalizada.startsWith(`${aliasNormalizado} `) ||
    (aliasNormalizado.length >= 4 &&
      etapaNormalizada.includes(aliasNormalizado))
  );
}

function diferenciaDias(desde: string, hasta: string): number {
  const inicio = parseFecha(`${desde}T00:00:00.000Z`);
  const fin = parseFecha(`${hasta}T00:00:00.000Z`);
  if (!inicio || !fin) return 0;
  return Math.max(
    0,
    Math.floor((fin.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

function fechaKey(value?: string | Date): string {
  return parseFecha(value)?.toISOString().slice(0, 10) || '';
}

function parseFecha(value?: string | Date): Date | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
