import { getEnfermedadCanonica, IPrediccionEnfermedad, TEnfermedad } from 'modelos/src';

/** Resuelve primero por ID estable y luego por nombre/alias legado. */
export function buscarPrediccionEnfermedadCanonica(
  predicciones: IPrediccionEnfermedad[] | undefined,
  enfermedad: TEnfermedad
): IPrediccionEnfermedad | undefined {
  const objetivo = getEnfermedadCanonica(enfermedad);
  return (predicciones || []).find((item) => {
    if (objetivo && item.idEnfermedad === objetivo.id) return true;
    const canonicaItem = getEnfermedadCanonica(item.idEnfermedad) || getEnfermedadCanonica(item.enfermedad);
    return objetivo ? canonicaItem?.id === objetivo.id : item.enfermedad === enfermedad;
  });
}
