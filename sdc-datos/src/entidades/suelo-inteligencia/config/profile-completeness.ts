import { IPerfilProfundidadSuelo } from 'modelos/src';
import { SOILGRIDS_DEPTHS } from './soilgrids.config';

export const isFiniteSoilValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function hasSoilTexture(layer: IPerfilProfundidadSuelo): boolean {
  return [layer.sandQ50, layer.siltQ50, layer.clayQ50].every(
    (value) => isFiniteSoilValue(value) && value >= 0 && value <= 100,
  );
}

/** Covers every centimetre exactly once; missing/null values are not zero. */
export function hasCompleteSoilInterval(
  layers: IPerfilProfundidadSuelo[] | undefined,
  fromCm: number,
  toCm: number,
  valueSelector?: (layer: IPerfilProfundidadSuelo) => unknown,
): boolean {
  if (
    !Number.isFinite(fromCm) ||
    !Number.isFinite(toCm) ||
    fromCm < 0 ||
    toCm <= fromCm
  )
    return false;
  const relevant = (layers || [])
    .filter((layer) => layer.depthToCm > fromCm && layer.depthFromCm < toCm)
    .sort((a, b) => a.depthFromCm - b.depthFromCm);
  let cursor = fromCm;
  for (const layer of relevant) {
    if (
      !isFiniteSoilValue(layer.depthFromCm) ||
      !isFiniteSoilValue(layer.depthToCm) ||
      layer.depthFromCm < 0 ||
      layer.depthToCm <= layer.depthFromCm
    )
      return false;
    const start = Math.max(fromCm, layer.depthFromCm);
    const end = Math.min(toCm, layer.depthToCm);
    if (start !== cursor || end <= start) return false;
    if (
      valueSelector
        ? !isFiniteSoilValue(valueSelector(layer))
        : !hasSoilTexture(layer)
    )
      return false;
    cursor = end;
  }
  return cursor === toCm;
}

export function missingSoilGridsDepths(
  layers: IPerfilProfundidadSuelo[] | undefined,
) {
  return SOILGRIDS_DEPTHS.filter(
    (depth) =>
      !(layers || []).some(
        (layer) =>
          layer.depthFromCm === depth.fromCm &&
          layer.depthToCm === depth.toCm &&
          hasSoilTexture(layer),
      ),
  );
}

/** Retain valid previous horizons only within the same geometry/resolution. */
export function mergeSoilGridsProfiles(
  previous: IPerfilProfundidadSuelo[] | undefined,
  fresh: IPerfilProfundidadSuelo[],
): IPerfilProfundidadSuelo[] {
  return SOILGRIDS_DEPTHS.flatMap((depth) => {
    const matches = (layer: IPerfilProfundidadSuelo) =>
      layer.depthFromCm === depth.fromCm &&
      layer.depthToCm === depth.toCm &&
      hasSoilTexture(layer);
    const old = (previous || []).find(matches);
    const current = fresh.find(matches);
    // Keep each horizon coherent; never mix derived values from separate reads.
    return current ? [current] : old ? [old] : [];
  });
}
