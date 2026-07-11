import { IRegistroFenologico, ISiembra } from 'modelos/src';

export interface IEtapaFenologicaObservada {
  etapa: number | string;
  registro: IRegistroFenologico;
}

export function aplicarEtapaFenologicaObservada<T extends number | string>(
  etapaCrono: T,
  observada?: IEtapaFenologicaObservada,
): T {
  return (observada?.etapa ?? etapaCrono) as T;
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

export function getUltimoRegistroFenologicoObservado(
  siembra: ISiembra,
  fecha: Date,
): IRegistroFenologico | undefined {
  const limite = fecha.getTime();
  return [...(siembra.registrosFenologicos || [])]
    .filter((registro) => {
      const timestamp = new Date(registro.fecha || registro.creadoEn || '').getTime();
      return !!registro.etapa && Number.isFinite(timestamp) && timestamp <= limite;
    })
    .sort((a, b) => {
      const fechaA = new Date(a.fecha || a.creadoEn || '').getTime();
      const fechaB = new Date(b.fecha || b.creadoEn || '').getTime();
      return fechaB - fechaA;
    })[0];
}

export function resolverEtapaFenologicaObservada(
  siembra: ISiembra,
  fecha: Date,
  cultivo: 'Trigo' | 'Soja' | 'Maiz' | 'Cebada',
): IEtapaFenologicaObservada | undefined {
  const registro = getUltimoRegistroFenologicoObservado(siembra, fecha);
  if (!registro?.etapa) return undefined;
  const etapaNormalizada = normalizar(registro.etapa);

  if (cultivo === 'Soja') {
    const match = ETAPAS_SOJA.find((item) =>
      item.aliases.map(normalizar).includes(etapaNormalizada),
    );
    return match ? { etapa: match.etapa, registro } : undefined;
  }

  const index = ETAPAS_NUMERICAS[normalizar(cultivo)]?.findIndex((aliases) =>
    aliases.map(normalizar).includes(etapaNormalizada),
  );
  return index >= 0 ? { etapa: index, registro } : undefined;
}
