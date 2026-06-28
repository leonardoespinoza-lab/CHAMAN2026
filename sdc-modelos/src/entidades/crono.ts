import { IDepartamento } from "./departamento";

export const CULTIVOS_ANUALES = ["Soja", "Trigo", "Maiz", "Papa"] as const;
export const CULTIVOS_PERENNES = ["Vid", "Peral", "Pecan", "Manzano"] as const;
export const CULTIVOS_DISPONIBLES = [
  ...CULTIVOS_ANUALES,
  ...CULTIVOS_PERENNES,
] as const;

export type Cultivo = (typeof CULTIVOS_DISPONIBLES)[number];

export type TipoCicloCultivo = "Anual" | "Perenne";

export function esCultivoPerenne(cultivo?: string): boolean {
  return (
    !!cultivo && (CULTIVOS_PERENNES as readonly string[]).includes(cultivo)
  );
}

export function getTipoCicloCultivo(cultivo?: string): TipoCicloCultivo {
  return esCultivoPerenne(cultivo) ? "Perenne" : "Anual";
}

export function getNombreImplantacion(
  cultivo?: string,
): "Siembra" | "Plantacion" {
  return esCultivoPerenne(cultivo) ? "Plantacion" : "Siembra";
}

export interface IEtapaFenologicaReferencia {
  nombre: string;
  dia: number;
  descripcion?: string;
}

export interface IConfiguracionFrioCultivo {
  requiereFrio: boolean;
  horasFrioObjetivo?: number;
  horasFrioEfectivasObjetivo?: number;
  porcionesFrioObjetivo?: number;
  temperaturaBaseGradosDia?: number;
  gradosDiaBrotacionObjetivo?: number;
  gradosDiaFloracionObjetivo?: number;
  umbralHelada?: number;
}

export type FaseHeladaFenologica =
  | "reposo"
  | "yema"
  | "brotacion"
  | "floracion"
  | "cuaje"
  | "fruto"
  | "madurez"
  | "cosecha";

export interface IUmbralHeladaFenologico {
  cultivo: string;
  etapa: string;
  aliases?: string[];
  fase: FaseHeladaFenologica;
  tempDanoLeveC: number;
  tempDanoSeveroC: number;
  fuente: string;
  descripcion?: string;
}

export interface IContextoHeladaFenologico extends IUmbralHeladaFenologico {
  variedad?: string;
  ajusteVarietalC?: number;
  fuenteAjusteVarietal?: string;
  calibracionVarietal: "base_fenologica" | "variedad" | "semilla";
  etapaDetectada: string;
  fechaEvaluada: string;
}

export interface IResolverContextoHeladaParams {
  cultivo?: string;
  variedad?: string;
  fecha?: string | Date;
  fechaSiembra?: string | Date;
  etapaFenologica?: string;
  etapasFenologia?: Record<string, number | string>;
  ajusteVarietalC?: number;
  ajustesHeladaPorFase?: Partial<Record<FaseHeladaFenologica, number>>;
  fuenteAjusteVarietal?: string;
}

export interface IAjusteHeladaVarietal {
  cultivo: string;
  variedad: string;
  aliases?: string[];
  ajusteUmbralC?: number;
  ajustesPorFase?: Partial<Record<FaseHeladaFenologica, number>>;
  fuente: string;
  observaciones?: string;
}

export const ETAPAS_PERENNES_REFERENCIA: Record<
  string,
  IEtapaFenologicaReferencia[]
> = {
  Pecan: [
    {
      nombre: "Dormancia",
      dia: 0,
      descripcion: "Reposo invernal y acumulacion de frio.",
    },
    {
      nombre: "Brotacion",
      dia: 78,
      descripcion: "Apertura de yemas y expansion foliar inicial.",
    },
    {
      nombre: "Polinizacion",
      dia: 116,
      descripcion: "Amentos liberan polen y estigmas receptivos.",
    },
    {
      nombre: "Estado acuoso",
      dia: 162,
      descripcion: "Crecimiento de nuez con endosperma acuoso.",
    },
    {
      nombre: "Gel",
      dia: 205,
      descripcion: "El interior comienza a gelificar.",
    },
    {
      nombre: "Endurecimiento de cascara",
      dia: 228,
      descripcion: "Inicio del endurecimiento de cascara.",
    },
    {
      nombre: "Masa",
      dia: 258,
      descripcion: "El gel se solidifica y llena la almendra.",
    },
    {
      nombre: "Apertura de ruezno",
      dia: 304,
      descripcion: "El ruezno comienza a abrir.",
    },
    {
      nombre: "Cosecha",
      dia: 334,
      descripcion: "Ventana operativa de recoleccion.",
    },
  ],
  Vid: [
    { nombre: "Dormancia", dia: 0 },
    { nombre: "Lloro", dia: 58 },
    { nombre: "Brotacion", dia: 78 },
    { nombre: "Floracion", dia: 132 },
    { nombre: "Cuaje", dia: 150 },
    { nombre: "Envero", dia: 220 },
    { nombre: "Madurez", dia: 270 },
    { nombre: "Cosecha", dia: 312 },
  ],
  Manzano: [
    { nombre: "Reposo invernal", dia: 0 },
    { nombre: "Yema hinchada", dia: 72 },
    { nombre: "Punta verde", dia: 88 },
    { nombre: "Floracion", dia: 116 },
    { nombre: "Cuaje", dia: 138 },
    { nombre: "Crecimiento de fruto", dia: 168 },
    { nombre: "Madurez", dia: 278 },
    { nombre: "Cosecha", dia: 318 },
  ],
  Peral: [
    { nombre: "Reposo invernal", dia: 0 },
    { nombre: "Yema hinchada", dia: 68 },
    { nombre: "Brotacion", dia: 86 },
    { nombre: "Floracion", dia: 110 },
    { nombre: "Cuaje", dia: 132 },
    { nombre: "Crecimiento de fruto", dia: 164 },
    { nombre: "Madurez", dia: 268 },
    { nombre: "Cosecha", dia: 304 },
  ],
};

const fToC = (fahrenheit: number): number =>
  Math.round((((fahrenheit - 32) * 5) / 9) * 10) / 10;

export const UMBRALES_HELADA_FENOLOGICOS: Record<
  string,
  IUmbralHeladaFenologico[]
> = {
  Manzano: [
    {
      cultivo: "Manzano",
      etapa: "Reposo invernal",
      aliases: ["dormancia", "reposo", "reposo / nueva campania"],
      fase: "reposo",
      tempDanoLeveC: -12,
      tempDanoSeveroC: -20,
      fuente: "Extension frutales + WSU Critical Temperatures",
      descripcion:
        "En reposo la helada meteorologica no implica dano relevante salvo frio intenso.",
    },
    {
      cultivo: "Manzano",
      etapa: "Yema hinchada",
      aliases: ["silver tip", "yema hinchada"],
      fase: "yema",
      tempDanoLeveC: fToC(15),
      tempDanoSeveroC: fToC(2),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Manzano",
      etapa: "Punta verde",
      aliases: ["green tip", "punta verde", "brotacion"],
      fase: "brotacion",
      tempDanoLeveC: fToC(18),
      tempDanoSeveroC: fToC(10),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Manzano",
      etapa: "Floracion",
      aliases: ["floracion", "first bloom", "full bloom"],
      fase: "floracion",
      tempDanoLeveC: fToC(28),
      tempDanoSeveroC: fToC(25),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Manzano",
      etapa: "Cuaje",
      aliases: ["cuaje", "post bloom", "fruto pequeno"],
      fase: "cuaje",
      tempDanoLeveC: fToC(28),
      tempDanoSeveroC: fToC(25),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Manzano",
      etapa: "Crecimiento de fruto",
      aliases: ["crecimiento de fruto", "desarrollo de fruto", "fruto"],
      fase: "fruto",
      tempDanoLeveC: -2,
      tempDanoSeveroC: -4,
      fuente: "Base CHAMAN calibrable desde tablas post bloom",
    },
    {
      cultivo: "Manzano",
      etapa: "Madurez / cosecha",
      aliases: ["madurez", "cosecha"],
      fase: "madurez",
      tempDanoLeveC: -2,
      tempDanoSeveroC: -4,
      fuente: "Base CHAMAN calibrable para fruta expuesta",
    },
  ],
  Peral: [
    {
      cultivo: "Peral",
      etapa: "Reposo invernal",
      aliases: ["dormancia", "reposo", "reposo invernal"],
      fase: "reposo",
      tempDanoLeveC: -12,
      tempDanoSeveroC: -20,
      fuente: "Extension frutales + WSU Critical Temperatures",
    },
    {
      cultivo: "Peral",
      etapa: "Yema hinchada",
      aliases: ["yema hinchada", "bud scales separating"],
      fase: "yema",
      tempDanoLeveC: fToC(15),
      tempDanoSeveroC: fToC(0),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Peral",
      etapa: "Brotacion",
      aliases: ["brotacion", "bud exposed"],
      fase: "brotacion",
      tempDanoLeveC: fToC(20),
      tempDanoSeveroC: fToC(6),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Peral",
      etapa: "Floracion",
      aliases: ["floracion", "first bloom", "full bloom", "white bud"],
      fase: "floracion",
      tempDanoLeveC: fToC(27),
      tempDanoSeveroC: fToC(23),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Peral",
      etapa: "Cuaje",
      aliases: ["cuaje", "post bloom", "fruto pequeno"],
      fase: "cuaje",
      tempDanoLeveC: fToC(28),
      tempDanoSeveroC: fToC(24),
      fuente: "WSU Tree Fruit Critical Temperatures",
    },
    {
      cultivo: "Peral",
      etapa: "Crecimiento de fruto",
      aliases: ["crecimiento de fruto", "desarrollo de fruto", "fruto"],
      fase: "fruto",
      tempDanoLeveC: -2,
      tempDanoSeveroC: -4,
      fuente: "Base CHAMAN calibrable desde tablas post bloom",
    },
    {
      cultivo: "Peral",
      etapa: "Madurez / cosecha",
      aliases: ["madurez", "cosecha"],
      fase: "madurez",
      tempDanoLeveC: -2,
      tempDanoSeveroC: -4,
      fuente: "Base CHAMAN calibrable para fruta expuesta",
    },
  ],
  Vid: [
    {
      cultivo: "Vid",
      etapa: "Dormancia",
      aliases: ["dormancia", "reposo", "reposo invernal"],
      fase: "reposo",
      tempDanoLeveC: fToC(20),
      tempDanoSeveroC: -15,
      fuente: "Extension viticola frost critical temperatures",
    },
    {
      cultivo: "Vid",
      etapa: "Lloro / yema hinchada",
      aliases: ["lloro", "yema hinchada", "bud swell"],
      fase: "yema",
      tempDanoLeveC: fToC(26),
      tempDanoSeveroC: fToC(20),
      fuente: "Extension viticola frost critical temperatures",
    },
    {
      cultivo: "Vid",
      etapa: "Brotacion",
      aliases: ["brotacion", "bud break", "green tip"],
      fase: "brotacion",
      tempDanoLeveC: fToC(28),
      tempDanoSeveroC: fToC(24),
      fuente: "Extension viticola frost critical temperatures",
    },
    {
      cultivo: "Vid",
      etapa: "Floracion / cuaje",
      aliases: ["floracion", "cuaje", "brotes", "hojas"],
      fase: "floracion",
      tempDanoLeveC: -1,
      tempDanoSeveroC: -3,
      fuente: "Extension viticola: tejidos verdes sensibles cerca de 0 C",
    },
    {
      cultivo: "Vid",
      etapa: "Envero / madurez",
      aliases: ["envero", "madurez", "cosecha"],
      fase: "madurez",
      tempDanoLeveC: -1,
      tempDanoSeveroC: -3,
      fuente: "Base CHAMAN calibrable para tejidos verdes y fruta",
    },
  ],
  Pecan: [
    {
      cultivo: "Pecan",
      etapa: "Dormancia",
      aliases: ["dormancia", "reposo", "reposo / nueva campania"],
      fase: "reposo",
      tempDanoLeveC: fToC(24),
      tempDanoSeveroC: -8,
      fuente: "Extension pecan freeze injury",
    },
    {
      cultivo: "Pecan",
      etapa: "Brotacion",
      aliases: ["brotacion", "green tissue", "brote"],
      fase: "brotacion",
      tempDanoLeveC: fToC(26),
      tempDanoSeveroC: fToC(20),
      fuente: "Extension pecan freeze injury near budbreak",
    },
    {
      cultivo: "Pecan",
      etapa: "Floracion / polinizacion",
      aliases: ["floracion", "polinizacion", "cuaje"],
      fase: "floracion",
      tempDanoLeveC: fToC(28),
      tempDanoSeveroC: fToC(24),
      fuente: "Extension pecan: tejido verde sensible a heladas primaverales",
    },
    {
      cultivo: "Pecan",
      etapa: "Llenado de nuez",
      aliases: [
        "estado acuoso",
        "gel",
        "endurecimiento de cascara",
        "masa",
        "llenado de nuez",
      ],
      fase: "fruto",
      tempDanoLeveC: -1.5,
      tempDanoSeveroC: -4,
      fuente: "Base CHAMAN calibrable para fruto y tejido activo",
    },
    {
      cultivo: "Pecan",
      etapa: "Madurez / cosecha",
      aliases: ["apertura de ruezno", "madurez", "cosecha"],
      fase: "madurez",
      tempDanoLeveC: -2,
      tempDanoSeveroC: -4,
      fuente: "Base CHAMAN calibrable para fruta expuesta",
    },
  ],
};

export const AJUSTES_HELADA_VARIEDAD: IAjusteHeladaVarietal[] = [];

export const CONFIGURACION_FRIO_CULTIVOS: Record<
  string,
  IConfiguracionFrioCultivo
> = {
  Pecan: {
    requiereFrio: true,
    horasFrioObjetivo: 500,
    horasFrioEfectivasObjetivo: 400,
    porcionesFrioObjetivo: 35,
    temperaturaBaseGradosDia: 10,
    gradosDiaBrotacionObjetivo: 120,
    gradosDiaFloracionObjetivo: 280,
    umbralHelada: -1,
  },
  Manzano: {
    requiereFrio: true,
    horasFrioObjetivo: 800,
    horasFrioEfectivasObjetivo: 700,
    porcionesFrioObjetivo: 50,
    temperaturaBaseGradosDia: 7,
    gradosDiaBrotacionObjetivo: 90,
    gradosDiaFloracionObjetivo: 220,
    umbralHelada: -1,
  },
  Peral: {
    requiereFrio: true,
    horasFrioObjetivo: 700,
    horasFrioEfectivasObjetivo: 600,
    porcionesFrioObjetivo: 42,
    temperaturaBaseGradosDia: 7,
    gradosDiaBrotacionObjetivo: 85,
    gradosDiaFloracionObjetivo: 205,
    umbralHelada: -1,
  },
  Vid: {
    requiereFrio: true,
    horasFrioObjetivo: 400,
    horasFrioEfectivasObjetivo: 320,
    porcionesFrioObjetivo: 28,
    temperaturaBaseGradosDia: 10,
    gradosDiaBrotacionObjetivo: 100,
    gradosDiaFloracionObjetivo: 260,
    umbralHelada: -1,
  },
};

export function getEtapasPerennesReferencia(
  cultivo?: string,
): IEtapaFenologicaReferencia[] {
  return cultivo ? ETAPAS_PERENNES_REFERENCIA[cultivo] || [] : [];
}

export function getConfiguracionFrioCultivo(
  cultivo?: string,
): IConfiguracionFrioCultivo | undefined {
  return cultivo ? CONFIGURACION_FRIO_CULTIVOS[cultivo] : undefined;
}

function normalizarTextoHelada(value?: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function canonicalCultivoHelada(cultivo?: string): string | undefined {
  const normalizado = normalizarTextoHelada(cultivo);
  const cultivos: Record<string, string> = {
    manzano: "Manzano",
    peral: "Peral",
    vid: "Vid",
    pecan: "Pecan",
  };
  return cultivos[normalizado] || cultivo;
}

function normalizarEtapasHelada(
  etapas?: Record<string, number | string>,
): Array<{ nombre: string; dia: number }> {
  if (!etapas) return [];
  const entries = Object.entries(etapas)
    .map(([nombre, value]) => ({
      nombre: nombre.replace(/_/g, " "),
      dia: Number(String(value).replace(",", ".")),
    }))
    .filter((item) => Number.isFinite(item.dia));

  if (!entries.length) return [];
  const valores = entries.map((item) => item.dia);
  const sonDiasCampania = valores.every(
    (valor, index) => index === 0 || valor >= valores[index - 1],
  );
  let acumulado = 0;
  return entries
    .map((item, index) => {
      if (sonDiasCampania) {
        return {
          nombre: item.nombre,
          dia: Math.max(0, Math.min(365, Math.round(item.dia))),
        };
      }
      acumulado += index === 0 ? 0 : Math.max(0, item.dia);
      return {
        nombre: item.nombre,
        dia: Math.max(0, Math.min(365, Math.round(acumulado))),
      };
    })
    .sort((a, b) => a.dia - b.dia);
}

function inicioCampaniaPerenneHelada(fecha: Date): Date {
  const year =
    fecha.getMonth() + 1 >= 7 ? fecha.getFullYear() : fecha.getFullYear() - 1;
  return new Date(year, 6, 1);
}

function etapaPerennePorFecha(
  cultivo: string,
  fecha: Date,
  etapasFenologia?: Record<string, number | string>,
): string {
  const etapasCustom = normalizarEtapasHelada(etapasFenologia);
  const etapas = etapasCustom.length
    ? etapasCustom
    : getEtapasPerennesReferencia(cultivo).map((etapa) => ({
        nombre: etapa.nombre,
        dia: etapa.dia,
      }));
  if (!etapas.length) return "Campania perenne";

  const inicio = inicioCampaniaPerenneHelada(fecha);
  const diaCampania = Math.max(
    0,
    Math.min(365, Math.floor((fecha.getTime() - inicio.getTime()) / 86400000)),
  );
  let actual = etapas[0].nombre;
  etapas.forEach((etapa) => {
    if (diaCampania >= etapa.dia) actual = etapa.nombre;
  });

  const ultima = etapas[etapas.length - 1];
  if (diaCampania > (ultima?.dia || 0) && diaCampania >= 345) {
    return "Reposo / nueva campania";
  }
  return actual;
}

function elegirUmbralHelada(
  cultivo: string,
  etapa: string,
): IUmbralHeladaFenologico | undefined {
  const tabla = UMBRALES_HELADA_FENOLOGICOS[cultivo] || [];
  const etapaNormalizada = normalizarTextoHelada(etapa);
  const match = tabla.find((item) =>
    [item.etapa, ...(item.aliases || [])].some((alias) => {
      const aliasNormalizado = normalizarTextoHelada(alias);
      return (
        etapaNormalizada.includes(aliasNormalizado) ||
        aliasNormalizado.includes(etapaNormalizada)
      );
    }),
  );
  return match || tabla[0];
}

function buscarAjusteHeladaVarietal(
  cultivo: string,
  variedad?: string,
): IAjusteHeladaVarietal | undefined {
  const variedadNormalizada = normalizarTextoHelada(variedad);
  if (!variedadNormalizada) return undefined;
  return AJUSTES_HELADA_VARIEDAD.find((ajuste) => {
    if (canonicalCultivoHelada(ajuste.cultivo) !== cultivo) return false;
    return [ajuste.variedad, ...(ajuste.aliases || [])].some(
      (alias) => normalizarTextoHelada(alias) === variedadNormalizada,
    );
  });
}

function resolverAjusteVarietal(
  params: IResolverContextoHeladaParams,
  cultivo: string,
  fase: FaseHeladaFenologica,
): {
  ajuste: number;
  fuente?: string;
  calibracion: IContextoHeladaFenologico["calibracionVarietal"];
} {
  const ajusteDesdeSemilla =
    params.ajustesHeladaPorFase?.[fase] ?? params.ajusteVarietalC;
  if (Number.isFinite(Number(ajusteDesdeSemilla))) {
    return {
      ajuste: Number(ajusteDesdeSemilla),
      fuente: params.fuenteAjusteVarietal || "Ficha tecnica de semilla",
      calibracion: "semilla",
    };
  }

  const ajusteVariedad = buscarAjusteHeladaVarietal(cultivo, params.variedad);
  const ajusteDesdeTabla =
    ajusteVariedad?.ajustesPorFase?.[fase] ?? ajusteVariedad?.ajusteUmbralC;
  if (Number.isFinite(Number(ajusteDesdeTabla))) {
    return {
      ajuste: Number(ajusteDesdeTabla),
      fuente: ajusteVariedad?.fuente,
      calibracion: "variedad",
    };
  }

  return { ajuste: 0, calibracion: "base_fenologica" };
}

export function resolverContextoHeladaFenologico(
  params: IResolverContextoHeladaParams,
): IContextoHeladaFenologico | undefined {
  const cultivo = canonicalCultivoHelada(params.cultivo);
  if (!cultivo || !esCultivoPerenne(cultivo)) return undefined;

  const fecha =
    params.fecha instanceof Date
      ? params.fecha
      : params.fecha
        ? new Date(params.fecha)
        : new Date();
  const fechaEvaluada = Number.isNaN(fecha.getTime()) ? new Date() : fecha;
  const etapaDetectada =
    params.etapaFenologica ||
    etapaPerennePorFecha(cultivo, fechaEvaluada, params.etapasFenologia);
  const umbral = elegirUmbralHelada(cultivo, etapaDetectada);
  if (!umbral) return undefined;
  const ajusteVarietal = resolverAjusteVarietal(params, cultivo, umbral.fase);

  return {
    ...umbral,
    tempDanoLeveC:
      Math.round((umbral.tempDanoLeveC + ajusteVarietal.ajuste) * 10) / 10,
    tempDanoSeveroC:
      Math.round((umbral.tempDanoSeveroC + ajusteVarietal.ajuste) * 10) / 10,
    variedad: params.variedad,
    ajusteVarietalC: ajusteVarietal.ajuste,
    fuenteAjusteVarietal: ajusteVarietal.fuente,
    calibracionVarietal: ajusteVarietal.calibracion,
    etapaDetectada,
    fechaEvaluada: fechaEvaluada.toISOString().slice(0, 10),
  };
}

export interface IEtapasTrigo {
  R0_R1?: number;
  R1_R2?: number;
  R2_R3?: number;
  R3_R4?: number;
  R4_R5?: number;
  R5_R6?: number;
  R6_R7?: number;
}

export interface IEtapasSoja {
  siembra_emergencia?: number;
  emergencia_R1?: number;
  R1_R3?: number;
  R3_R5?: number;
  R5_R7?: number;
}

export interface IEtapasMaiz {
  siembra_emergencia?: number;
  emergencia_floracion?: number;
  floracion_madurez?: number;
}

export interface ICrono {
  _id?: string;
  cultivo?: Cultivo;
  idDepartamento?: string;
  ciclo?: string;
  diaSiembra?: number;
  mesSiembra?: number;
  etapas?: IEtapasSoja | IEtapasTrigo | IEtapasMaiz | Record<string, number>;
  departamentoNombre?: string;
  // Populate
  departamento?: IDepartamento;
}

type OmitirCreate = "_id" | "departamento";
export interface ICreateCrono extends Omit<Partial<ICrono>, OmitirCreate> {}

type OmitirUpdate = "_id" | "departamento";
export interface IUpdateCrono extends Omit<Partial<ICrono>, OmitirUpdate> {}

export type IFenologia = ICrono;
export type ICreateFenologia = ICreateCrono;
export type IUpdateFenologia = IUpdateCrono;
