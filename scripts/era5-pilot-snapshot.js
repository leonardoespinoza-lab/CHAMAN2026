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
  const cwd = path.resolve(__dirname, '..');
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8', cwd }).trim();
  if (dirty) throw new Error('El worktree debe estar limpio: codeSha debe identificar exactamente el codigo ejecutado.');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('No se pudo sellar el codeSha ejecutado.');
  return sha;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['plan', 'snapshot', 'verify', 'restore'].includes(args.mode)) throw new Error('Modo permitido: plan, snapshot, verify o restore.');
  const bundleDir = args.bundle ? path.resolve(args.bundle) : undefined;
  const { MongoClient, ObjectId, EJSON } = loadMongoDriver();
  let bundle;
  let config;
  if (args.mode === 'plan' || args.mode === 'snapshot') {
    config = toolkit.operationConfig(args);
  } else {
    if (!bundleDir) throw new Error('--bundle es obligatorio para verify/restore.');
    bundle = toolkit.loadBundle(bundleDir, EJSON);
    config = toolkit.operationConfig({
      operationId: bundle.manifest.operationId,
      lotId: bundle.manifest.lotId,
      sowingId: bundle.manifest.sowingId,
      from: bundle.manifest.weatherWindow.from,
      to: bundle.manifest.weatherWindow.to,
      historicalStart: bundle.manifest.bridgeConfig.historicalStart,
      bridgeToday: bundle.manifest.bridgeConfig.bridgeToday,
    });
  }
  const executionCodeSha = codeSha();
  if (bundle) toolkit.assertCodeIdentity(bundle.manifest, executionCodeSha);
  const uriEnv = args.uriEnv || 'CHAMAN_TESTING_MONGODB_URI';
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(uriEnv)) throw new Error('uri-env debe ser un nombre de variable seguro.');
  const uri = process.env[uriEnv];
  const clusterAttestation = toolkit.loadAttestationFile(process.env.CHAMAN_TESTING_CLUSTER_ATTESTATION_FILE, 'cluster-testing');
  const safetyAttestation = toolkit.loadAttestationFile(process.env.CHAMAN_ERA5_PILOT_SAFETY_ATTESTATION_FILE, 'seguridad-operativa');
  const endpointFingerprint = toolkit.testingClusterFingerprint(uri);
  toolkit.assertTestingOnly({ uri, attestation: clusterAttestation, operationId: config.operationId });
  toolkit.assertSafetyAttestation(safetyAttestation, {
    operationId: config.operationId,
    endpointFingerprint,
    codeSha: executionCodeSha,
  });
  const client = new MongoClient(uri, { appName: 'chaman-era5-pilot-snapshot', serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(toolkit.DB_NAME);
    await db.command({ ping: 1 });

    if (args.mode === 'plan' || args.mode === 'snapshot') {
      const { scope, state } = await toolkit.readConsistentScope({ client, db, config, ObjectId, EJSON });
      toolkit.assertNoSecrets(state);
      toolkit.assertCodeIdentity({ codeSha: executionCodeSha }, codeSha());
      const plan = toolkit.buildPlan(config, scope, state, executionCodeSha, EJSON);
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

    if (args.mode === 'verify') {
      const queries = toolkit.sealedQueries(bundle.manifest, ObjectId);
      const currentState = await toolkit.readConsistentState({
        client, db, queries, EJSON,
        coverage: {
          scope: toolkit.manifestBridgeScope(bundle.manifest),
          config: toolkit.manifestBridgeConfig(bundle.manifest),
        },
      });
      toolkit.assertCodeIdentity(bundle.manifest, codeSha());
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

    const restoreCodeSha = codeSha();
    toolkit.assertCodeIdentity(bundle.manifest, restoreCodeSha);
    const outcome = await toolkit.restoreBundle({
      client,
      db,
      bundle,
      ObjectId,
      EJSON,
      confirmation: process.env.CHAMAN_ERA5_PILOT_CONFIRM,
      bundleDir,
      currentCodeSha: restoreCodeSha,
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
