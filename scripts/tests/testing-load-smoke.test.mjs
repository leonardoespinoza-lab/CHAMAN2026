import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BASE,
  assertTestingTarget,
  percentile,
  summarize,
} from './testing-load-smoke.mjs';

test('solo permite el endpoint canonico de testing', () => {
  assert.equal(assertTestingTarget(DEFAULT_BASE).hostname, 'testing-api-testing.up.railway.app');
  assert.throws(() => assertTestingTarget('https://app.chamanagro.ar'));
  assert.throws(() => assertTestingTarget('https://chaman-api-production.up.railway.app/sdc-quimica'));
  assert.throws(() => assertTestingTarget('http://testing-api-testing.up.railway.app/sdc-quimica-test'));
});

test('calcula percentiles y resume estados sin esconder errores', () => {
  assert.equal(percentile([10, 20, 30, 40], 0.95), 40);
  const summary = summarize(
    [
      { status: 400, durationMs: 10 },
      { status: 400, durationMs: 20 },
      { status: 503, durationMs: 30 },
      { status: 0, durationMs: 40, error: 'timeout' },
    ],
    new Set([400]),
  );
  assert.equal(summary.requests, 4);
  assert.equal(summary.serverErrors, 1);
  assert.equal(summary.unexpected, 2);
  assert.equal(summary.statusCounts.network_error, 1);
  assert.equal(summary.minMs, 10);
  assert.equal(summary.p95Ms, 40);
});
