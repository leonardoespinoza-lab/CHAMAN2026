'use strict';
// Node.js 22+. Executable server-side integration example; no external packages.
// Never expose CHAMAN_API_KEY in frontend/mobile code or application logs.
const BASE_URLS = Object.freeze({
  production: 'https://chaman-api-production.up.railway.app/sdc-quimica/integraciones/v1',
  testing: 'https://testing-api-testing.up.railway.app/sdc-quimica-test/integraciones/v1',
});
const TYPES = new Set(['productores', 'establecimientos', 'lotes', 'siembras']);
const externalId = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value))
    throw new Error('ID externo inválido; conservar IDs estables, sin datos personales.');
  return encodeURIComponent(value);
};
class ChamanError extends Error {
  constructor(status, requestId, retryable = false, retryAfterMs = null) {
    super(status ? `Chamán respondió HTTP ${status}.` : 'No se confirmó la respuesta de Chamán.');
    this.name = 'ChamanError';
    this.status = status;
    this.requestId = /^[A-Za-z0-9_.-]{1,100}$/.test(requestId || '') ? requestId : null;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    // Deliberately no raw request, credential, response body, or nested cause.
  }
}
class ChamanClient {
  #key; #base; #fetch; #sleep; #random; #attempts; #timeout;
  constructor({ environment, apiKey, maxAttempts = 3, timeoutMs = 60000,
    fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), random = Math.random }) {
    if (!Object.hasOwn(BASE_URLS, environment)) throw new Error('Elegir production o testing explícitamente.');
    const prefix = environment === 'production' ? 'live' : 'test';
    if (typeof apiKey !== 'string' || !new RegExp(`^chm_${prefix}_[a-z0-9_-]{3,50}\\.[A-Za-z0-9_-]{43,86}$`).test(apiKey))
      throw new Error('Clave ausente, inválida o de otro entorno.');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
      throw new Error('Límites de reintento o timeout inválidos.');
    this.#key = apiKey; this.#base = BASE_URLS[environment]; this.#fetch = fetchImpl;
    this.#sleep = sleep; this.#random = random; this.#attempts = maxAttempts; this.#timeout = timeoutMs;
  }
  async #request(method, route, { body, etag } = {}) {
    // Capture the exact same normalized wire payload for every PUT retry.
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const headers = { Accept: 'application/json', 'x-api-key': this.#key };
    if (serialized !== undefined) headers['Content-Type'] = 'application/json';
    if (etag) {
      if (typeof etag !== 'string' || !/^"[a-f0-9]{64}"$/.test(etag)) throw new Error('ETag inválido.');
      headers['If-None-Match'] = etag;
    }
    for (let attempt = 0; attempt < this.#attempts; attempt++) {
      let response;
      try {
        response = await this.#fetch(this.#base + route, {
          method, headers, body: serialized, redirect: 'error',
          signal: AbortSignal.timeout(this.#timeout),
        });
      } catch {
        if (attempt + 1 === this.#attempts) throw new ChamanError(0, null, true);
        await this.#sleep(1000 * 2 ** attempt + Math.floor(this.#random() * 300));
        continue;
      }
      const requestId = response.headers.get('X-Request-Id');
      if (response.status === 304) {
        if (!etag) throw new ChamanError(304, requestId);
        return { unchanged: true, etag, status: 304, requestId };
      }
      if ([200, 201, 202].includes(response.status)) {
        let data;
        try { data = await response.json(); } catch { throw new ChamanError(response.status, requestId); }
        return { data, etag: response.headers.get('ETag'), status: response.status,
          pending: response.status === 202, unchanged: false, requestId };
      }
      const retryable = [429, 502, 503, 504].includes(response.status);
      let delay = 1000 * 2 ** attempt + Math.floor(this.#random() * 300);
      const rawRetryAfter = response.headers.get('Retry-After');
      if (rawRetryAfter) {
        const retry = /^\d+$/.test(rawRetryAfter) ? Number(rawRetryAfter) * 1000 : Date.parse(rawRetryAfter) - Date.now();
        if (Number.isFinite(retry)) delay = Math.max(delay, retry);
      }
      if (response.status === 429) delay = Math.max(delay, 60000);
      await response.body?.cancel().catch(() => undefined);
      if (!retryable || attempt + 1 === this.#attempts || delay > 300000)
        throw new ChamanError(response.status, requestId, retryable, retryable ? delay : null);
      await this.#sleep(delay);
    }
  }
  services() { return this.#request('GET', '/servicios'); }
  catalog({ cultivo, pagina = 0 } = {}) {
    if (!Number.isInteger(pagina) || pagina < 0 || pagina > 10000) throw new Error('Página inválida.');
    const q = new URLSearchParams({ pagina: String(pagina) });
    if (cultivo) q.set('cultivo', cultivo);
    return this.#request('GET', '/catalogos/semillas?' + q);
  }
  getResource(type, id) {
    if (!TYPES.has(type)) throw new Error('Tipo de recurso no admitido.');
    return this.#request('GET', `/${type}/${externalId(id)}`);
  }
  registerProducer(id, nombre) { return this.#request('PUT', `/productores/${externalId(id)}`, { body: { nombre } }); }
  registerOwnEstablishment(id, nombre) {
    return this.#request('PUT', `/establecimientos/${externalId(id)}`, { body: { nombre, carteraPropiaAsesor: true } });
  }
  registerProducerEstablishment(id, nombre, productorIdExterno) {
    externalId(productorIdExterno);
    return this.#request('PUT', `/establecimientos/${externalId(id)}`, { body: { nombre, productorIdExterno } });
  }
  registerLot(id, { nombre, establecimientoIdExterno, ubicacion, superficieHa }) {
    externalId(establecimientoIdExterno);
    return this.#request('PUT', `/lotes/${externalId(id)}`, { body: { nombre, establecimientoIdExterno, ubicacion, superficieHa } });
  }
  registerSowing(id, { loteIdExterno, idSemilla, fechaSiembra }) {
    externalId(loteIdExterno);
    return this.#request('PUT', `/siembras/${externalId(id)}`, { body: { loteIdExterno, idSemilla, fechaSiembra } });
  }
  phenology(sowingId, etag) { return this.#request('GET', `/siembras/${externalId(sowingId)}/fenologia`, { etag }); }
}
/** Store contract: async get(key), async set(key,value). Implement durably in YOUR database.
 * Keys must be namespaced by environment + Chamán integration, not just sowing ID.
 * Run serially per sowing or provide your own lock/CAS for concurrent workers. */
async function syncPhenology({ client, store, namespace, sowingId }) {
  if (!namespace || typeof namespace !== 'string') throw new Error('Namespace de integración requerido.');
  externalId(sowingId);
  const key = JSON.stringify([namespace, sowingId]);
  const previous = await store.get(key);
  const response = await client.phenology(sowingId, previous?.result ? previous.etag : undefined);
  if (response.unchanged) {
    if (!previous?.result) throw new Error('304 sin lectura anterior; consultar sin ETag.');
    return { changed: false, result: previous.result, checkedAt: new Date().toISOString() };
  }
  const result = response.data;
  if (!result || result.siembraIdExterno !== sowingId || !/^[a-f0-9]{64}$/.test(result.revision || ''))
    throw new Error('Respuesta fenológica inesperada; se conserva el dato anterior.');
  const changed = previous?.result?.revision !== result.revision;
  // Pending/null is a valid state. Never replace it with a fabricated zero/stage.
  await store.set(key, { result, etag: response.etag, checkedAt: new Date().toISOString(),
    lastAvailable: result.etapa ? result : previous?.lastAvailable || (previous?.result?.etapa ? previous.result : null) });
  return { changed, pending: response.pending, result };
}
module.exports = { ChamanClient, ChamanError, syncPhenology, BASE_URLS };
