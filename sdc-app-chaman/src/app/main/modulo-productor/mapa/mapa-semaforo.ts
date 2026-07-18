export type EstadoSemaforoMapa = 'ok' | 'precaucion' | 'alerta';

/**
 * Unica paleta operativa del mapa. La ausencia de una lectura concluyente es
 * precaucion amarilla; nunca se representa como gris ni como dato confirmado.
 */
export const COLOR_SEMAFORO_MAPA: Record<EstadoSemaforoMapa, string> = {
  ok: 'rgba(34, 197, 94, 0.62)',
  precaucion: 'rgba(243, 216, 64, 0.62)',
  alerta: 'rgba(244, 74, 74, 0.66)',
};

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
