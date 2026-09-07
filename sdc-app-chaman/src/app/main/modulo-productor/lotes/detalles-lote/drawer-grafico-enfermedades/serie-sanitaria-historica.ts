import { getEnfermedadCanonica, IPrediccion } from 'modelos/src';

export type EstadoPuntoSanitario = 'calculado' | 'fuera_ventana' | 'sin_datos';
export interface PuntoSanitarioHistorico {
  x: number;
  y: number | null;
  custom: { estado: EstadoPuntoSanitario; calidad?: string };
}
export interface SerieSanitariaHistorica {
  idEnfermedad: string;
  nombre: string;
  versionEtiqueta: string;
  desde?: number;
  hasta?: number;
  data: PuntoSanitarioHistorico[];
}

/** Adaptador de presentación: no recalcula ni modifica registros persistidos. */
export function construirSeriesSanitariasHistoricas(predicciones: IPrediccion[]): SerieSanitariaHistorica[] {
  const series = new Map<string, SerieSanitariaHistorica>();
  const ordenadas = [...predicciones]
    .filter((p) => p.fecha && Number.isFinite(Date.parse(p.fecha)))
    .sort((a, b) => Date.parse(a.fecha!) - Date.parse(b.fecha!));
  const fechas = [...new Set(ordenadas.map((p) => Date.parse(p.fecha!)))];

  for (const prediccion of ordenadas) {
    for (const enfermedad of prediccion.enfermedades || []) {
      const canonica = getEnfermedadCanonica(enfermedad.idEnfermedad) || getEnfermedadCanonica(enfermedad.enfermedad);
      const idEnfermedad = canonica?.id || enfermedad.idEnfermedad || enfermedad.enfermedad;
      const variables = enfermedad.variables as Record<string, number> | undefined;
      const numeroVersion = Number(enfermedad.modelo?.version ?? variables?.['formulaVersion']);
      const versionEtiqueta = numeroVersion > 0 && Number.isFinite(numeroVersion) ? `v${numeroVersion}` : 'legado';
      const clave = `${idEnfermedad}::${versionEtiqueta}`;
      let serie = series.get(clave);
      if (!serie) {
        serie = { idEnfermedad, nombre: canonica?.nombre || enfermedad.enfermedad, versionEtiqueta, data: [] };
        series.set(clave, serie);
      }
      // null, undefined y cadena vacía no son un cero calculado.
      const valor = enfermedad.resultado;
      const valido = typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100;
      const estado =
        enfermedad.estado === 'fuera_ventana'
          ? 'fuera_ventana'
          : enfermedad.estado === 'sin_datos' || !valido || enfermedad.calidadDatos?.nivel === 'sin_datos'
            ? 'sin_datos'
            : 'calculado';
      const punto: PuntoSanitarioHistorico = {
        x: Date.parse(prediccion.fecha!),
        y: estado === 'calculado' ? valor : null,
        custom: { estado, calidad: enfermedad.calidadDatos?.nivel },
      };
      const repetido = serie.data.findIndex((p) => p.x === punto.x);
      if (repetido >= 0) serie.data[repetido] = punto;
      else serie.data.push(punto);
    }
  }

  return [...series.values()].map((serie) => {
    const puntos = new Map(serie.data.map((p) => [p.x, p]));
    const data: PuntoSanitarioHistorico[] = [];
    let anterior: number | undefined;
    for (const fecha of fechas) {
      if (anterior !== undefined && fecha - anterior > 1.5 * 86400000) {
        data.push({ x: anterior + 86400000, y: null, custom: { estado: 'sin_datos' } });
      }
      data.push(puntos.get(fecha) || { x: fecha, y: null, custom: { estado: 'sin_datos' } });
      anterior = fecha;
    }
    return { ...serie, desde: serie.data[0]?.x, hasta: serie.data.at(-1)?.x, data };
  });
}

export function escaparTextoSanitario(valor: unknown): string {
  return String(valor ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

/** Las únicas lecturas porcentuales de este gráfico son las horas favorables de roya amarilla. */
export function unidadSerieSanitaria(id: string, version?: number): string {
  return id === 'trigo.roya_anaranjada' && (version || 0) >= 4 ? '% horas favorables' : '/100';
}
