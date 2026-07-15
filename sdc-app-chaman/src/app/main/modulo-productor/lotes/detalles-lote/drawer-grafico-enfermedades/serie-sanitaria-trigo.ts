import { getEnfermedadCanonica, IPrediccion } from 'modelos/src';

export type PuntoSerieSanitaria = [number, number | null];

export interface SerieSanitariaTrigo {
  idEnfermedad: string;
  nombre: string;
  version?: number;
  versionEtiqueta: string;
  data: PuntoSerieSanitaria[];
}

interface SerieSanitariaInterna
  extends Omit<SerieSanitariaTrigo, 'data'> {
  puntos: Map<number, number | null>;
  tieneLecturas: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVALO_CONTINUO_MS = DIA_MS * 1.5;
const CALIDAD_NO_GRAFICABLE = new Set(['baja', 'sin_datos']);

/**
 * Construye la serie historica sin mezclar contratos incompatibles.
 *
 * - La enfermedad se agrupa por id canonico, no por el texto historico.
 * - Cada version del motor conserva su propia linea.
 * - Fuera de ventana, sin datos y baja calidad se representan como huecos,
 *   nunca como un cero epidemiologico.
 */
export function construirSeriesSanitariasTrigo(
  predicciones: IPrediccion[] = [],
): SerieSanitariaTrigo[] {
  const series = new Map<string, SerieSanitariaInterna>();

  const ordenadas = [...predicciones].sort(
    (a, b) => fechaMs(a.fecha) - fechaMs(b.fecha),
  );

  for (const prediccion of ordenadas) {
    const fecha = fechaMs(prediccion.fecha);
    if (!Number.isFinite(fecha)) continue;

    for (const enfermedad of prediccion.enfermedades || []) {
      const canonica =
        getEnfermedadCanonica(enfermedad.idEnfermedad) ||
        getEnfermedadCanonica(enfermedad.enfermedad);
      const idEnfermedad =
        enfermedad.idEnfermedad ||
        canonica?.id ||
        `legado.${slug(enfermedad.enfermedad)}`;
      const nombre = canonica?.nombre || enfermedad.enfermedad;
      const versionNumero = Number(enfermedad.modelo?.version);
      const version =
        Number.isFinite(versionNumero) && versionNumero > 0
          ? versionNumero
          : undefined;
      const versionEtiqueta = version ? `v${version}` : 'legado';
      const clave = `${idEnfermedad}::${versionEtiqueta}`;

      let serie = series.get(clave);
      if (!serie) {
        serie = {
          idEnfermedad,
          nombre,
          version,
          versionEtiqueta,
          puntos: new Map<number, number | null>(),
          tieneLecturas: false,
        };
        series.set(clave, serie);
      }

      const resultado = Number(enfermedad.resultado);
      const estado = String(enfermedad.estado || 'calculado');
      const calidad = String(enfermedad.calidadDatos?.nivel || '');
      const calculable =
        estado === 'calculado' &&
        !CALIDAD_NO_GRAFICABLE.has(calidad) &&
        Number.isFinite(resultado);

      serie.puntos.set(fecha, calculable ? resultado : null);
      serie.tieneLecturas ||= calculable;
    }
  }

  return [...series.values()]
    .filter((serie) => serie.tieneLecturas)
    .map((serie) => ({
      idEnfermedad: serie.idEnfermedad,
      nombre: serie.nombre,
      version: serie.version,
      versionEtiqueta: serie.versionEtiqueta,
      data: insertarCortesTemporales(
        [...serie.puntos.entries()].sort((a, b) => a[0] - b[0]),
      ),
    }))
    .sort((a, b) => {
      const porNombre = a.nombre.localeCompare(b.nombre, 'es');
      if (porNombre) return porNombre;
      return (a.version ?? -1) - (b.version ?? -1);
    });
}

function insertarCortesTemporales(
  puntos: PuntoSerieSanitaria[],
): PuntoSerieSanitaria[] {
  const resultado: PuntoSerieSanitaria[] = [];
  let fechaAnterior: number | undefined;

  for (const punto of puntos) {
    if (
      fechaAnterior !== undefined &&
      punto[0] - fechaAnterior > MAX_INTERVALO_CONTINUO_MS
    ) {
      resultado.push([fechaAnterior + DIA_MS, null]);
    }
    resultado.push(punto);
    fechaAnterior = punto[0];
  }

  return resultado;
}

function fechaMs(fecha?: string): number {
  if (!fecha) return Number.NaN;
  return new Date(fecha).getTime();
}

function slug(value?: string): string {
  return (
    String(value || 'enfermedad')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'enfermedad'
  );
}
