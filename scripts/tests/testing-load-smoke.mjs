#!/usr/bin/env node

/**
 * Carga controlada para el borde HTTP de CHAMAN.
 *
 * Esta herramienta se niega a ejecutar contra produccion. El escenario de
 * login envia JSON malformado: ejercita proxy, TLS, body parser, limites y
 * manejo de errores sin crear sesiones, tokens ni trabajos de cache warming.
 */

import { pathToFileURL } from 'node:url';

export const DEFAULT_BASE = 'https://testing-api-testing.up.railway.app/sdc-quimica-test';
export const TESTING_HOSTS = new Set(['testing-api-testing.up.railway.app']);

export function assertTestingTarget(value) {
  const target = new URL(value);
  if (
    target.protocol !== 'https:' ||
    !TESTING_HOSTS.has(target.hostname) ||
    !/^\/sdc-quimica-test\/?$/.test(target.pathname)
  ) {
    throw new Error(
      `Destino rechazado: ${target.origin}${target.pathname}. ` +
        'La carga solo puede ejecutarse contra la API de testing de CHAMAN.',
    );
  }
  return target;
}

export function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function summarize(samples, expectedStatuses) {
  const latencies = samples.map((sample) => sample.durationMs);
  const statusCounts = {};
  for (const sample of samples) {
    const key = sample.error ? 'network_error' : String(sample.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  const unexpected = samples.filter(
    (sample) => sample.error || !expectedStatuses.has(sample.status),
  ).length;
  const serverErrors = samples.filter((sample) => sample.status >= 500).length;
  return {
    requests: samples.length,
    statusCounts,
    minMs: Math.round(latencies.length ? Math.min(...latencies) : 0),
    meanMs: Math.round(latencies.reduce((total, value) => total + value, 0) / Math.max(1, latencies.length)),
    p50Ms: Math.round(percentile(latencies, 0.5)),
    p95Ms: Math.round(percentile(latencies, 0.95)),
    p99Ms: Math.round(percentile(latencies, 0.99)),
    maxMs: Math.round(Math.max(...latencies, 0)),
    unexpected,
    serverErrors,
  };
}

function parseArgs(argv) {
  const result = {
    base: DEFAULT_BASE,
    scenario: 'all',
    confirmTesting: false,
    stageSeconds: 20,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') result.base = argv[++index];
    else if (arg === '--scenario') result.scenario = argv[++index];
    else if (arg === '--stage-seconds') result.stageSeconds = Number(argv[++index]);
    else if (arg === '--confirm-testing') result.confirmTesting = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else throw new Error(`Argumento no reconocido: ${arg}`);
  }
  if (!['all', 'health', 'login-parser'].includes(result.scenario)) {
    throw new Error(`Escenario invalido: ${result.scenario}`);
  }
  if (!Number.isFinite(result.stageSeconds) || result.stageSeconds < 1 || result.stageSeconds > 120) {
    throw new Error('--stage-seconds debe estar entre 1 y 120.');
  }
  return result;
}

async function requestSample(url, init) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });
    await response.arrayBuffer();
    return {
      status: response.status,
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 0,
      durationMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runRateStage({ name, url, init, rate, seconds, expectedStatuses }) {
  const samples = [];
  const pending = new Set();
  const intervalMs = 1_000 / rate;
  const total = Math.max(1, Math.round(rate * seconds));
  let nextAt = performance.now();

  for (let index = 0; index < total; index += 1) {
    const delay = Math.max(0, nextAt - performance.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const pendingRequest = requestSample(url, init)
      .then((sample) => samples.push(sample))
      .finally(() => pending.delete(pendingRequest));
    pending.add(pendingRequest);
    nextAt += intervalMs;
  }
  await Promise.all(pending);
  const summary = summarize(samples, expectedStatuses);
  process.stdout.write(`${JSON.stringify({ stage: name, rate, seconds, ...summary })}\n`);

  const serverErrorRatio = summary.serverErrors / Math.max(1, summary.requests);
  if (serverErrorRatio > 0.01 || summary.unexpected > 0 || summary.p95Ms > 2_000) {
    throw new Error(
      `Abortado ${name}: 5xx=${(serverErrorRatio * 100).toFixed(2)}%, ` +
        `inesperadas=${summary.unexpected}, p95=${summary.p95Ms}ms.`,
    );
  }
  return summary;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const target = assertTestingTarget(options.base);
  if (!options.confirmTesting && !options.dryRun) {
    throw new Error('Falta --confirm-testing. La confirmacion explicita evita ejecutar carga por accidente.');
  }

  const plan = {
    target: target.toString(),
    scenario: options.scenario,
    stageSeconds: options.stageSeconds,
    productionAllowed: false,
    stages:
      options.scenario === 'health'
        ? ['health:1rps']
        : options.scenario === 'login-parser'
          ? ['login-parser:2rps', 'login-parser:5rps', 'login-parser:8rps']
          : ['health:1rps', 'login-parser:2rps', 'login-parser:5rps', 'login-parser:8rps'],
  };
  process.stdout.write(`${JSON.stringify({ plan })}\n`);
  if (options.dryRun) return plan;

  const results = [];
  if (options.scenario === 'all' || options.scenario === 'health') {
    const healthUrl = new URL('/health', target.origin);
    results.push(
      await runRateStage({
        name: 'health',
        url: healthUrl,
        init: { method: 'GET', headers: { accept: 'application/json' } },
        rate: 1,
        seconds: options.stageSeconds,
        expectedStatuses: new Set([200]),
      }),
    );
  }

  if (options.scenario === 'all' || options.scenario === 'login-parser') {
    const loginUrl = new URL(`${target.pathname.replace(/\/$/, '')}/auth/login`, target.origin);
    for (const rate of [2, 5, 8]) {
      results.push(
        await runRateStage({
          name: `login-parser-${rate}rps`,
          url: loginUrl,
          init: {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              origin: 'https://testing-web-testing-dc8e.up.railway.app',
            },
            body: '{',
          },
          rate,
          seconds: options.stageSeconds,
          expectedStatuses: new Set([400]),
        }),
      );
    }
  }

  process.stdout.write(`${JSON.stringify({ completed: true, results })}\n`);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
