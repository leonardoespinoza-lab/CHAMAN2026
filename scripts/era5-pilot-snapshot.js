#!/usr/bin/env node

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const toolkit = require('./lib/era5-pilot-snapshot');

function parseArgs(argv) {
  const result = { mode: argv[0] || 'plan' };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--record-post-state') {
      result.recordPostState = true;
      continue;
    }
    if (!token.startsWith('--') || index + 1 >= argv.length) throw new Error(`Argumento invalido: ${token}`);
    result[token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = argv[++index];
  }
  return result;
}

function loadMongoDriver() {
  try {
    const driver = require('../sdc-datos/node_modules/mongodb');
    if (!driver.BSON?.EJSON) throw new Error('EJSON no disponible');
    return { ...driver, EJSON: driver.BSON.EJSON };
  } catch {
    throw new Error('Falta el driver Mongo. Ejecute npm ci en sdc-datos; la herramienta no instala dependencias automaticamente.');
  }
}

function codeSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') }).trim();
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['plan', 'snapshot', 'verify', 'restore'].includes(args.mode)) throw new Error('Modo permitido: plan, snapshot, verify o restore.');
  const uriEnv = args.uriEnv || 'CHAMAN_TESTING_MONGODB_URI';
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(uriEnv)) throw new Error('uri-env debe ser un nombre de variable seguro.');
  const uri = process.env[uriEnv];
  toolkit.assertTestingOnly({ uri });
  toolkit.assertSafetyAttestation();
  const { MongoClient, ObjectId, EJSON } = loadMongoDriver();
  const client = new MongoClient(uri, { appName: 'chaman-era5-pilot-snapshot', serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(toolkit.DB_NAME);
    await db.command({ ping: 1 });
    const bundleDir = args.bundle ? path.resolve(args.bundle) : undefined;

    if (args.mode === 'plan' || args.mode === 'snapshot') {
      const config = toolkit.operationConfig(args);
      const { scope, state } = await toolkit.readConsistentScope({ client, db, config, ObjectId, EJSON });
      toolkit.assertNoSecrets(state);
      const plan = toolkit.buildPlan(config, scope, state, codeSha(), EJSON);
      if (args.mode === 'plan') {
        print({ mode: 'plan', ...plan, requiredConfirmation: toolkit.confirmationForSnapshot(plan) });
        return;
      }
      if (!bundleDir) throw new Error('--bundle es obligatorio para snapshot.');
      if (process.env.CHAMAN_ERA5_PILOT_CONFIRM !== toolkit.confirmationForSnapshot(plan)) throw new Error('Confirmacion de snapshot ausente o incorrecta.');
      const manifest = toolkit.writeBundle(bundleDir, plan, state, EJSON);
      print({ mode: 'snapshot', status: 'created', bundleDir, manifestSha256: manifest.manifestSha256 });
      return;
    }

    if (!bundleDir) throw new Error('--bundle es obligatorio para verify/restore.');
    const bundle = toolkit.loadBundle(bundleDir, EJSON);
    const config = toolkit.operationConfig({
      operationId: bundle.manifest.operationId,
      lotId: bundle.manifest.lotId,
      sowingId: bundle.manifest.sowingId,
      from: bundle.manifest.weatherWindow.from,
      to: bundle.manifest.weatherWindow.to,
    });
    const { scope, queries, state: currentState } = await toolkit.readConsistentScope({ client, db, config, ObjectId, EJSON });
    if (scope.gridPointKey !== bundle.manifest.gridPointKey) throw new Error('El binding actual no coincide con el manifiesto.');

    if (args.mode === 'verify') {
      toolkit.assertNoSecrets(currentState);
      const summary = toolkit.stateSummary(currentState);
      if (args.recordPostState) {
        const record = toolkit.recordPostState(bundleDir, bundle.manifest, summary, EJSON);
        print({
          mode: 'verify',
          status: 'post_state_recorded',
          postStateSha256: record.postStateSha256,
          requiredRestoreConfirmation: toolkit.confirmationForRestore(bundle.manifest, record.postStateSha256),
        });
      } else {
        toolkit.assertSummaryEqual(summary, bundle.manifest.collections, 'verificacion pre-piloto');
        print({ mode: 'verify', status: 'matches_snapshot', manifestSha256: bundle.manifest.manifestSha256 });
      }
      return;
    }

    const outcome = await toolkit.restoreBundle({
      client,
      db,
      bundle,
      queries,
      EJSON,
      confirmation: process.env.CHAMAN_ERA5_PILOT_CONFIRM,
      bundleDir,
    });
    print({ mode: 'restore', status: outcome, manifestSha256: bundle.manifest.manifestSha256 });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
});
