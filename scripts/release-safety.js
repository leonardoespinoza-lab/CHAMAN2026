const fs = require('fs');
const path = require('path');

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,63}$/i;
const ADDITIVE_MIGRATION_KINDS = new Set([
  'additive-collections',
  'additive-indexes',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertAllowedKeys(value, allowed, context) {
  for (const key of Object.keys(value || {})) {
    assert(allowed.has(key), `${context}: campo no permitido ${key}`);
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadTopology(root = path.join(__dirname, '..')) {
  return loadJson(path.join(root, 'deploy', 'environment-topology.json'));
}

function normalizeSha(value, field) {
  const normalized = String(value || '').trim().toLowerCase();
  assert(SHA_PATTERN.test(normalized), `${field} debe ser un SHA Git completo de 40 caracteres`);
  return normalized;
}

function normalizeBuiltAt(value) {
  const normalized = String(value || '').trim();
  const timestamp = Date.parse(normalized);
  assert(normalized && Number.isFinite(timestamp), 'builtAt debe ser una fecha ISO válida');
  return new Date(timestamp).toISOString();
}

function codeServices(topology) {
  return topology.services.filter((service) => service.selector.startsWith('sdc-'));
}

function urlEnvironmentName(role) {
  return `CHAMAN_VERSION_URL_${role.toUpperCase().replace(/-/g, '_')}`;
}

function normalizeDeploymentBaseline(baseline, topology, environment) {
  assert(baseline && typeof baseline === 'object', 'deploymentBaseline es obligatorio');
  assert(baseline.schemaVersion === 1, 'deploymentBaseline.schemaVersion no soportado');
  assert(baseline.environment === environment, 'deploymentBaseline pertenece a otro entorno');
  assert(baseline.readOnlyEvidence === true, 'deploymentBaseline debe ser evidencia read-only');
  assert(baseline.doNotDeploy === true, 'deploymentBaseline debe declarar doNotDeploy=true');
  assert(Array.isArray(baseline.services), 'deploymentBaseline.services debe ser una lista');
  const expected = codeServices(topology);
  const byRole = new Map();
  for (const service of baseline.services) {
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service.deploymentId || ''), `baseline ${service.role}: deploymentId inválido`);
    assert(!byRole.has(service.role), `baseline: rol duplicado ${service.role}`);
    const topologyService = expected.find((item) => item.role === service.role);
    assert(topologyService, `baseline: rol desconocido ${service.role}`);
    assert(service.service === topologyService[environment], `baseline ${service.role}: nombre incorrecto`);
    byRole.set(service.role, service.deploymentId.toLowerCase());
  }
  for (const service of expected) {
    assert(byRole.has(service.role), `baseline: falta ${service.role}`);
  }
  assert(byRole.size === expected.length, 'baseline contiene servicios de código inesperados');
  return byRole;
}

function normalizeMigrations(migrations) {
  assert(Array.isArray(migrations), 'migrations debe ser una lista');
  const seen = new Set();
  return migrations.map((migration, index) => {
    const context = `migrations[${index}]`;
    assertAllowedKeys(
      migration,
      new Set([
        'id',
        'kind',
        'planCommand',
        'applyCommand',
        'rollbackCommand',
        'rollbackScope',
        'startupAllowed',
      ]),
      context,
    );
    assert(/^[a-z0-9][a-z0-9._-]{2,127}$/i.test(migration.id || ''), `${context}: id inválido`);
    assert(!seen.has(migration.id), `${context}: id duplicado ${migration.id}`);
    seen.add(migration.id);
    assert(
      ADDITIVE_MIGRATION_KINDS.has(migration.kind),
      `${context}: sólo se permiten migraciones aditivas`,
    );
    assert(migration.startupAllowed === false, `${context}: startupAllowed debe ser false`);
    assert(
      migration.rollbackScope === 'created-artifacts-only',
      `${context}: rollbackScope debe limitarse a artefactos creados`,
    );
    for (const field of ['planCommand', 'applyCommand', 'rollbackCommand']) {
      const command = String(migration[field] || '');
      assert(
        /^npm run [a-z0-9:_-]+$/i.test(command),
        `${context}: ${field} debe ser un script npm sin argumentos`,
      );
    }
    return { ...migration };
  });
}

function buildReleaseManifest({
  topology,
  sha,
  previousSha,
  version,
  builtAt,
  environment,
  migrations = [],
  backupEvidence = null,
  restoreRehearsalEvidence = null,
  branchProtectionVerified = false,
  railwayWaitForCiVerified = false,
  productionAutoDeployPaused = false,
  deploymentBaseline,
}) {
  const releaseSha = normalizeSha(sha, 'release.sha');
  const rollbackSha = normalizeSha(previousSha, 'rollback.sha');
  assert(releaseSha !== rollbackSha, 'release.sha y rollback.sha deben ser distintos');
  assert(['testing', 'production'].includes(environment), 'environment debe ser testing o production');
  assert(VERSION_PATTERN.test(String(version || '')), 'version tiene un formato inválido');
  const baselineByRole = normalizeDeploymentBaseline(
    deploymentBaseline,
    topology,
    environment,
  );

  const manifest = {
    schemaVersion: 1,
    environment,
    release: {
      sha: releaseSha,
      version,
      builtAt: normalizeBuiltAt(builtAt),
    },
    rollback: {
      sha: rollbackSha,
      strategy: 'code-first-reverse-order',
    },
    policy: {
      requireSameCommit: true,
      migrationMode: 'additive-only',
      automaticMigrationOnStartup: false,
    },
    governance: {
      ciExpanded: true,
      branchProtectionVerified: Boolean(branchProtectionVerified),
      railwayWaitForCiVerified: Boolean(railwayWaitForCiVerified),
      productionAutoDeployPaused: Boolean(productionAutoDeployPaused),
    },
    dataProtection: {
      logicalBackupEvidence: backupEvidence,
      restoreRehearsalEvidence,
    },
    services: codeServices(topology).map((service) => ({
      role: service.role,
      service: service[environment],
      selector: service.selector,
      expectedSha: releaseSha,
      rollbackSha,
      baselineDeploymentId: baselineByRole.get(service.role),
      verification: service.versionPath ? 'endpoint' : 'railway-deployment-metadata',
      ...(service.versionPath
        ? {
            versionPath: service.versionPath,
            versionUrlEnv: urlEnvironmentName(service.role),
          }
        : {}),
    })),
    migrations: normalizeMigrations(migrations),
  };

  validateReleaseManifest(manifest, topology);
  return manifest;
}

function validateReleaseManifest(manifest, topology) {
  assertAllowedKeys(
    manifest,
    new Set([
      'schemaVersion',
      'environment',
      'release',
      'rollback',
      'policy',
      'governance',
      'dataProtection',
      'services',
      'migrations',
    ]),
    'manifest',
  );
  assert(manifest.schemaVersion === 1, 'schemaVersion no soportado');
  assert(['testing', 'production'].includes(manifest.environment), 'environment inválido');

  assertAllowedKeys(manifest.release, new Set(['sha', 'version', 'builtAt']), 'release');
  const releaseSha = normalizeSha(manifest.release.sha, 'release.sha');
  assert(VERSION_PATTERN.test(String(manifest.release.version || '')), 'release.version inválida');
  normalizeBuiltAt(manifest.release.builtAt);

  assertAllowedKeys(manifest.rollback, new Set(['sha', 'strategy']), 'rollback');
  const rollbackSha = normalizeSha(manifest.rollback.sha, 'rollback.sha');
  assert(releaseSha !== rollbackSha, 'release.sha y rollback.sha deben ser distintos');
  assert(
    manifest.rollback.strategy === 'code-first-reverse-order',
    'rollback.strategy no soportada',
  );

  assertAllowedKeys(
    manifest.policy,
    new Set(['requireSameCommit', 'migrationMode', 'automaticMigrationOnStartup']),
    'policy',
  );
  assert(manifest.policy.requireSameCommit === true, 'requireSameCommit debe ser true');
  assert(manifest.policy.migrationMode === 'additive-only', 'migrationMode debe ser additive-only');
  assert(
    manifest.policy.automaticMigrationOnStartup === false,
    'las migraciones automáticas al arrancar están prohibidas',
  );

  assertAllowedKeys(
    manifest.governance,
    new Set([
      'ciExpanded',
      'branchProtectionVerified',
      'railwayWaitForCiVerified',
      'productionAutoDeployPaused',
    ]),
    'governance',
  );
  assert(manifest.governance.ciExpanded === true, 'CI ampliado debe quedar atestado');
  for (const field of [
    'branchProtectionVerified',
    'railwayWaitForCiVerified',
    'productionAutoDeployPaused',
  ]) {
    assert(typeof manifest.governance[field] === 'boolean', `governance.${field} debe ser booleano`);
    if (manifest.environment === 'production') {
      assert(manifest.governance[field] === true, `producción requiere governance.${field}=true`);
    }
  }

  assertAllowedKeys(
    manifest.dataProtection,
    new Set(['logicalBackupEvidence', 'restoreRehearsalEvidence']),
    'dataProtection',
  );
  for (const field of ['logicalBackupEvidence', 'restoreRehearsalEvidence']) {
    const evidence = manifest.dataProtection[field];
    assert(
      evidence === null || /^[a-z0-9][a-z0-9._:-]{2,127}$/i.test(evidence),
      `dataProtection.${field} tiene un formato inválido`,
    );
    if (manifest.environment === 'production') {
      assert(Boolean(evidence), `producción requiere dataProtection.${field}`);
    }
  }

  assert(Array.isArray(manifest.services), 'services debe ser una lista');
  const expected = codeServices(topology);
  const expectedRoles = new Set(expected.map((service) => service.role));
  const seenRoles = new Set();
  for (const [index, service] of manifest.services.entries()) {
    const context = `services[${index}]`;
    assertAllowedKeys(
      service,
      new Set([
        'role',
        'service',
        'selector',
        'expectedSha',
        'rollbackSha',
        'baselineDeploymentId',
        'verification',
        'versionPath',
        'versionUrlEnv',
      ]),
      context,
    );
    assert(expectedRoles.has(service.role), `${context}: rol desconocido ${service.role}`);
    assert(!seenRoles.has(service.role), `${context}: rol duplicado ${service.role}`);
    seenRoles.add(service.role);
    const topologyService = expected.find((item) => item.role === service.role);
    assert(service.service === topologyService[manifest.environment], `${context}: nombre de servicio incorrecto`);
    assert(service.selector === topologyService.selector, `${context}: selector incorrecto`);
    assert(service.expectedSha === releaseSha, `${context}: expectedSha distinto del release`);
    assert(service.rollbackSha === rollbackSha, `${context}: rollbackSha distinto del rollback`);
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        service.baselineDeploymentId || '',
      ),
      `${context}: baselineDeploymentId inválido`,
    );
    if (topologyService.versionPath) {
      assert(service.verification === 'endpoint', `${context}: debe verificarse por endpoint`);
      assert(service.versionPath === topologyService.versionPath, `${context}: versionPath incorrecto`);
      assert(service.versionUrlEnv === urlEnvironmentName(service.role), `${context}: versionUrlEnv incorrecto`);
    } else {
      assert(
        service.verification === 'railway-deployment-metadata',
        `${context}: verificación no soportada`,
      );
      assert(!service.versionPath && !service.versionUrlEnv, `${context}: endpoint no implementado`);
    }
  }
  assert(seenRoles.size === expectedRoles.size, 'el manifiesto no cubre todos los servicios de código');
  for (const role of expectedRoles) {
    assert(seenRoles.has(role), `falta el servicio ${role}`);
  }

  normalizeMigrations(manifest.migrations);
  return manifest;
}

function validateVersionPayload(payload, service, expectedRelease) {
  const expectedSha = normalizeSha(expectedRelease.sha, `${service.role}.expectedSha`);
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), `${service.role}: respuesta inválida`);
  assert(payload.schemaVersion === 1, `${service.role}: schemaVersion inválido`);
  assert(payload.service === service.selector, `${service.role}: identidad de servicio incorrecta`);
  assert(payload.sha === expectedSha, `${service.role}: SHA ${payload.sha || 'ausente'} no coincide`);
  assert(VERSION_PATTERN.test(String(payload.version || '')), `${service.role}: version inválida`);
  const builtAt = normalizeBuiltAt(payload.builtAt);
  if (expectedRelease.version !== undefined) {
    assert(
      payload.version === expectedRelease.version,
      `${service.role}: version ${payload.version} no coincide con ${expectedRelease.version}`,
    );
  }
  if (expectedRelease.builtAt !== undefined) {
    assert(
      builtAt === normalizeBuiltAt(expectedRelease.builtAt),
      `${service.role}: builtAt ${builtAt} no coincide con ${expectedRelease.builtAt}`,
    );
  }
  return {
    role: service.role,
    service: service.service,
    sha: payload.sha,
    version: payload.version,
    builtAt,
  };
}

function collectRailwayDeploymentEvidence(manifest, document, { mode = 'release' } = {}) {
  assert(['release', 'rollback'].includes(mode), 'mode debe ser release o rollback');
  assert(document && typeof document === 'object', 'railwayEvidence es obligatorio');
  assertAllowedKeys(
    document,
    new Set(['schemaVersion', 'environment', 'capturedAt', 'readOnlyEvidence', 'services']),
    'railwayEvidence',
  );
  assert(document.schemaVersion === 1, 'railwayEvidence.schemaVersion no soportado');
  assert(document.environment === manifest.environment, 'railwayEvidence pertenece a otro entorno');
  assert(document.readOnlyEvidence === true, 'railwayEvidence debe ser read-only');
  const capturedAt = normalizeBuiltAt(document.capturedAt);
  assert(Array.isArray(document.services), 'railwayEvidence.services debe ser una lista');

  const expectedSha = mode === 'rollback' ? manifest.rollback.sha : manifest.release.sha;
  const expectedServices = manifest.services.filter(
    (service) => service.verification === 'railway-deployment-metadata',
  );
  const byRole = new Map();
  for (const [index, item] of document.services.entries()) {
    const context = `railwayEvidence.services[${index}]`;
    assertAllowedKeys(
      item,
      new Set(['role', 'service', 'sha', 'deploymentId', 'status', 'source']),
      context,
    );
    const service = expectedServices.find((candidate) => candidate.role === item.role);
    assert(service, `${context}: rol no pendiente o desconocido ${item.role}`);
    assert(!byRole.has(item.role), `${context}: rol duplicado ${item.role}`);
    assert(item.service === service.service, `${context}: nombre de servicio incorrecto`);
    assert(normalizeSha(item.sha, `${context}.sha`) === expectedSha, `${context}: SHA incorrecto`);
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item.deploymentId || '',
      ),
      `${context}: deploymentId inválido`,
    );
    assert(item.status === 'SUCCESS', `${context}: status debe ser SUCCESS`);
    assert(
      ['railway-dashboard', 'railway-public-api'].includes(item.source),
      `${context}: source no soportado`,
    );
    byRole.set(item.role, {
      role: item.role,
      service: item.service,
      sha: item.sha.toLowerCase(),
      deploymentId: item.deploymentId.toLowerCase(),
      status: item.status,
      source: item.source,
    });
  }
  for (const service of expectedServices) {
    assert(byRole.has(service.role), `railwayEvidence: falta ${service.role}`);
  }
  assert(
    byRole.size === expectedServices.length,
    'railwayEvidence contiene servicios inesperados',
  );
  return { expectedSha, capturedAt, evidence: [...byRole.values()] };
}

async function collectVersionEvidence(
  manifest,
  { mode = 'release', environment = process.env, fetchImpl = global.fetch } = {},
) {
  assert(['release', 'rollback'].includes(mode), 'mode debe ser release o rollback');
  assert(typeof fetchImpl === 'function', 'fetch no está disponible');
  const expectedRelease =
    mode === 'rollback' ? { sha: manifest.rollback.sha } : manifest.release;
  const expectedSha = expectedRelease.sha;
  const endpointServices = manifest.services.filter((service) => service.verification === 'endpoint');
  const evidence = [];

  for (const service of endpointServices) {
    const rawUrl = String(environment[service.versionUrlEnv] || '').trim();
    assert(rawUrl, `${service.role}: falta ${service.versionUrlEnv}`);
    const url = new URL(rawUrl);
    assert(['http:', 'https:'].includes(url.protocol), `${service.role}: URL debe usar HTTP(S)`);
    assert(!url.username && !url.password, `${service.role}: URL no debe incluir credenciales`);
    assert(!url.search && !url.hash, `${service.role}: URL no debe incluir query ni fragmento`);
    assert(url.pathname.endsWith(service.versionPath), `${service.role}: URL debe terminar en ${service.versionPath}`);

    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    assert(response.ok, `${service.role}: /version respondió HTTP ${response.status}`);
    evidence.push(validateVersionPayload(await response.json(), service, expectedRelease));
  }

  return {
    expectedSha,
    evidence,
    pendingRoles: manifest.services
      .filter((service) => service.verification !== 'endpoint')
      .map((service) => service.role),
  };
}

module.exports = {
  ADDITIVE_MIGRATION_KINDS,
  buildReleaseManifest,
  collectRailwayDeploymentEvidence,
  collectVersionEvidence,
  loadJson,
  loadTopology,
  normalizeDeploymentBaseline,
  normalizeSha,
  validateReleaseManifest,
  validateVersionPayload,
};
