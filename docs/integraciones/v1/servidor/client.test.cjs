'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ChamanClient, ChamanError, syncPhenology, BASE_URLS } = require('./chaman-client.cjs');
const { registerScenario, fictitiousScenarios } = require('./demo.cjs');
const key = 'chm_test_sdkdemo.' + 'x'.repeat(43);
const revision = 'a'.repeat(64), etag = '"' + revision + '"';
const ok = data => new Response(JSON.stringify(data), { status: 200, headers: { ETag: etag } });
function fixture(responses) {
  const calls = [], sleeps = [];
  const client = new ChamanClient({ environment: 'testing', apiKey: key, random: () => 0,
    sleep: async ms => { sleeps.push(ms); }, fetchImpl: async (url, opts) => {
      calls.push({ url, ...opts }); const result = responses.shift();
      if (result instanceof Error) throw result;
      return typeof result === 'function' ? result() : result || ok({ creado: true });
    } });
  return { client, calls, sleeps };
}
test('rejects an unknown environment and cross-environment key before networking', () => {
  assert.throws(() => new ChamanClient({ environment: 'elsewhere', apiKey: key }));
  assert.throws(() => new ChamanClient({ environment: 'production', apiKey: key }));
});
test('own establishment excludes producer and never sends owner ID', async () => {
  const f = fixture([]); await f.client.registerOwnEstablishment('campo-1', 'Campo');
  assert.equal(f.calls[0].url, BASE_URLS.testing + '/establecimientos/campo-1');
  assert.deepEqual(JSON.parse(f.calls[0].body), { nombre: 'Campo', carteraPropiaAsesor: true });
  assert.equal(f.calls[0].redirect, 'error');
  assert.equal(f.calls[0].headers['x-api-key'], key);
  assert.ok(!JSON.stringify(f.client).includes(key));
});
test('producer path uses the explicit external producer ID', async () => {
  const f = fixture([]); await f.client.registerProducerEstablishment('campo-1', 'Campo', 'prod-1');
  assert.deepEqual(JSON.parse(f.calls[0].body), { nombre: 'Campo', productorIdExterno: 'prod-1' });
  assert.throws(() => f.client.getResource('lotes', '../usuarios'));
});
test('timeout after uncertain write retries exactly the same ID/body', async () => {
  const f = fixture([new Error('secret nested URL ' + key), ok({ creado: false })]);
  const response = await f.client.registerProducer('prod-1', 'Demo');
  assert.equal(response.data.creado, false); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].url, f.calls[1].url); assert.equal(f.calls[0].body, f.calls[1].body);
  assert.deepEqual(f.sleeps, [1000]);
});
test('429 honors retry-after without retrying early', async () => {
  const f = fixture([new Response('', { status: 429, headers: { 'Retry-After': '120' } }), ok({})]);
  await f.client.services(); assert.deepEqual(f.sleeps, [120000]);
});
test('excessive Retry-After returns its delay to the scheduler', async () => {
  const f = fixture([new Response('', { status: 429, headers: { 'Retry-After': '600' } })]);
  await assert.rejects(f.client.services(), e => e.status === 429 && e.retryAfterMs === 600000);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.sleeps, []);
});
test('403 and 409 are not retried; response secret is never in thrown error', async () => {
  for (const status of [403, 409]) {
    const f = fixture([new Response(key, { status, headers: { 'X-Request-Id': 'req-123' } })]);
    await assert.rejects(f.client.services(), e => e instanceof ChamanError && e.status === status &&
      e.requestId === 'req-123' && !e.message.includes(key) && !JSON.stringify(e).includes(key));
    assert.equal(f.calls.length, 1);
  }
});
test('retries are bounded and network causes are not leaked', async () => {
  const f = fixture([new Error(key), new Error(key), new Error(key)]);
  await assert.rejects(f.client.services(), e => e.status === 0 && !e.cause && !e.stack.includes(key));
  assert.equal(f.calls.length, 3);
});
test('304 preserves stored result and uses ETag only with existing result', async () => {
  const result = { siembraIdExterno: 's-1', revision, etapa: 'Emergencia' };
  const f = fixture([new Response(null, { status: 304 })]);
  const map = new Map([[JSON.stringify(['testing:client', 's-1']), { result, etag }]]);
  let writes = 0;
  const output = await syncPhenology({ client: f.client, namespace: 'testing:client', sowingId: 's-1',
    store: { get: async k => map.get(k), set: async () => { writes++; } } });
  assert.equal(output.changed, false); assert.equal(output.result, result); assert.equal(writes, 0);
  assert.equal(f.calls[0].headers['If-None-Match'], etag);
});
test('pending is stored explicitly, not converted to zero or a fake stage', async () => {
  const result = { siembraIdExterno: 's-1', revision, etapa: null, estado: 'pendiente' };
  const f = fixture([new Response(JSON.stringify(result), { status: 202, headers: { ETag: etag } })]);
  let stored;
  const output = await syncPhenology({ client: f.client, namespace: 'production:client', sowingId: 's-1',
    store: { get: async () => null, set: async (k, value) => { stored = { k, value }; } } });
  assert.equal(output.pending, true); assert.equal(stored.value.result.etapa, null);
  assert.equal(stored.k, JSON.stringify(['production:client', 's-1']));
  assert.ok(!f.calls[0].headers['If-None-Match']);
});
test('a failed refresh does not overwrite the stored result', async () => {
  const f = fixture([new Response('', { status: 401 })]); let writes = 0;
  await assert.rejects(syncPhenology({ client: f.client, namespace: 'test:client', sowingId: 's-1',
    store: { get: async () => ({ result: { etapa: 'Emergencia' }, etag }), set: async () => { writes++; } } }));
  assert.equal(writes, 0);
});
test('demo implements both routes, all names fictitious, stable IDs and no synthetic producer for own fields', async () => {
  const scenarios = fictitiousScenarios({ idSemilla: 'b'.repeat(24), fechaSiembra: '2026-09-01' });
  const f = fixture([]);
  for (const input of scenarios) await registerScenario(f.client, input);
  assert.equal(f.calls.filter(c => c.method === 'PUT' && c.url.includes('/productores/')).length, 1);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 7);
  assert.ok(f.calls.filter(c => c.method === 'PUT').every(c => c.url.includes('demo-api-20260912')));
  assert.ok(f.calls.filter(c => c.method === 'PUT' && !c.url.includes('/siembras/')).every(c => JSON.parse(c.body).nombre.startsWith('DEMO API')));
});
