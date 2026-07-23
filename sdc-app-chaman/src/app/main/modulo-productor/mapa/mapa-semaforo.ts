export type EstadoSemaforoMapa = 'ok' | 'precaucion' | 'alerta';
export type NivelSanitarioMapa = 'sin-prediccion' | 'bajo' | 'medio' | 'alto';

/**
 * Unica paleta operativa del mapa. La ausencia de una lectura concluyente es
 * precaucion amarilla; nunca se representa como gris ni como dato confirmado.
 */
export const COLOR_SEMAFORO_MAPA: Record<EstadoSemaforoMapa, string> = {
  ok: 'rgba(34, 197, 94, 0.62)',
  precaucion: 'rgba(243, 216, 64, 0.62)',
  alerta: 'rgba(244, 74, 74, 0.66)',
};

export const BORDE_SEMAFORO_MAPA: Record<EstadoSemaforoMapa, string> = {
  ok: '#22c55e',
  precaucion: '#d9a500',
  alerta: '#f44a4a',
};

/**
 * Traduce la clasificacion sanitaria al unico semaforo visual de Chaman.
 * La falta de una prediccion vigente requiere atencion de datos, por lo que
 * se representa como precaucion amarilla y nunca como un cuarto estado gris.
 */
export function estadoSanidadSemaforo(nivel?: NivelSanitarioMapa): EstadoSemaforoMapa {
  if (nivel === 'alto') return 'alerta';
  if (nivel === 'bajo') return 'ok';
  return 'precaucion';
}

export function estadoRiegoSemaforo(estado?: 'hoy' | 'proximo' | 'sin_aporte' | 'sin_datos'): EstadoSemaforoMapa {
  if (estado === 'hoy') return 'alerta';
  if (estado === 'sin_aporte') return 'ok';
  return 'precaucion';
}

export function estadoFrioSemaforo(cultivoPerenne: boolean, tieneDatos: boolean): EstadoSemaforoMapa {
  if (!cultivoPerenne) return 'ok';
  return tieneDatos ? 'ok' : 'precaucion';
}

export function estadoHeladaSemaforo(minimaPronosticada: number | null): EstadoSemaforoMapa {
  if (minimaPronosticada === null) return 'precaucion';
  if (minimaPronosticada <= 0) return 'alerta';
  if (minimaPronosticada <= 2) return 'precaucion';
  return 'ok';
}
