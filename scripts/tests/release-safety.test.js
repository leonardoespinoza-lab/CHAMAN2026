const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildReleaseManifest,
  collectRailwayDeploymentEvidence,
  collectVersionEvidence,
  loadTopology,
  validateFrozenDeploymentList,
  validateReleaseManifest,
} = require('../release-safety');
const {
  REQUIRED_ASSETS,
  detectAssets,
} = require('../check-chaman-meteo-release-assets');
const { verifyFrozenServicesLive } = require('../verify-frozen-services-live');

const RELEASE_SHA = '1111111111111111111111111111111111111111';
const ROLLBACK_SHA = '0000000000000000000000000000000000000000';
const FROZEN_SHA = '641c71f6e2f31b209c20ba831d456f93595ca710';
const FROZEN_DEPLOYMENT_ID = '6330715f-d04a-4766-9935-e93649d4a0ee';
const FROZEN_IMAGE_DIGEST = 'sha256:620c67d627fd7396550530ead36e91039fbcca041e0b80c09f782c3978bd8683';

function deploymentBaseline(environment) {
  const topology = loadTopology(path.join(__dirname, '..', '..'));
  return {
    schemaVersion: 1,
    environment,
    readOnlyEvidence: true,
    doNotDeploy: true,
    services: topology.services
      .filter((service) => service.selector.startsWith('sdc-'))
      .map((service, index) => {
        const frozen = environment === 'testing' && service.role === 'lora';
        return {
          role: service.role,
          service: service[environment],
          deploymentId: frozen
            ? FROZEN_DEPLOYMENT_ID
            : `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          ...(frozen
            ? {
                observedSha: FROZEN_SHA,
                imageDigest: FROZEN_IMAGE_DIGEST,
                cliMessage: '641c71f Milesight LoRa validation',
              }
            : {}),
        };
      }),
    ...(environment === 'testing'
      ? {
          testingSafety: {
            loraBroker: 'testing',
            LORAWAN_MQTT_ENABLED: false,
            capturedWithSkipDeploys: true,
            testingLoraExpectedSha: FROZEN_SHA,
            testingLoraMustRemainUntouched: true,
          },
        }
      : {}),
  };
}

function manifest(overrides = {}) {
  const environment = overrides.environment || 'testing';
  return buildReleaseManifest({
    topology: loadTopology(path.join(__dirname, '..', '..')),
    sha: RELEASE_SHA,
    previousSha: ROLLBACK_SHA,
    version: '2026.08.28-rc.1',
    builtAt: '2026-08-28T16:30:00.000Z',
    environment,
    migrations: [],
    deploymentBaseline: deploymentBaseline(environment),
    ...overrides,
  });
}

test('Testing manifest promotes 11 services and freezes LoRa at its exact baseline', () => {
  const value = manifest();
  assert.ok(value.services.some((service) => service.role === 'meteo-worker'));
  assert.equal(value.schemaVersion, 2);
  assert.equal(value.services.filter((service) => service.deploymentMode === 'promote').length, 11);
  const frozen = value.services.find((service) => service.role === 'lora');
  assert.equal(frozen.deploymentMode, 'frozen');
  assert.equal(frozen.expectedSha, FROZEN_SHA);
  assert.equal(frozen.rollbackSha, FROZEN_SHA);
  assert.equal(frozen.baselineDeploymentId, FROZEN_DEPLOYMENT_ID);
  assert.equal(frozen.expectedImageDigest, FROZEN_IMAGE_DIGEST);
  assert.equal(frozen.expectedCliMessage, '641c71f Milesight LoRa validation');
  assert.equal(frozen.shaProvenance, 'railway-cli-message+git-resolution');
  assert.equal(frozen.verification, 'railway-deployment-metadata');
  assert.ok(value.services
    .filter((service) => service.deploymentMode === 'promote')
    .every((service) => service.expectedSha === RELEASE_SHA && service.rollbackSha === ROLLBACK_SHA));
  assert.deepEqual(
    value.services
      .filter((service) => service.verification === 'endpoint')
      .map((service) => service.selector)
      .sort(),
    ['sdc-api-cliente', 'sdc-datos'],
  );
});

test('manifest validation rejects split SHAs and unrecognized fields', () => {
  const topology = loadTopology(path.join(__dirname, '..', '..'));
  const split = manifest();
  split.services[0].expectedSha = ROLLBACK_SHA;
  assert.throws(() => validateReleaseManifest(split, topology), /expectedSha/);

  const leaked = manifest();
  leaked.services[0].MONGO_URI = 'mongodb://must-not-be-recorded';
  assert.throws(() => validateReleaseManifest(leaked, topology), /campo no permitido MONGO_URI/);
});

test('frozen LoRa cannot be repointed to another SHA, deployment, image or endpoint', () => {
  const topology = loadTopology(path.join(__dirname, '..', '..'));
  for (const [field, value, pattern] of [
    ['expectedSha', RELEASE_SHA, /SHA protegido/],
    ['rollbackSha', ROLLBACK_SHA, /frozen no puede cambiar/],
    ['baselineDeploymentId', '00000000-0000-4000-8000-999999999999', /deployment protegido/],
    ['expectedImageDigest', `sha256:${'f'.repeat(64)}`, /imagen protegida/],
    ['verification', 'endpoint', /metadata de Railway/],
  ]) {
    const altered = manifest();
    altered.services.find((service) => service.role === 'lora')[field] = value;
    assert.throws(() => validateReleaseManifest(altered, topology), pattern);
  }
});

test('manifest requires a complete read-only deployment baseline', () => {
  const incomplete = deploymentBaseline('testing');
  incomplete.services.pop();
  assert.throws(
    () => manifest({ deploymentBaseline: incomplete }),
    /baseline: falta/,
  );
  assert.ok(manifest().services.every((service) => service.baselineDeploymentId));
});

test('frozen baseline requires the exact full SHA, deployment and image from topology', () => {
  for (const [field, value, pattern] of [
    ['observedSha', '641c71f', /observedSha completo/],
    ['observedSha', 'f'.repeat(40), /observedSha no coincide/],
    ['deploymentId', '00000000-0000-4000-8000-999999999999', /deploymentId no coincide/],
    ['imageDigest', `sha256:${'f'.repeat(64)}`, /imageDigest no coincide/],
  ]) {
    const baseline = deploymentBaseline('testing');
    baseline.services.find((service) => service.role === 'lora')[field] = value;
    assert.throws(() => manifest({ deploymentBaseline: baseline }), pattern);
  }
});

test('release core rejects a second frozen role or a topology without frozen LoRa', () => {
  const secondFrozen = structuredClone(loadTopology(path.join(__dirname, '..', '..')));
  secondFrozen.services.find((service) => service.role === 'auth').testingPromotion = structuredClone(
    secondFrozen.services.find((service) => service.role === 'lora').testingPromotion,
  );
  assert.throws(() => manifest({ topology: secondFrozen }), /única excepción.*testing-lora/);

  const missingFrozen = structuredClone(loadTopology(path.join(__dirname, '..', '..')));
  delete missingFrozen.services.find((service) => service.role === 'lora').testingPromotion;
  assert.throws(() => manifest({ topology: missingFrozen }), /única excepción.*testing-lora/);
});

test('only additive, non-startup migrations are accepted', () => {
  assert.doesNotThrow(() =>
    manifest({
      migrations: [
        {
          id: '20260828-chaman-meteo-v2-read-indexes-v1',
          kind: 'additive-indexes',
          planCommand: 'npm run migrate:chaman-meteo-v2-indexes:plan',
          applyCommand: 'npm run migrate:chaman-meteo-v2-indexes:apply',
          rollbackCommand: 'npm run migrate:chaman-meteo-v2-indexes:rollback',
          rollbackScope: 'created-artifacts-only',
          startupAllowed: false,
        },
      ],
    }),
  );
  assert.throws(
    () =>
      manifest({
        migrations: [
          {
            id: 'dangerous-rewrite',
            kind: 'data-rewrite',
            planCommand: 'npm run migrate:danger:plan',
            applyCommand: 'npm run migrate:danger:apply',
            rollbackCommand: 'npm run migrate:danger:rollback',
            rollbackScope: 'created-artifacts-only',
            startupAllowed: false,
          },
        ],
      }),
    /sólo se permiten migraciones aditivas/,
  );
});

test('production is blocked without governance, backup and restore evidence', () => {
  assert.throws(
    () => manifest({ environment: 'production' }),
    /branchProtectionVerified=true/,
  );
  assert.doesNotThrow(() =>
    manifest({
      environment: 'production',
      backupEvidence: 'mongo-logical-backup-20260828-1630z',
      restoreRehearsalEvidence: 'mongo-restore-drill-testing-20260828',
      branchProtectionVerified: true,
      railwayWaitForCiVerified: true,
      productionAutoDeployPaused: true,
    }),
  );
  const production = manifest({
    environment: 'production',
    backupEvidence: 'mongo-logical-backup-20260828-1630z',
    restoreRehearsalEvidence: 'mongo-restore-drill-testing-20260828',
    branchProtectionVerified: true,
    railwayWaitForCiVerified: true,
    productionAutoDeployPaused: true,
  });
  assert.ok(production.services.every((service) => service.deploymentMode === 'promote'));
  assert.ok(production.services.every((service) => service.expectedSha === RELEASE_SHA));
});

test('online evidence checks only allowlisted /version fields and exact SHA', async () => {
  const value = manifest();
  const environment = {};
  for (const service of value.services.filter((item) => item.versionUrlEnv)) {
    environment[service.versionUrlEnv] = `https://testing.example/${service.role}/version`;
  }
  const result = await collectVersionEvidence(value, {
    environment,
    fetchImpl: async (url) => {
      const service = value.services.find((item) => url.pathname.includes(`/${item.role}/`));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          schemaVersion: 1,
          service: service.selector,
          sha: RELEASE_SHA,
          version: '2026.08.28-rc.1',
          builtAt: '2026-08-28T16:30:00.000Z',
          MONGO_URI: 'this extra value is ignored and never copied to evidence',
        }),
      };
    },
  });
  assert.equal(result.evidence.length, 2);
  assert.ok(result.evidence.every((item) => !Object.hasOwn(item, 'MONGO_URI')));
  assert.ok(result.pendingRoles.includes('meteo-worker'));
  assert.ok(result.pendingRoles.includes('lora'));
  assert.ok(!result.missingVersionRoles.includes('lora'));
});

test('/version evidence must match manifest version and build date exactly', async () => {
  const value = manifest();
  const environment = {};
  for (const service of value.services.filter((item) => item.versionUrlEnv)) {
    environment[service.versionUrlEnv] = `https://testing.example/${service.role}/version`;
  }
  await assert.rejects(
    () =>
      collectVersionEvidence(value, {
        environment,
        fetchImpl: async (url) => {
          const service = value.services.find((item) => url.pathname.includes(`/${item.role}/`));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: 1,
              service: service.selector,
              sha: RELEASE_SHA,
              version: '2026.08.27-stale',
              builtAt: '2026-08-27T16:30:00.000Z',
            }),
          };
        },
      }),
    /version .* no coincide/,
  );

  await assert.rejects(
    () =>
      collectVersionEvidence(value, {
        environment,
        fetchImpl: async (url) => {
          const service = value.services.find((item) => url.pathname.includes(`/${item.role}/`));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: 1,
              service: service.selector,
              sha: RELEASE_SHA,
              version: value.release.version,
              builtAt: '2026-08-27T16:30:00.000Z',
            }),
          };
        },
      }),
    /builtAt .* no coincide/,
  );
});

test('Railway evidence covers promoted services and proves frozen LoRa stayed untouched', () => {
  const value = manifest();
  const pending = value.services.filter(
    (service) => service.verification === 'railway-deployment-metadata',
  );
  const document = {
    schemaVersion: 1,
    environment: 'testing',
    capturedAt: '2026-08-28T17:00:00.000Z',
    readOnlyEvidence: true,
    services: pending.map((service, index) => {
      const frozen = service.deploymentMode === 'frozen';
      return {
        role: service.role,
        service: service.service,
        sha: service.expectedSha,
        deploymentId: frozen
          ? FROZEN_DEPLOYMENT_ID
          : `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        ...(frozen ? { imageDigest: FROZEN_IMAGE_DIGEST } : {}),
        status: 'SUCCESS',
        source: 'railway-public-api',
      };
    }),
  };
  const evidenceOptions = { now: '2026-08-28T17:05:00.000Z' };
  const result = collectRailwayDeploymentEvidence(value, document, evidenceOptions);
  assert.equal(result.evidence.length, pending.length);
  assert.deepEqual(result.frozenRoles, ['lora']);

  const stale = structuredClone(document);
  stale.services[0].sha = ROLLBACK_SHA;
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, stale, evidenceOptions),
    /SHA incorrecto/,
  );

  const incomplete = structuredClone(document);
  incomplete.services.pop();
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, incomplete, evidenceOptions),
    /railwayEvidence: falta/,
  );

  const movedFrozen = structuredClone(document);
  movedFrozen.services.find((service) => service.role === 'lora').deploymentId =
    '00000000-0000-4000-8000-999999999999';
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, movedFrozen, evidenceOptions),
    /frozen cambió de deployment/,
  );

  const changedImage = structuredClone(document);
  changedImage.services.find((service) => service.role === 'lora').imageDigest =
    `sha256:${'f'.repeat(64)}`;
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, changedImage, evidenceOptions),
    /frozen cambió de imagen/,
  );

  const rollback = structuredClone(document);
  for (const item of rollback.services) {
    const service = value.services.find((candidate) => candidate.role === item.role);
    item.sha = service.rollbackSha;
  }
  assert.doesNotThrow(() =>
    collectRailwayDeploymentEvidence(value, rollback, { ...evidenceOptions, mode: 'rollback' }),
  );
  assert.equal(rollback.services.find((service) => service.role === 'lora').sha, FROZEN_SHA);

  for (const [capturedAt, pattern] of [
    ['2000-01-01T00:00:00.000Z', /evidencia vencida/],
    ['2026-08-28T17:08:00.000Z', /capturedAt está en el futuro/],
    ['2026-08-28T16:29:59.000Z', /evidencia anterior al release/],
  ]) {
    const invalidTime = structuredClone(document);
    invalidTime.capturedAt = capturedAt;
    assert.throws(
      () => collectRailwayDeploymentEvidence(value, invalidTime, {
        now: capturedAt === '2026-08-28T16:29:59.000Z'
          ? '2026-08-28T16:30:00.000Z'
          : '2026-08-28T17:05:00.000Z',
        maxAgeMs: capturedAt === '2026-08-28T16:29:59.000Z' ? 60 * 60 * 1000 : 15 * 60 * 1000,
      }),
      pattern,
    );
  }
});

test('live frozen verification binds Railway deployment/image/message to Git resolution', () => {
  const service = manifest().services.find((item) => item.role === 'lora');
  const deployments = [{
    id: FROZEN_DEPLOYMENT_ID,
    status: 'SUCCESS',
    createdAt: '2026-08-14T16:26:30.219Z',
    meta: {
      imageDigest: FROZEN_IMAGE_DIGEST,
      cliMessage: '641c71f Milesight LoRa validation',
    },
  }];
  const evidence = validateFrozenDeploymentList(service, deployments, FROZEN_SHA);
  assert.equal(evidence.railwayCommitHashPresent, false);
  assert.equal(evidence.resolvedSha, FROZEN_SHA);
  assert.equal(evidence.shaProvenance, 'railway-cli-message+git-resolution');

  const replaced = structuredClone(deployments);
  replaced[0].id = '00000000-0000-4000-8000-999999999999';
  assert.throws(() => validateFrozenDeploymentList(service, replaced, FROZEN_SHA), /deployment Railway actual cambió/);
  assert.throws(() => validateFrozenDeploymentList(service, deployments, 'f'.repeat(40)), /Git no resuelve/);
});

test('live frozen verifier reads Railway directly and requires MQTT disabled', () => {
  const value = manifest();
  const deployments = JSON.stringify([{
    id: FROZEN_DEPLOYMENT_ID,
    status: 'SUCCESS',
    createdAt: '2026-08-14T16:26:30.219Z',
    meta: {
      imageDigest: FROZEN_IMAGE_DIGEST,
      cliMessage: '641c71f Milesight LoRa validation',
    },
  }]);
  const runCommand = (executable, args) => {
    if (executable === 'git') return FROZEN_SHA;
    if (args[0] === 'deployment') return deployments;
    if (args[0] === 'variables') return JSON.stringify({ LORAWAN_MQTT_ENABLED: 'false' });
    throw new Error('unexpected command');
  };
  const evidence = verifyFrozenServicesLive(value, { railwayCli: 'railway-test', runCommand });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].mqttDisabled, true);

  assert.throws(
    () => verifyFrozenServicesLive(value, {
      railwayCli: 'railway-test',
      runCommand: (executable, args) => {
        if (executable === 'git') return FROZEN_SHA;
        if (args[0] === 'deployment') return deployments;
        return JSON.stringify({ LORAWAN_MQTT_ENABLED: 'true' });
      },
    }),
    /LORAWAN_MQTT_ENABLED debe permanecer false/,
  );
});

test('Chamán-Meteo CI detector allows absence but rejects partial delivery', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-meteo-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(detectAssets(root).present, false);

  fs.mkdirSync(path.join(root, 'sdc-meteo-worker'), { recursive: true });
  assert.throws(() => detectAssets(root), /incorporado parcialmente/);

  for (const relativePath of REQUIRED_ASSETS) {
    const target = path.join(root, relativePath);
    if (relativePath === 'sdc-meteo-worker') {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'test', 'utf8');
    }
  }
  assert.equal(detectAssets(root).present, true);
});
