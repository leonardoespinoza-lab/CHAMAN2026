import { IFilter, ILote, IPermiso } from 'modelos/src';

const ids = (values?: string[]): string[] =>
  Array.from(new Set((values || []).map(String).filter(Boolean)));

export function establecimientosDelPermiso(permiso?: IPermiso): string[] {
  if (!permiso) return [];
  if (permiso.nivel === 'Asesor') return ids(permiso.idEstablecimientos);
  return permiso.idEstablecimiento ? [String(permiso.idEstablecimiento)] : [];
}

export function lotesRestringidosDelPermiso(permiso?: IPermiso): string[] {
  if (permiso?.nivel === 'Asesor') return [];
  return ids(permiso?.idLotes);
}

export function permisoPuedeVerEstablecimiento(
  permiso: IPermiso,
  idEstablecimiento?: string,
): boolean {
  if (permiso.nivel !== 'Asesor') return false;
  return (
    !!idEstablecimiento &&
    establecimientosDelPermiso(permiso).includes(String(idEstablecimiento))
  );
}

export function permisoPuedeVerLote(
  permiso: IPermiso,
  lote?: Partial<ILote>,
): boolean {
  if (!lote) return false;
  const lotes = lotesRestringidosDelPermiso(permiso);
  if (lotes.length && (!lote._id || !lotes.includes(String(lote._id))))
    return false;

  if (permiso.nivel === 'Asesor') {
    return permisoPuedeVerEstablecimiento(permiso, lote.idEstablecimiento);
  }
  if (permiso.nivel === 'Establecimiento' && lotes.length) {
    return lote._id ? lotes.includes(String(lote._id)) : false;
  }
  return false;
}

/** Agrega alcance asesor/restriccion por lote a un filtro Mongo sin reemplazar filtros del cliente. */
export function agregarAlcanceLotes<T>(
  filtro: IFilter<T>,
  permiso: IPermiso,
): void {
  const and = (filtro.$and || []) as any[];
  if (permiso.nivel === 'Asesor') {
    const establecimientos = establecimientosDelPermiso(permiso);
    // Sin alcance consolidado se fuerza un conjunto vacio: denegacion por defecto.
    and.push({ idEstablecimiento: { $in: establecimientos } });
  }
  const lotes = lotesRestringidosDelPermiso(permiso);
  if (lotes.length) and.push({ _id: { $in: lotes } });
  if (and.length) filtro.$and = and as any;
}

export function agregarAlcancePorRelacion<T>(
  filtro: IFilter<T>,
  permiso: IPermiso,
  campoLote = 'idLote',
  campoEstablecimiento = 'idEstablecimiento',
): void {
  const and = (filtro.$and || []) as any[];
  const lotes = lotesRestringidosDelPermiso(permiso);
  if (lotes.length) {
    and.push({ [campoLote]: { $in: lotes } });
  } else if (permiso.nivel === 'Asesor') {
    and.push({
      [campoEstablecimiento]: { $in: establecimientosDelPermiso(permiso) },
    });
  }
  if (and.length) filtro.$and = and as any;
}
