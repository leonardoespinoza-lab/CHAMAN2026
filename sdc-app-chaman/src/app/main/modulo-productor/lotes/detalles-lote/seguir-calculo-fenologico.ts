import { ICalculoFenologico } from 'modelos/src';

/** Consulta acotada y cancelable. Nunca solicita un reproceso. */
export async function seguirCalculoFenologico(
  consultar: () => Promise<ICalculoFenologico>,
  signal: AbortSignal,
  esperar: () => Promise<void> = () => pausa(signal),
  intentos = 60
): Promise<ICalculoFenologico | undefined> {
  for (let i = 0; i < intentos && !signal.aborted; i++) {
    const estado = await consultar();
    if (signal.aborted) return;
    if (!['pendiente', 'procesando'].includes(estado.estado)) return estado;
    if (i + 1 < intentos) await esperar();
  }
  return undefined;
}

function pausa(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const terminar = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', terminar);
      resolve();
    };
    const timer = setTimeout(terminar, 5000);
    signal.addEventListener('abort', terminar, { once: true });
    if (signal.aborted) terminar();
  });
}
