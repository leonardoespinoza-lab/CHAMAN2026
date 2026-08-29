const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildReleaseManifest,
  collectRailwayDeploymentEvidence,
  collectVersionEvidence,
  loadTopology,
  parsePromoteOnlyCsv,
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
const GENERIC_FROZEN_SHA = '2222222222222222222222222222222222222222';
const GENERIC_FROZEN_IMAGE_DIGEST = `sha256:${'3'.repeat(64)}`;
const SELECTIVE_ROLLBACK_IMAGE_DIGEST = `sha256:${'4'.repeat(64)}`;
const RAILWAY_PROJECT_ID = '36dee457-e9f8-498d-a990-72b9728d63d5';
const RAILWAY_ENVIRONMENT_ID = 'f616374e-b197-4acb-ba6b-15855d20e27a';

function deploymentBaseline(environment, { promoteOnly = null } = {}) {
  const topology = loadTopology(path.join(__dirname, '..', '..'));
  return {
    schemaVersion: 1,
    environment,
    capturedAt: new Date().toISOString(),
    readOnlyEvidence: true,
    doNotDeploy: true,
    services: topology.services
      .filter((service) => service.selector.startsWith('sdc-'))
      .map((service, index) => {
        const frozen = environment === 'testing'
          && (service.role === 'lora'
            || (promoteOnly && !promoteOnly.includes(service.role)));
        return {
          role: service.role,
          service: service[environment],
          deploymentId: service.role === 'lora' && frozen
            ? FROZEN_DEPLOYMENT_ID
            : `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          ...(service.role === 'lora' && frozen
            ? {
                observedSha: FROZEN_SHA,
                imageDigest: FROZEN_IMAGE_DIGEST,
                cliMessage: '641c71f Milesight LoRa validation',
              }
            : frozen
              ? {
                  observedSha: GENERIC_FROZEN_SHA,
                  imageDigest: GENERIC_FROZEN_IMAGE_DIGEST,
                  railwayProjectId: RAILWAY_PROJECT_ID,
                  railwayEnvironmentId: RAILWAY_ENVIRONMENT_ID,
                  railwayServiceId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
                  shaProvenance: 'railway-github-commit-hash',
                }
            : promoteOnly
              ? {
                  observedSha: ROLLBACK_SHA,
                  imageDigest: SELECTIVE_ROLLBACK_IMAGE_DIGEST,
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
  const baseline = overrides.deploymentBaseline || deploymentBaseline(environment, {
    promoteOnly: overrides.promoteOnly || null,
  });
  return buildReleaseManifest({
    topology: loadTopology(path.join(__dirname, '..', '..')),
    sha: RELEASE_SHA,
    previousSha: ROLLBACK_SHA,
    version: '2026.08.28-rc.1',
    builtAt: '2026-08-28T16:30:00.000Z',
    environment,
    migrations: [],
    deploymentBaseline: baseline,
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
  const additive = {
    id: '20260828-chaman-meteo-v2-read-indexes-v1',
    kind: 'additive-indexes',
    planCommand: 'npm run migrate:chaman-meteo-v2-indexes:plan',
    applyCommand: 'npm run migrate:chaman-meteo-v2-indexes:apply',
    rollbackCommand: 'npm run migrate:chaman-meteo-v2-indexes:rollback',
    rollbackScope: 'created-artifacts-only',
    startupAllowed: false,
  };
  assert.doesNotThrow(() => manifest({ migrations: [additive] }));
  assert.deepEqual(
    manifest({ promoteOnly: ['meteo-worker'], migrations: [additive] }).migrations,
    [additive],
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
    collectRailwayDeploymentEvidence(value, rollback, {
      ...evidenceOptions,
      mode: 'rollback',
      evidenceNotBefore: '2026-08-28T16:59:00.000Z',
    }),
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

  const beforeRollback = structuredClone(rollback);
  beforeRollback.capturedAt = '2026-08-28T16:59:59.000Z';
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, beforeRollback, {
      mode: 'rollback',
      now: '2026-08-28T17:05:00.000Z',
      evidenceNotBefore: '2026-08-28T17:00:00.000Z',
    }),
    /evidencia anterior al inicio del rollback/,
  );
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, rollback, {
      mode: 'rollback',
      now: '2026-08-28T17:05:00.000Z',
    }),
    /rollback exige evidenceNotBefore/,
  );
});

test('selective Testing manifest promotes only meteo-worker and freezes every other code role', () => {
  const value = manifest({ promoteOnly: ['meteo-worker'] });
  assert.deepEqual(value.policy.promoteOnlyRoles, ['meteo-worker']);
  assert.equal(
    value.policy.selectiveBaselineCapturedAt,
    new Date(value.policy.selectiveBaselineCapturedAt).toISOString(),
  );
  const promoted = value.services.filter((service) => service.deploymentMode === 'promote');
  const frozen = value.services.filter((service) => service.deploymentMode === 'frozen');
  assert.deepEqual(promoted.map((service) => service.role), ['meteo-worker']);
  assert.equal(frozen.length, 11);
  assert.equal(promoted[0].expectedSha, RELEASE_SHA);
  assert.equal(promoted[0].rollbackSha, ROLLBACK_SHA);
  assert.equal(promoted[0].rollbackExpectedImageDigest, SELECTIVE_ROLLBACK_IMAGE_DIGEST);

  const generic = frozen.find((service) => service.role === 'auth');
  assert.equal(generic.expectedSha, GENERIC_FROZEN_SHA);
  assert.equal(generic.rollbackSha, GENERIC_FROZEN_SHA);
  assert.equal(generic.expectedImageDigest, GENERIC_FROZEN_IMAGE_DIGEST);
  assert.equal(generic.shaProvenance, 'railway-github-commit-hash');
  assert.equal(generic.railwayProjectId, RAILWAY_PROJECT_ID);
  assert.equal(generic.railwayEnvironmentId, RAILWAY_ENVIRONMENT_ID);
  assert.ok(generic.railwayServiceId);
  assert.equal(generic.expectedCliMessage, undefined);
  assert.equal(generic.verification, 'railway-deployment-metadata');

  const lora = frozen.find((service) => service.role === 'lora');
  assert.equal(lora.expectedSha, FROZEN_SHA);
  assert.equal(lora.shaProvenance, 'railway-cli-message+git-resolution');
  assert.equal(lora.expectedCliMessage, '641c71f Milesight LoRa validation');
});

test('--promote-only CSV is strict, deterministic and accepts only known non-LoRa roles', () => {
  assert.deepEqual(parsePromoteOnlyCsv('meteo-worker,api'), ['meteo-worker', 'api']);
  const reordered = manifest({ promoteOnly: ['meteo-worker', 'api'] });
  assert.deepEqual(reordered.policy.promoteOnlyRoles, ['api', 'meteo-worker']);

  for (const [promoteOnly, pattern] of [
    [[], /al menos un rol/],
    [['unknown'], /rol desconocido/],
    [['lora'], /siempre queda frozen/],
    [['meteo-worker', 'meteo-worker'], /rol duplicado/],
    [[' meteo-worker'], /debe estar normalizado/],
  ]) {
    assert.throws(() => manifest({ promoteOnly }), pattern);
  }
  for (const [raw, pattern] of [
    ['', /no puede estar vacío/],
    ['meteo-worker,', /rol vacío/],
    [',meteo-worker', /rol vacío/],
  ]) {
    assert.throws(() => parsePromoteOnlyCsv(raw), pattern);
  }
});

test('production rejects selective promotion and still promotes every code service', () => {
  const governance = {
    environment: 'production',
    backupEvidence: 'mongo-logical-backup-20260828-1630z',
    restoreRehearsalEvidence: 'mongo-restore-drill-testing-20260828',
    branchProtectionVerified: true,
    railwayWaitForCiVerified: true,
    productionAutoDeployPaused: true,
  };
  assert.throws(
    () => manifest({ ...governance, promoteOnly: ['meteo-worker'] }),
    /sólo se permite en Testing/,
  );
  assert.ok(
    manifest(governance).services.every(
      (service) => service.deploymentMode === 'promote',
    ),
  );
});

test('selective frozen baseline requires complete GitHub deployment identity', () => {
  const cases = [
    ['observedSha', undefined, /observedSha completo/],
    ['observedSha', '2222222', /observedSha completo/],
    ['imageDigest', undefined, /imageDigest obligatorio/],
    ['railwayProjectId', undefined, /railwayProjectId inválido/],
    ['railwayEnvironmentId', 'invalid', /railwayEnvironmentId inválido/],
    ['railwayServiceId', undefined, /railwayServiceId inválido/],
    ['shaProvenance', undefined, /shaProvenance debe ser railway-github-commit-hash/],
    ['shaProvenance', 'railway-cli-message+git-resolution', /shaProvenance debe ser railway-github-commit-hash/],
    ['cliMessage', '2222222 should-not-exist', /cliMessage no corresponde/],
  ];
  for (const [field, value, pattern] of cases) {
    const baseline = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
    const auth = baseline.services.find((service) => service.role === 'auth');
    if (value === undefined) delete auth[field];
    else auth[field] = value;
    assert.throws(
      () => manifest({ promoteOnly: ['meteo-worker'], deploymentBaseline: baseline }),
      pattern,
    );
  }
});

test('selective promoted baseline binds rollback SHA to the current promoted deployment', () => {
  const missing = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
  delete missing.services.find((service) => service.role === 'meteo-worker').observedSha;
  assert.throws(
    () => manifest({ promoteOnly: ['meteo-worker'], deploymentBaseline: missing }),
    /observedSha completo obligatorio para rollback selectivo/,
  );

  const missingImage = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
  delete missingImage.services.find((service) => service.role === 'meteo-worker').imageDigest;
  assert.throws(
    () => manifest({ promoteOnly: ['meteo-worker'], deploymentBaseline: missingImage }),
    /imageDigest obligatorio para rollback selectivo/,
  );

  const changed = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
  changed.services.find((service) => service.role === 'meteo-worker').observedSha = 'f'.repeat(40);
  assert.throws(
    () => manifest({ promoteOnly: ['meteo-worker'], deploymentBaseline: changed }),
    /observedSha debe coincidir con rollback.sha/,
  );
});

test('selective baseline capturedAt is canonical and expires after 15 minutes', () => {
  const stale = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
  stale.capturedAt = '2026-08-28T19:54:59.000Z';
  assert.throws(
    () => manifest({
      promoteOnly: ['meteo-worker'],
      deploymentBaseline: stale,
      baselineNow: new Date('2026-08-28T20:10:00.000Z'),
    }),
    /deploymentBaseline selectivo está vencido/,
  );

  const boundary = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
  boundary.capturedAt = '2026-08-28T19:55:00.000Z';
  assert.doesNotThrow(() => manifest({
    promoteOnly: ['meteo-worker'],
    deploymentBaseline: boundary,
    baselineNow: new Date('2026-08-28T20:10:00.000Z'),
  }));

  const future = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
  future.capturedAt = '2026-08-28T20:12:01.000Z';
  assert.throws(
    () => manifest({
      promoteOnly: ['meteo-worker'],
      deploymentBaseline: future,
      baselineNow: new Date('2026-08-28T20:10:00.000Z'),
    }),
    /capturedAt está en el futuro/,
  );
});

test('selective baseline rejects cross-project identities and duplicate deployments or services', () => {
  for (const [mutate, pattern] of [
    [
      (baseline) => {
        baseline.services.find((service) => service.role === 'auth').railwayProjectId =
          '10000000-0000-4000-8000-000000000001';
      },
      /railwayProjectId no coincide con el proyecto Testing/,
    ],
    [
      (baseline) => {
        baseline.services.find((service) => service.role === 'auth').railwayEnvironmentId =
          '10000000-0000-4000-8000-000000000002';
      },
      /railwayEnvironmentId no coincide con el entorno Testing/,
    ],
    [
      (baseline) => {
        const auth = baseline.services.find((service) => service.role === 'auth');
        auth.deploymentId = baseline.services.find((service) => service.role === 'web').deploymentId;
      },
      /deploymentId duplicado/,
    ],
    [
      (baseline) => {
        const auth = baseline.services.find((service) => service.role === 'auth');
        auth.railwayServiceId = baseline.services.find((service) => service.role === 'web').railwayServiceId;
      },
      /railwayServiceId duplicado/,
    ],
  ]) {
    const baseline = deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] });
    mutate(baseline);
    assert.throws(
      () => manifest({ promoteOnly: ['meteo-worker'], deploymentBaseline: baseline }),
      pattern,
    );
  }
});

test('selective frozen manifest rejects mutable identity and provenance changes', () => {
  const topology = loadTopology(path.join(__dirname, '..', '..'));
  for (const [field, value, pattern] of [
    ['rollbackSha', ROLLBACK_SHA, /frozen no puede cambiar/],
    ['expectedImageDigest', 'sha256:invalid', /expectedImageDigest inválido/],
    ['railwayProjectId', 'invalid', /railwayProjectId inválido/],
    ['shaProvenance', 'railway-cli-message+git-resolution', /railway-github-commit-hash/],
    ['expectedCliMessage', '2222222 invalid', /no corresponde a GitHub/],
    ['verification', 'endpoint', /metadata de Railway/],
  ]) {
    const altered = manifest({ promoteOnly: ['meteo-worker'] });
    altered.services.find((service) => service.role === 'auth')[field] = value;
    assert.throws(() => validateReleaseManifest(altered, topology), pattern);
  }

  const uppercaseSha = manifest({ promoteOnly: ['meteo-worker'] });
  const upperAuth = uppercaseSha.services.find((service) => service.role === 'auth');
  upperAuth.expectedSha = 'A'.repeat(40);
  upperAuth.rollbackSha = 'A'.repeat(40);
  assert.throws(
    () => validateReleaseManifest(uppercaseSha, topology),
    /expectedSha debe estar en lowercase canónico/,
  );

  const uppercaseImage = manifest({ promoteOnly: ['meteo-worker'] });
  uppercaseImage.services.find((service) => service.role === 'auth').expectedImageDigest =
    GENERIC_FROZEN_IMAGE_DIGEST.toUpperCase();
  assert.throws(
    () => validateReleaseManifest(uppercaseImage, topology),
    /expectedImageDigest debe estar en lowercase canónico/,
  );
});

test('manifest policy cannot self-certify a different selective scope', () => {
  const topology = loadTopology(path.join(__dirname, '..', '..'));
  const nullScope = manifest();
  nullScope.policy.promoteOnlyRoles = null;
  assert.throws(() => validateReleaseManifest(nullScope, topology), /no admite null/);

  const movedScope = manifest({ promoteOnly: ['meteo-worker'] });
  movedScope.policy.promoteOnlyRoles = ['api'];
  assert.throws(() => validateReleaseManifest(movedScope, topology), /deploymentMode no autorizado/);

  const production = manifest({
    environment: 'production',
    backupEvidence: 'mongo-logical-backup-20260828-1630z',
    restoreRehearsalEvidence: 'mongo-restore-drill-testing-20260828',
    branchProtectionVerified: true,
    railwayWaitForCiVerified: true,
    productionAutoDeployPaused: true,
  });
  production.policy.promoteOnlyRoles = ['meteo-worker'];
  assert.throws(() => validateReleaseManifest(production, topology), /sólo se permite en Testing/);
});

test('create-release-manifest CLI wires --promote-only into an immutable selective manifest', (t) => {
  const root = path.join(__dirname, '..', '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-selective-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baselinePath = path.join(directory, 'baseline.json');
  const outputPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(deploymentBaseline('testing', { promoteOnly: ['meteo-worker'] })),
    'utf8',
  );
  const result = spawnSync(
    process.execPath,
    [
      'scripts/create-release-manifest.js',
      '--sha', RELEASE_SHA,
      '--previous-sha', ROLLBACK_SHA,
      '--version', '2026.08.28-meteo.1',
      '--built-at', '2026-08-28T20:00:00.000Z',
      '--environment', 'testing',
      '--deployment-baseline', baselinePath,
      '--promote-only', 'meteo-worker',
      '--output', outputPath,
    ],
    { cwd: root, encoding: 'utf8', shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepEqual(
    value.services.filter((service) => service.deploymentMode === 'promote').map((service) => service.role),
    ['meteo-worker'],
  );
  assert.equal(value.services.filter((service) => service.deploymentMode === 'frozen').length, 11);
});

test('Railway evidence keeps every selectively frozen GitHub deployment immutable', () => {
  const value = manifest({ promoteOnly: ['meteo-worker'] });
  const document = {
    schemaVersion: 1,
    environment: 'testing',
    capturedAt: '2026-08-28T20:05:00.000Z',
    readOnlyEvidence: true,
    services: value.services.map((service, index) => ({
      role: service.role,
      service: service.service,
      sha: service.expectedSha,
      deploymentId: service.deploymentMode === 'frozen'
        ? service.baselineDeploymentId
        : `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      ...(service.deploymentMode === 'frozen'
        ? { imageDigest: service.expectedImageDigest }
        : {}),
      status: 'SUCCESS',
      source: 'railway-public-api',
    })),
  };
  const options = { now: '2026-08-28T20:10:00.000Z' };
  const result = collectRailwayDeploymentEvidence(value, document, options);
  assert.equal(result.frozenRoles.length, 11);
  assert.ok(result.frozenRoles.includes('auth'));
  assert.ok(result.frozenRoles.includes('lora'));

  for (const [field, replacement, pattern] of [
    ['deploymentId', '30000000-0000-4000-8000-999999999999', /frozen cambió de deployment/],
    ['imageDigest', `sha256:${'f'.repeat(64)}`, /frozen cambió de imagen/],
    ['sha', 'f'.repeat(40), /SHA incorrecto/],
  ]) {
    const altered = structuredClone(document);
    altered.services.find((service) => service.role === 'auth')[field] = replacement;
    assert.throws(
      () => collectRailwayDeploymentEvidence(value, altered, options),
      pattern,
    );
  }
});

test('selective rollback evidence binds promoted service to baseline deployment and image', () => {
  const value = manifest({ promoteOnly: ['meteo-worker'] });
  const document = {
    schemaVersion: 1,
    environment: 'testing',
    capturedAt: '2026-08-28T20:05:00.000Z',
    readOnlyEvidence: true,
    services: value.services.map((service) => ({
      role: service.role,
      service: service.service,
      sha: service.rollbackSha,
      deploymentId: service.baselineDeploymentId,
      imageDigest: service.deploymentMode === 'frozen'
        ? service.expectedImageDigest
        : service.rollbackExpectedImageDigest,
      status: 'SUCCESS',
      source: 'railway-public-api',
    })),
  };
  const options = {
    mode: 'rollback',
    now: '2026-08-28T20:10:00.000Z',
    evidenceNotBefore: '2026-08-28T20:00:00.000Z',
  };
  assert.doesNotThrow(() => collectRailwayDeploymentEvidence(value, document, options));

  for (const [field, replacement, pattern] of [
    [
      'deploymentId',
      '30000000-0000-4000-8000-999999999999',
      /rollback promote no coincide con deployment baseline/,
    ],
    [
      'imageDigest',
      `sha256:${'f'.repeat(64)}`,
      /rollback promote no coincide con imagen baseline/,
    ],
  ]) {
    const altered = structuredClone(document);
    altered.services.find((service) => service.role === 'meteo-worker')[field] = replacement;
    assert.throws(
      () => collectRailwayDeploymentEvidence(value, altered, options),
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

test('generic frozen verification requires Railway GitHub commitHash and no CLI message', () => {
  const service = manifest({ promoteOnly: ['meteo-worker'] }).services.find(
    (item) => item.role === 'auth',
  );
  const deployments = [{
    id: service.baselineDeploymentId,
    status: 'SUCCESS',
    createdAt: '2026-08-28T20:10:00.000Z',
    meta: {
      imageDigest: service.expectedImageDigest,
      commitHash: service.expectedSha,
    },
  }];
  const evidence = validateFrozenDeploymentList(service, deployments);
  assert.equal(evidence.resolvedSha, GENERIC_FROZEN_SHA);
  assert.equal(evidence.shaProvenance, 'railway-github-commit-hash');
  assert.equal(evidence.railwayCommitHashPresent, true);
  assert.equal(evidence.shortSha, undefined);

  const missingCommit = structuredClone(deployments);
  delete missingCommit[0].meta.commitHash;
  assert.throws(
    () => validateFrozenDeploymentList(service, missingCommit),
    /railwayCommitHash debe ser un SHA Git completo/,
  );
  const changedCommit = structuredClone(deployments);
  changedCommit[0].meta.commitHash = 'f'.repeat(40);
  assert.throws(
    () => validateFrozenDeploymentList(service, changedCommit),
    /Railway commitHash no coincide/,
  );
  const invalidDate = structuredClone(deployments);
  invalidDate[0].createdAt = 'not-a-date';
  assert.throws(
    () => validateFrozenDeploymentList(service, invalidDate),
    /createdAt inválido/,
  );
});

test('live selective verifier checks every frozen deployment but MQTT and Git only for LoRa', () => {
  const value = manifest({ promoteOnly: ['meteo-worker'] });
  const byServiceId = new Map(
    value.services
      .filter((service) => service.deploymentMode === 'frozen')
      .map((service) => [service.railwayServiceId, service]),
  );
  const calls = [];
  const runCommand = (executable, args) => {
    calls.push([executable, ...args]);
    if (executable === 'git') return FROZEN_SHA;
    if (args[0] === 'service') {
      assert.deepEqual(args.slice(0, 2), ['service', 'list']);
      return JSON.stringify(
        [...byServiceId.values()]
          .filter((service) => service.role !== 'lora')
          .map((service) => ({
            id: service.railwayServiceId,
            name: service.service,
          })),
      );
    }
    const serviceId = args[args.indexOf('--service') + 1];
    const service = byServiceId.get(serviceId);
    assert.ok(service, `servicio frozen desconocido ${serviceId}`);
    if (args[0] === 'variables') {
      assert.equal(service.role, 'lora');
      return JSON.stringify({ LORAWAN_MQTT_ENABLED: 'false' });
    }
    assert.equal(args[0], 'deployment');
    return JSON.stringify([{
      id: service.baselineDeploymentId,
      status: 'SUCCESS',
      createdAt: '2026-08-28T20:10:00.000Z',
      meta: {
        imageDigest: service.expectedImageDigest,
        ...(service.role === 'lora'
          ? { cliMessage: service.expectedCliMessage }
          : { commitHash: service.expectedSha }),
      },
    }]);
  };
  const evidence = verifyFrozenServicesLive(value, {
    railwayCli: 'railway-test',
    runCommand,
  });
  assert.equal(evidence.length, 11);
  assert.equal(
    calls.filter((call) => call[1] === 'service' && call[2] === 'list').length,
    1,
  );
  assert.equal(calls.filter((call) => call[1] === 'variables').length, 1);
  assert.equal(calls.filter((call) => call[0] === 'git').length, 1);
  assert.equal(evidence.find((item) => item.role === 'lora').mqttDisabled, true);
  assert.equal(
    evidence.find((item) => item.role === 'auth').shaProvenance,
    'railway-github-commit-hash',
  );
});

test('live selective verifier rejects permuted service IDs and incompatible names', () => {
  const value = manifest({ promoteOnly: ['meteo-worker'] });
  const generic = value.services.filter(
    (service) => service.deploymentMode === 'frozen' && service.role !== 'lora',
  );
  const canonical = generic.map((service) => ({
    id: service.railwayServiceId,
    name: service.service,
  }));

  for (const mutate of [
    (services) => {
      services.find((service) => service.id === generic[0].railwayServiceId).name =
        'testing-incompatible-name';
    },
    (services) => {
      const first = services.find((service) => service.id === generic[0].railwayServiceId);
      const second = services.find((service) => service.id === generic[1].railwayServiceId);
      [first.name, second.name] = [second.name, first.name];
    },
  ]) {
    const services = structuredClone(canonical);
    mutate(services);
    let serviceListCalls = 0;
    assert.throws(
      () => verifyFrozenServicesLive(value, {
        railwayCli: 'railway-test',
        runCommand: (_executable, args) => {
          assert.equal(args[0], 'service');
          serviceListCalls += 1;
          return JSON.stringify(services);
        },
      }),
      /railwayServiceId no corresponde/,
    );
    assert.equal(serviceListCalls, 1);
  }
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
