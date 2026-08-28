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
  validateReleaseManifest,
} = require('../release-safety');
const {
  REQUIRED_ASSETS,
  detectAssets,
} = require('../check-chaman-meteo-release-assets');

const RELEASE_SHA = '1111111111111111111111111111111111111111';
const ROLLBACK_SHA = '0000000000000000000000000000000000000000';

function deploymentBaseline(environment) {
  const topology = loadTopology(path.join(__dirname, '..', '..'));
  return {
    schemaVersion: 1,
    environment,
    readOnlyEvidence: true,
    doNotDeploy: true,
    services: topology.services
      .filter((service) => service.selector.startsWith('sdc-'))
      .map((service, index) => ({
        role: service.role,
        service: service[environment],
        deploymentId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      })),
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

test('release manifest fixes every code service to one release and rollback SHA', () => {
  const value = manifest();
  assert.ok(value.services.some((service) => service.role === 'meteo-worker'));
  assert.ok(value.services.every((service) => service.expectedSha === RELEASE_SHA));
  assert.ok(value.services.every((service) => service.rollbackSha === ROLLBACK_SHA));
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

test('manifest requires a complete read-only deployment baseline', () => {
  const incomplete = deploymentBaseline('testing');
  incomplete.services.pop();
  assert.throws(
    () => manifest({ deploymentBaseline: incomplete }),
    /baseline: falta/,
  );
  assert.ok(manifest().services.every((service) => service.baselineDeploymentId));
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

test('Railway evidence covers every service without /version at the exact SHA', () => {
  const value = manifest();
  const pending = value.services.filter(
    (service) => service.verification === 'railway-deployment-metadata',
  );
  const document = {
    schemaVersion: 1,
    environment: 'testing',
    capturedAt: '2026-08-28T17:00:00.000Z',
    readOnlyEvidence: true,
    services: pending.map((service, index) => ({
      role: service.role,
      service: service.service,
      sha: RELEASE_SHA,
      deploymentId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      status: 'SUCCESS',
      source: 'railway-public-api',
    })),
  };
  const result = collectRailwayDeploymentEvidence(value, document);
  assert.equal(result.evidence.length, pending.length);

  const stale = structuredClone(document);
  stale.services[0].sha = ROLLBACK_SHA;
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, stale),
    /SHA incorrecto/,
  );

  const incomplete = structuredClone(document);
  incomplete.services.pop();
  assert.throws(
    () => collectRailwayDeploymentEvidence(value, incomplete),
    /railwayEvidence: falta/,
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
