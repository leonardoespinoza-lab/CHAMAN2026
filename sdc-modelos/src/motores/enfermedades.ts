import {
  IResistencia,
  TEnfermedad,
  TEnfermedadId,
  TEstadoResistencia,
} from "../entidades/semilla";

export interface IDefinicionEnfermedad {
  id: TEnfermedadId;
  nombre: TEnfermedad;
  cultivo: string;
  aliases: string[];
  motor: "operativo" | "sin_modelo";
}

export const ENFERMEDADES_CANONICAS: IDefinicionEnfermedad[] = [
  { id: "trigo.mancha_amarilla", nombre: "Mancha Amarilla", cultivo: "Trigo", aliases: ["MA", "Drechslera tritici"], motor: "operativo" },
  { id: "trigo.mancha_hoja", nombre: "Mancha de la Hoja", cultivo: "Trigo", aliases: ["MH", "SH", "Septoria", "Septoriosis"], motor: "operativo" },
  { id: "trigo.roya_hoja", nombre: "Roya de la Hoja", cultivo: "Trigo", aliases: ["RH", "Puccinia triticina", "Roya anaranjada de la hoja"], motor: "operativo" },
  { id: "trigo.roya_tallo", nombre: "Roya del Tallo", cultivo: "Trigo", aliases: ["RT", "Puccinia graminis"], motor: "sin_modelo" },
  { id: "trigo.roya_anaranjada", nombre: "Roya Anaranjada", cultivo: "Trigo", aliases: ["RA", "Roya Amarilla", "Puccinia striiformis"], motor: "operativo" },
  { id: "trigo.fusarium_espiga", nombre: "Fusarium de la Espiga", cultivo: "Trigo", aliases: ["FE", "Fusarium", "Fusariosis"], motor: "operativo" },
  { id: "cebada.mancha_red", nombre: "Mancha en Red", cultivo: "Cebada", aliases: ["Drechslera teres", "Net blotch"], motor: "operativo" },
  { id: "cebada.escaldadura", nombre: "Escaldadura de la Cebada", cultivo: "Cebada", aliases: ["Escaldadura", "Rhynchosporium"], motor: "operativo" },
  { id: "cebada.roya_hoja", nombre: "Roya de la Hoja de Cebada", cultivo: "Cebada", aliases: ["Roya cebada"], motor: "operativo" },
  { id: "cebada.fusariosis_espiga", nombre: "Fusariosis de la Espiga de Cebada", cultivo: "Cebada", aliases: ["Fusariosis cebada"], motor: "operativo" },
  { id: "soja.fin_ciclo", nombre: "Fin de Ciclo", cultivo: "Soja", aliases: ["Fin de Ciclo Soja", "EFC"], motor: "operativo" },
  { id: "maiz.roya", nombre: "Roya del Maiz", cultivo: "Maiz", aliases: ["Roya del Maíz", "Roya maiz"], motor: "operativo" },
  { id: "maiz.tizon_foliar", nombre: "Tizon Foliar del Maiz", cultivo: "Maiz", aliases: ["Tizon foliar", "Tizón foliar", "Tizon"], motor: "sin_modelo" },
  { id: "vid.oidio", nombre: "Oidio", cultivo: "Vid", aliases: [], motor: "sin_modelo" },
  { id: "vid.botritis", nombre: "Botritis", cultivo: "Vid", aliases: [], motor: "sin_modelo" },
  { id: "vid.mildiu", nombre: "Mildiu", cultivo: "Vid", aliases: [], motor: "sin_modelo" },
  { id: "papa.tizon_tardio", nombre: "Tizon Tardio", cultivo: "Papa", aliases: ["Phytophthora infestans"], motor: "sin_modelo" },
  { id: "papa.tizon_temprano", nombre: "Tizon Temprano", cultivo: "Papa", aliases: [], motor: "sin_modelo" },
  { id: "papa.rhizoctonia", nombre: "Rhizoctonia", cultivo: "Papa", aliases: ["Rhizoctonia solani"], motor: "sin_modelo" },
  { id: "manzano.sarna", nombre: "Sarna del Manzano", cultivo: "Manzano", aliases: [], motor: "sin_modelo" },
  { id: "manzano.oidio", nombre: "Oidio del Manzano", cultivo: "Manzano", aliases: [], motor: "sin_modelo" },
  { id: "frutales.fuego_bacteriano", nombre: "Fuego Bacteriano", cultivo: "Frutales", aliases: [], motor: "sin_modelo" },
  { id: "manzano.carpocapsa", nombre: "Carpocapsa", cultivo: "Manzano", aliases: [], motor: "sin_modelo" },
  { id: "peral.sarna", nombre: "Sarna del Peral", cultivo: "Peral", aliases: [], motor: "sin_modelo" },
  { id: "peral.psila", nombre: "Psila del Peral", cultivo: "Peral", aliases: [], motor: "sin_modelo" },
  { id: "pecan.sarna", nombre: "Sarna del Pecan", cultivo: "Pecan", aliases: [], motor: "sin_modelo" },
  { id: "pecan.bacteriosis", nombre: "Bacteriosis del Pecan", cultivo: "Pecan", aliases: [], motor: "sin_modelo" },
];

export interface IResistenciaResuelta {
  resistencia?: IResistencia;
  multiplicador: number;
  indiceResistencia: number;
  estado: TEstadoResistencia;
  desconocida: boolean;
}

export interface IHoraClimaEnfermedad {
  temperatura: number;
  humedadRelativa: number;
}

export const limitar = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function normalizarNombreEnfermedad(value?: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function getEnfermedadCanonica(
  value?: string,
): IDefinicionEnfermedad | undefined {
  const normalizado = normalizarNombreEnfermedad(value);
  if (!normalizado) return undefined;
  return ENFERMEDADES_CANONICAS.find((item) =>
    [item.id, item.nombre, ...item.aliases]
      .map(normalizarNombreEnfermedad)
      .includes(normalizado),
  );
}

export function getEnfermedadPorId(
  id?: TEnfermedadId,
): IDefinicionEnfermedad | undefined {
  return ENFERMEDADES_CANONICAS.find((item) => item.id === id);
}

export function enfermedadCoincide(
  resistencia: Pick<IResistencia, "idEnfermedad" | "enfermedad">,
  disease: TEnfermedadId | TEnfermedad | string,
): boolean {
  const objetivo = getEnfermedadCanonica(disease);
  if (!objetivo) return false;
  if (resistencia.idEnfermedad) return resistencia.idEnfermedad === objetivo.id;
  return getEnfermedadCanonica(resistencia.enfermedad)?.id === objetivo.id;
}

export function campaniaAOrden(value?: string): number {
  const text = String(value || "").trim();
  const years = [...text.matchAll(/(?:20)?(\d{2})/g)].map((match) => {
    const year = Number(match[1]);
    return year >= 70 ? 1900 + year : 2000 + year;
  });
  if (!years.length) return 0;
  return years[0] * 10000 + (years[1] || years[0]);
}

function prioridadEstado(value?: TEstadoResistencia): number {
  if (value === "observada") return 4;
  if (value === "historica") return 3;
  if (value === "inferida") return 2;
  return 1;
}

export function seleccionarResistenciaMasReciente(
  resistencias: IResistencia[] | undefined,
  disease: TEnfermedadId | TEnfermedad | string,
): IResistencia | undefined {
  return [...(resistencias || [])]
    .filter((item) => enfermedadCoincide(item, disease))
    .sort((a, b) => {
      const byCampaign = campaniaAOrden(b.campaniaFuente) - campaniaAOrden(a.campaniaFuente);
      if (byCampaign) return byCampaign;
      const byDate = String(b.fechaFuente || "").localeCompare(String(a.fechaFuente || ""));
      if (byDate) return byDate;
      return prioridadEstado(b.estado) - prioridadEstado(a.estado);
    })[0];
}

export function indiceResistenciaDesdeMultiplicador(
  multiplicador?: number,
): number {
  if (multiplicador === undefined || multiplicador === null) return 0;
  const value = Number(multiplicador);
  if (!Number.isFinite(value)) return 0;
  if (value <= 0.35) return 1;
  if (value <= 0.55) return 2 / 3;
  if (value <= 0.8) return 1 / 3;
  return 0;
}

export function resolverResistencia(
  resistencias: IResistencia[] | undefined,
  disease: TEnfermedadId | TEnfermedad | string,
  fallbackMultiplicador = 1,
): IResistenciaResuelta {
  const resistencia = seleccionarResistenciaMasReciente(resistencias, disease);
  const desconocida = !resistencia || resistencia.estado === "desconocida";
  const multiplicador = limitar(
    Number(resistencia?.multiplicador ?? fallbackMultiplicador),
    0.01,
    1.4,
  );
  const indiceResistencia = limitar(
    Number(
      resistencia?.indiceResistencia ??
        indiceResistenciaDesdeMultiplicador(resistencia?.multiplicador),
    ),
    0,
    1,
  );
  return {
    resistencia,
    multiplicador,
    indiceResistencia,
    estado: resistencia?.estado || "desconocida",
    desconocida,
  };
}

export function calcularManchaAmarilla(
  DPrHRT: number,
  DPr: number,
  multiplicador: number,
): number {
  return limitar((-2.25 + 1.62 * DPrHRT + 1.3 * DPr) * multiplicador);
}

export function calcularManchaHoja(
  DHR: number,
  DPr: number,
  multiplicador: number,
): number {
  return limitar((-6.41 + 0.59 * DHR + 2.79 * DPr) * multiplicador);
}

export function calcularRoyaHoja(
  GD: number,
  DHR: number,
  indiceResistencia: number,
): number {
  return limitar(4.42 + 0.61 * GD + 0.57 * DHR - 30.01 * indiceResistencia);
}

export function calcularRoyaAnaranjada(
  GD: number,
  DHR: number,
  DL: number,
  indiceResistencia: number,
): number {
  return limitar(
    5.15 + 0.72 * GD + 0.48 * DHR + 0.35 * DL - 35.2 * indiceResistencia,
  );
}

export function calcularFusariumEspiga(
  PMoj: number,
  GDN: number,
  multiplicador: number,
  activo = true,
): number {
  return activo
    ? limitar((20.37 + 8.63 * PMoj - 0.49 * GDN) * multiplicador)
    : 0;
}

export function calcularFinCicloSoja(
  Lt7: number,
  multiplicador: number,
): number {
  return limitar(((8 * Lt7) / 600) * multiplicador);
}

export function factorTemperaturaManchaRed(temperatura: number): number {
  if (!Number.isFinite(temperatura) || temperatura < 5 || temperatura > 30) return 0;
  return ((temperatura - 5) * (30 - temperatura)) / 150;
}

export function factorHumedadManchaRed(humedadRelativa: number): number {
  if (!Number.isFinite(humedadRelativa)) return 0;
  if (humedadRelativa >= 90) return 1;
  if (humedadRelativa >= 80) return 0.5;
  return 0;
}

export function tasaDiariaManchaRedHoraria(
  horas: IHoraClimaEnfermedad[],
  multiplicador: number,
): number {
  const validas = horas.filter(
    (hora) =>
      Number.isFinite(hora.temperatura) &&
      Number.isFinite(hora.humedadRelativa),
  );
  if (!validas.length) return 0;
  return (
    validas.reduce(
      (sum, hora) =>
        sum +
        factorTemperaturaManchaRed(hora.temperatura) *
          factorHumedadManchaRed(hora.humedadRelativa),
      0,
    ) /
    validas.length
  ) * multiplicador;
}

export function acumularSeveridadManchaRed(
  severidadAnterior: number,
  tasaDiaria: number,
): number {
  const previa = limitar(severidadAnterior);
  if (tasaDiaria <= 0) return previa;
  if (previa <= 0) return tasaDiaria > 0.2 ? 0.1 : 0;
  return limitar(previa + tasaDiaria * previa * (1 - previa / 100));
}

export function factorTemperaturaEscaldadura(temperatura: number): number {
  if (!Number.isFinite(temperatura) || temperatura < 4 || temperatura > 25) return 0;
  if (temperatura >= 10 && temperatura <= 18) return 1;
  if (temperatura < 10) return limitar((temperatura - 4) / 6, 0, 1);
  return limitar((25 - temperatura) / 7, 0, 1);
}

export function factorHorasMojado(horasMojado: number): number {
  if (!Number.isFinite(horasMojado) || horasMojado < 12) return 0;
  if (horasMojado >= 24) return 1;
  return limitar((horasMojado - 12) / 12, 0, 1);
}

export function factorPrecipitacionEscaldadura(lluviaMm: number): number {
  if (!Number.isFinite(lluviaMm)) return 0;
  if (lluviaMm < 1) return 0.2;
  if (lluviaMm >= 5) return 1;
  return limitar(0.2 + ((lluviaMm - 1) / 4) * 0.8, 0.2, 1);
}

export function calcularEscaldadura(
  temperatura: number,
  horasMojado: number,
  lluviaMm: number,
  multiplicador: number,
): number {
  return limitar(
    factorTemperaturaEscaldadura(temperatura) *
      factorHorasMojado(horasMojado) *
      factorPrecipitacionEscaldadura(lluviaMm) *
      multiplicador *
      100,
  );
}

export function gradosDiaRoya(hr: number, temperaturaMedia: number): number {
  if (!Number.isFinite(hr) || !Number.isFinite(temperaturaMedia)) return 0;
  if (hr < 49 || temperaturaMedia < 12) return 0;
  return Math.max(Math.min(temperaturaMedia, 18) - 12, 0);
}

export function gradosDiaRoyaMaiz(hr: number, temperaturaMedia: number): number {
  if (!Number.isFinite(hr) || !Number.isFinite(temperaturaMedia)) return 0;
  if (hr < 95 || temperaturaMedia < 8) return 0;
  return Math.max(Math.min(temperaturaMedia, 17) - 8, 0);
}

export function gradosDiaRoyaAnaranjada(
  hr: number,
  temperaturaMedia: number,
): number {
  if (!Number.isFinite(hr) || !Number.isFinite(temperaturaMedia)) return 0;
  if (hr <= 60 || temperaturaMedia < 7 || temperaturaMedia > 14) return 0;
  return temperaturaMedia;
}
