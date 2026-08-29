const fs = require('fs');
const path = require('path');

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,63}$/i;
const CLI_MESSAGE_PROVENANCE = 'railway-cli-message+git-resolution';
const GITHUB_COMMIT_PROVENANCE = 'railway-github-commit-hash';
const SELECTIVE_BASELINE_MAX_AGE_MS = 15 * 60 * 1000;
const SELECTIVE_BASELINE_FUTURE_SKEW_MS = 2 * 60 * 1000;
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

function normalizeSelectiveBaselineCapturedAt(baseline, now = new Date()) {
  const capturedAt = normalizeBuiltAt(baseline?.capturedAt);
  assert(
    baseline.capturedAt === capturedAt,
    'deploymentBaseline.capturedAt debe ser ISO UTC canónico en modo selectivo',
  );
  const capturedTimestamp = Date.parse(capturedAt);
  const nowTimestamp = Date.parse(now instanceof Date ? now.toISOString() : String(now));
  assert(Number.isFinite(nowTimestamp), 'deploymentBaseline: now inválido');
  assert(
    capturedTimestamp <= nowTimestamp + SELECTIVE_BASELINE_FUTURE_SKEW_MS,
    'deploymentBaseline.capturedAt está en el futuro',
  );
  assert(
    capturedTimestamp >= nowTimestamp - SELECTIVE_BASELINE_MAX_AGE_MS,
    'deploymentBaseline selectivo está vencido',
  );
  return capturedAt;
}

function parsePromoteOnlyCsv(value) {
  if (value === undefined || value === null) return null;
  assert(typeof value === 'string', '--promote-only debe ser una lista CSV');
  assert(value.trim(), '--promote-only no puede estar vacío');
  const roles = value.split(',').map((role) => role.trim());
  assert(roles.every(Boolean), '--promote-only contiene un rol vacío');
  return roles;
}

function normalizePromoteOnlyRoles(value, topology, environment) {
  if (value === undefined || value === null) return null;
  assert(environment === 'testing', '--promote-only sólo se permite en Testing');
  assert(Array.isArray(value) && value.length > 0, '--promote-only requiere al menos un rol');
  const services = codeServices(topology);
  const knownRoles = new Set(services.map((service) => service.role));
  const requested = new Set();
  for (const rawRole of value) {
    assert(typeof rawRole === 'string' && rawRole.trim(), '--promote-only contiene un rol inválido');
    const role = rawRole.trim();
    assert(role === rawRole, `--promote-only debe estar normalizado: ${rawRole}`);
    assert(knownRoles.has(role), `--promote-only contiene un rol desconocido: ${role}`);
    assert(role !== 'lora', '--promote-only no puede incluir lora; testing-lora siempre queda frozen');
    assert(!requested.has(role), `--promote-only contiene un rol duplicado: ${role}`);
    requested.add(role);
  }
  return services.map((service) => service.role).filter((role) => requested.has(role));
}

function deploymentMode(service, environment, promoteOnlyRoles = null) {
  if (environment === 'testing' && service.testingPromotion?.mode === 'frozen-at-baseline') {
    return 'frozen';
  }
  if (environment === 'testing' && promoteOnlyRoles) {
    return promoteOnlyRoles.includes(service.role) ? 'promote' : 'frozen';
  }
  return 'promote';
}

function assertPromotionTopology(topology) {
  const code = codeServices(topology);
  const protectedServices = code.filter((service) => service.testingPromotion !== undefined);
  assert(
    protectedServices.length === 1 && protectedServices[0].role === 'lora',
    'La única excepción permanente declarada en topología debe ser testing-lora',
  );
  const lora = protectedServices[0];
  const policy = lora.testingPromotion;
  assertAllowedKeys(
    policy,
    new Set([
      'mode',
      'expectedSha',
      'deploymentId',
      'imageDigest',
      'cliMessage',
      'railwayProjectId',
      'railwayEnvironmentId',
      'railwayServiceId',
    ]),
    'testing-lora.testingPromotion',
  );
  assert(policy.mode === 'frozen-at-baseline', 'testing-lora debe quedar frozen-at-baseline');
  assert(SHA_PATTERN.test(String(policy.expectedSha || '')), 'testing-lora.expectedSha debe ser completo');
  assert(UUID_PATTERN.test(String(policy.deploymentId || '')), 'testing-lora.deploymentId inválido');
  assert(IMAGE_DIGEST_PATTERN.test(String(policy.imageDigest || '')), 'testing-lora.imageDigest inválido');
  assert(/^([0-9a-f]{7,40})\b/i.test(String(policy.cliMessage || '')), 'testing-lora.cliMessage inválido');
  assert(
    policy.expectedSha.startsWith(policy.cliMessage.split(/\s+/, 1)[0].toLowerCase()),
    'testing-lora.cliMessage no corresponde al SHA protegido',
  );
  for (const field of ['railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId']) {
    assert(UUID_PATTERN.test(String(policy[field] || '')), `testing-lora.${field} inválido`);
  }
  assert(
    topology.codePromotion?.requireSameCommitAcrossPromotedStatelessServices === true,
    'La topología debe exigir el mismo commit en servicios promovidos',
  );
}

function urlEnvironmentName(role) {
  return `CHAMAN_VERSION_URL_${role.toUpperCase().replace(/-/g, '_')}`;
}

function normalizeDeploymentBaseline(
  baseline,
  topology,
  environment,
  promoteOnlyRoles = null,
) {
  assertPromotionTopology(topology);
  const normalizedPromoteOnly = normalizePromoteOnlyRoles(
    promoteOnlyRoles,
    topology,
    environment,
  );
  assert(baseline && typeof baseline === 'object', 'deploymentBaseline es obligatorio');
  assert(baseline.schemaVersion === 1, 'deploymentBaseline.schemaVersion no soportado');
  assert(baseline.environment === environment, 'deploymentBaseline pertenece a otro entorno');
  assert(baseline.readOnlyEvidence === true, 'deploymentBaseline debe ser evidencia read-only');
  assert(baseline.doNotDeploy === true, 'deploymentBaseline debe declarar doNotDeploy=true');
  assert(Array.isArray(baseline.services), 'deploymentBaseline.services debe ser una lista');
  const expected = codeServices(topology);
  const canonicalTesting = expected.find((service) => service.role === 'lora').testingPromotion;
  const byRole = new Map();
  const deploymentIds = new Set();
  const frozenRailwayServiceIds = new Set();
  for (const service of baseline.services) {
    assertAllowedKeys(
      service,
      new Set([
        'role',
        'service',
        'deploymentId',
        'observedSha',
        'imageDigest',
        'cliMessage',
        'railwayProjectId',
        'railwayEnvironmentId',
        'railwayServiceId',
        'shaProvenance',
      ]),
      `baseline ${service.role || 'desconocido'}`,
    );
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service.deploymentId || ''), `baseline ${service.role}: deploymentId inválido`);
    const normalizedDeploymentId = service.deploymentId.toLowerCase();
    assert(!deploymentIds.has(normalizedDeploymentId), `baseline: deploymentId duplicado ${normalizedDeploymentId}`);
    deploymentIds.add(normalizedDeploymentId);
    assert(!byRole.has(service.role), `baseline: rol duplicado ${service.role}`);
    const topologyService = expected.find((item) => item.role === service.role);
    assert(topologyService, `baseline: rol desconocido ${service.role}`);
    assert(service.service === topologyService[environment], `baseline ${service.role}: nombre incorrecto`);
    const mode = deploymentMode(topologyService, environment, normalizedPromoteOnly);
    if (mode === 'frozen') {
      assert(environment === 'testing', `baseline ${service.role}: frozen sólo se permite en Testing`);
      assert(
        SHA_PATTERN.test(String(service.observedSha || '').toLowerCase()),
        `baseline ${service.role}: observedSha completo obligatorio`,
      );
      assert(
        IMAGE_DIGEST_PATTERN.test(String(service.imageDigest || '').toLowerCase()),
        `baseline ${service.role}: imageDigest obligatorio`,
      );
      if (service.role === 'lora') {
        const policy = topologyService.testingPromotion;
        assert(
          service.observedSha.toLowerCase() === policy.expectedSha,
          `baseline ${service.role}: observedSha no coincide con la topología protegida`,
        );
        assert(
          service.deploymentId.toLowerCase() === policy.deploymentId,
          `baseline ${service.role}: deploymentId no coincide con la topología protegida`,
        );
        assert(
          service.imageDigest.toLowerCase() === policy.imageDigest,
          `baseline ${service.role}: imageDigest no coincide con la topología protegida`,
        );
        assert(
          service.cliMessage === policy.cliMessage,
          `baseline ${service.role}: cliMessage no coincide con la topología protegida`,
        );
        for (const field of ['railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId']) {
          if (service[field] !== undefined) {
            assert(service[field] === policy[field], `baseline ${service.role}: ${field} no coincide`);
          }
        }
        if (service.shaProvenance !== undefined) {
          assert(
            service.shaProvenance === CLI_MESSAGE_PROVENANCE,
            `baseline ${service.role}: shaProvenance no soportada`,
          );
        }
      } else {
        assert(
          service.cliMessage === undefined,
          `baseline ${service.role}: cliMessage no corresponde a un deployment GitHub`,
        );
        for (const field of ['railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId']) {
          assert(
            UUID_PATTERN.test(String(service[field] || '').toLowerCase()),
            `baseline ${service.role}: ${field} inválido`,
          );
        }
        assert(
          service.shaProvenance === GITHUB_COMMIT_PROVENANCE,
          `baseline ${service.role}: shaProvenance debe ser ${GITHUB_COMMIT_PROVENANCE}`,
        );
        assert(
          service.railwayProjectId.toLowerCase() === canonicalTesting.railwayProjectId,
          `baseline ${service.role}: railwayProjectId no coincide con el proyecto Testing`,
        );
        assert(
          service.railwayEnvironmentId.toLowerCase() === canonicalTesting.railwayEnvironmentId,
          `baseline ${service.role}: railwayEnvironmentId no coincide con el entorno Testing`,
        );
      }
    } else {
      if (normalizedPromoteOnly) {
        assert(
          SHA_PATTERN.test(String(service.observedSha || '').toLowerCase()),
          `baseline ${service.role}: observedSha completo obligatorio para rollback selectivo`,
        );
        assert(
          IMAGE_DIGEST_PATTERN.test(String(service.imageDigest || '').toLowerCase()),
          `baseline ${service.role}: imageDigest obligatorio para rollback selectivo`,
        );
      } else {
        assert(service.observedSha === undefined, `baseline ${service.role}: observedSha sólo se permite para frozen`);
        assert(service.imageDigest === undefined, `baseline ${service.role}: imageDigest sólo se permite para frozen`);
      }
      assert(service.cliMessage === undefined, `baseline ${service.role}: cliMessage sólo se permite para frozen`);
      assert(service.railwayProjectId === undefined, `baseline ${service.role}: railwayProjectId sólo se permite para frozen`);
      assert(service.railwayEnvironmentId === undefined, `baseline ${service.role}: railwayEnvironmentId sólo se permite para frozen`);
      assert(service.railwayServiceId === undefined, `baseline ${service.role}: railwayServiceId sólo se permite para frozen`);
      assert(service.shaProvenance === undefined, `baseline ${service.role}: shaProvenance sólo se permite para frozen`);
    }
    const loraPolicy = service.role === 'lora' ? topologyService.testingPromotion : null;
    const effectiveRailwayServiceId = (
      service.railwayServiceId || loraPolicy?.railwayServiceId || ''
    ).toLowerCase();
    if (mode === 'frozen') {
      assert(
        !frozenRailwayServiceIds.has(effectiveRailwayServiceId),
        `baseline: railwayServiceId duplicado ${effectiveRailwayServiceId}`,
      );
      frozenRailwayServiceIds.add(effectiveRailwayServiceId);
    }
    byRole.set(service.role, {
      deploymentId: normalizedDeploymentId,
      observedSha: service.observedSha ? service.observedSha.toLowerCase() : null,
      imageDigest: service.imageDigest ? service.imageDigest.toLowerCase() : null,
      cliMessage: service.cliMessage || null,
      railwayProjectId: (service.railwayProjectId || loraPolicy?.railwayProjectId || '').toLowerCase() || null,
      railwayEnvironmentId: (service.railwayEnvironmentId || loraPolicy?.railwayEnvironmentId || '').toLowerCase() || null,
      railwayServiceId: effectiveRailwayServiceId || null,
      shaProvenance:
        service.shaProvenance || (loraPolicy ? CLI_MESSAGE_PROVENANCE : null),
    });
  }
  for (const service of expected) {
    assert(byRole.has(service.role), `baseline: falta ${service.role}`);
  }
  assert(byRole.size === expected.length, 'baseline contiene servicios de código inesperados');
  if (environment === 'testing') {
    const policy = expected.find((service) => service.role === 'lora').testingPromotion;
    assert(baseline.testingSafety?.loraBroker === 'testing', 'baseline: loraBroker debe ser testing');
    assert(baseline.testingSafety?.LORAWAN_MQTT_ENABLED === false, 'baseline: LORAWAN_MQTT_ENABLED debe ser false');
    assert(baseline.testingSafety?.capturedWithSkipDeploys === true, 'baseline: falta capturedWithSkipDeploys=true');
    assert(baseline.testingSafety?.testingLoraMustRemainUntouched === true, 'baseline: testing-lora debe permanecer intacto');
    assert(
      baseline.testingSafety?.testingLoraExpectedSha === policy.expectedSha,
      'baseline: testingLoraExpectedSha no coincide con la topología protegida',
    );
  }
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
  promoteOnly = null,
  baselineNow = new Date(),
}) {
  assertPromotionTopology(topology);
  const releaseSha = normalizeSha(sha, 'release.sha');
  const rollbackSha = normalizeSha(previousSha, 'rollback.sha');
  assert(releaseSha !== rollbackSha, 'release.sha y rollback.sha deben ser distintos');
  assert(['testing', 'production'].includes(environment), 'environment debe ser testing o production');
  assert(VERSION_PATTERN.test(String(version || '')), 'version tiene un formato inválido');
  const promoteOnlyRoles = normalizePromoteOnlyRoles(promoteOnly, topology, environment);
  const selectiveBaselineCapturedAt = promoteOnlyRoles
    ? normalizeSelectiveBaselineCapturedAt(deploymentBaseline, baselineNow)
    : null;
  const baselineByRole = normalizeDeploymentBaseline(
    deploymentBaseline,
    topology,
    environment,
    promoteOnlyRoles,
  );
  if (promoteOnlyRoles) {
    for (const role of promoteOnlyRoles) {
      assert(
        baselineByRole.get(role).observedSha === rollbackSha,
        `baseline ${role}: observedSha debe coincidir con rollback.sha en un release selectivo`,
      );
    }
  }

  const manifest = {
    schemaVersion: 2,
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
      requireSameCommitAcrossPromotedServices: true,
      frozenServicesImmutable: true,
      migrationMode: 'additive-only',
      automaticMigrationOnStartup: false,
      ...(promoteOnlyRoles
        ? { promoteOnlyRoles, selectiveBaselineCapturedAt }
        : {}),
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
    services: codeServices(topology).map((service) => {
      const mode = deploymentMode(service, environment, promoteOnlyRoles);
      const baseline = baselineByRole.get(service.role);
      const frozen = mode === 'frozen';
      return {
        role: service.role,
        service: service[environment],
        selector: service.selector,
        deploymentMode: mode,
        expectedSha: frozen ? baseline.observedSha : releaseSha,
        rollbackSha: frozen ? baseline.observedSha : rollbackSha,
        baselineDeploymentId: baseline.deploymentId,
        ...(!frozen && promoteOnlyRoles
          ? { rollbackExpectedImageDigest: baseline.imageDigest }
          : {}),
        ...(frozen ? { expectedImageDigest: baseline.imageDigest } : {}),
        ...(frozen
          ? {
              ...(baseline.cliMessage
                ? { expectedCliMessage: baseline.cliMessage }
                : {}),
              railwayProjectId: baseline.railwayProjectId,
              railwayEnvironmentId: baseline.railwayEnvironmentId,
              railwayServiceId: baseline.railwayServiceId,
              shaProvenance: baseline.shaProvenance,
            }
          : {}),
        verification:
          frozen || !service.versionPath ? 'railway-deployment-metadata' : 'endpoint',
        ...(!frozen && service.versionPath
          ? {
              versionPath: service.versionPath,
              versionUrlEnv: urlEnvironmentName(service.role),
            }
          : {}),
      };
    }),
    migrations: normalizeMigrations(migrations),
  };

  validateReleaseManifest(manifest, topology);
  return manifest;
}

function validateReleaseManifest(manifest, topology) {
  assertPromotionTopology(topology);
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
  assert(manifest.schemaVersion === 2, 'schemaVersion no soportado');
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
    new Set([
      'requireSameCommitAcrossPromotedServices',
      'frozenServicesImmutable',
      'migrationMode',
      'automaticMigrationOnStartup',
      'promoteOnlyRoles',
      'selectiveBaselineCapturedAt',
    ]),
    'policy',
  );
  assert(
    manifest.policy.requireSameCommitAcrossPromotedServices === true,
    'requireSameCommitAcrossPromotedServices debe ser true',
  );
  assert(manifest.policy.frozenServicesImmutable === true, 'frozenServicesImmutable debe ser true');
  assert(manifest.policy.migrationMode === 'additive-only', 'migrationMode debe ser additive-only');
  assert(
    manifest.policy.automaticMigrationOnStartup === false,
    'las migraciones automáticas al arrancar están prohibidas',
  );
  if (Object.hasOwn(manifest.policy, 'promoteOnlyRoles')) {
    assert(
      manifest.policy.promoteOnlyRoles !== null,
      'policy.promoteOnlyRoles no admite null; debe omitirse fuera del modo selectivo',
    );
  }
  const promoteOnlyRoles = normalizePromoteOnlyRoles(
    manifest.policy.promoteOnlyRoles,
    topology,
    manifest.environment,
  );
  if (promoteOnlyRoles) {
    assert(
      JSON.stringify(manifest.policy.promoteOnlyRoles) === JSON.stringify(promoteOnlyRoles),
      'policy.promoteOnlyRoles debe estar normalizado y en orden de topología',
    );
    const baselineCapturedAt = normalizeBuiltAt(manifest.policy.selectiveBaselineCapturedAt);
    assert(
      manifest.policy.selectiveBaselineCapturedAt === baselineCapturedAt,
      'policy.selectiveBaselineCapturedAt debe ser ISO UTC canónico',
    );
  } else {
    assert(
      manifest.policy.selectiveBaselineCapturedAt === undefined,
      'policy.selectiveBaselineCapturedAt sólo se permite en modo selectivo',
    );
  }

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
  const seenDeploymentIds = new Set();
  const seenFrozenRailwayServiceIds = new Set();
  const canonicalTesting = expected.find((service) => service.role === 'lora').testingPromotion;
  for (const [index, service] of manifest.services.entries()) {
    const context = `services[${index}]`;
    assertAllowedKeys(
      service,
      new Set([
        'role',
        'service',
        'selector',
        'deploymentMode',
        'expectedSha',
        'rollbackSha',
        'baselineDeploymentId',
        'rollbackExpectedImageDigest',
        'expectedImageDigest',
        'expectedCliMessage',
        'railwayProjectId',
        'railwayEnvironmentId',
        'railwayServiceId',
        'shaProvenance',
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
    const expectedMode = deploymentMode(
      topologyService,
      manifest.environment,
      promoteOnlyRoles,
    );
    assert(service.deploymentMode === expectedMode, `${context}: deploymentMode no autorizado`);
    const serviceExpectedSha = normalizeSha(service.expectedSha, `${context}.expectedSha`);
    const serviceRollbackSha = normalizeSha(service.rollbackSha, `${context}.rollbackSha`);
    assert(service.expectedSha === serviceExpectedSha, `${context}: expectedSha debe estar en lowercase canónico`);
    assert(service.rollbackSha === serviceRollbackSha, `${context}: rollbackSha debe estar en lowercase canónico`);
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        service.baselineDeploymentId || '',
      ),
      `${context}: baselineDeploymentId inválido`,
    );
    assert(
      !seenDeploymentIds.has(service.baselineDeploymentId),
      `${context}: baselineDeploymentId duplicado`,
    );
    seenDeploymentIds.add(service.baselineDeploymentId);
    if (service.deploymentMode === 'frozen') {
      assert(
        service.rollbackExpectedImageDigest === undefined,
        `${context}: rollbackExpectedImageDigest sólo se permite para promote selectivo`,
      );
      assert(manifest.environment === 'testing', `${context}: frozen sólo se permite en Testing`);
      if (service.role === 'lora') {
        assert(
          serviceExpectedSha === topologyService.testingPromotion.expectedSha,
          `${context}: frozen no coincide con el SHA protegido`,
        );
      }
      assert(serviceExpectedSha === serviceRollbackSha, `${context}: frozen no puede cambiar en rollback`);
      assert(
        IMAGE_DIGEST_PATTERN.test(String(service.expectedImageDigest || '').toLowerCase()),
        `${context}: expectedImageDigest inválido`,
      );
      assert(
        service.expectedImageDigest === String(service.expectedImageDigest).toLowerCase(),
        `${context}: expectedImageDigest debe estar en lowercase canónico`,
      );
      for (const field of ['railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId']) {
        assert(UUID_PATTERN.test(String(service[field] || '')), `${context}: ${field} inválido`);
      }
      assert(
        !seenFrozenRailwayServiceIds.has(service.railwayServiceId),
        `${context}: railwayServiceId duplicado`,
      );
      seenFrozenRailwayServiceIds.add(service.railwayServiceId);
      if (service.role === 'lora') {
        const policy = topologyService.testingPromotion;
        assert(service.baselineDeploymentId === policy.deploymentId, `${context}: frozen no coincide con el deployment protegido`);
        assert(service.expectedImageDigest === policy.imageDigest, `${context}: frozen no coincide con la imagen protegida`);
        assert(service.expectedCliMessage === policy.cliMessage, `${context}: frozen no coincide con el mensaje CLI protegido`);
        for (const field of ['railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId']) {
          assert(service[field] === policy[field], `${context}: ${field} no coincide con la topología protegida`);
        }
        assert(service.shaProvenance === CLI_MESSAGE_PROVENANCE, `${context}: shaProvenance no soportada`);
      } else {
        assert(
          service.railwayProjectId === canonicalTesting.railwayProjectId,
          `${context}: railwayProjectId no coincide con el proyecto Testing`,
        );
        assert(
          service.railwayEnvironmentId === canonicalTesting.railwayEnvironmentId,
          `${context}: railwayEnvironmentId no coincide con el entorno Testing`,
        );
        assert(
          service.shaProvenance === GITHUB_COMMIT_PROVENANCE,
          `${context}: shaProvenance debe ser ${GITHUB_COMMIT_PROVENANCE}`,
        );
        assert(service.expectedCliMessage === undefined, `${context}: expectedCliMessage no corresponde a GitHub`);
      }
      assert(
        service.verification === 'railway-deployment-metadata',
        `${context}: frozen debe verificarse por metadata de Railway`,
      );
      assert(!service.versionPath && !service.versionUrlEnv, `${context}: frozen no usa endpoint de release`);
    } else if (topologyService.versionPath) {
      assert(serviceExpectedSha === releaseSha, `${context}: expectedSha distinto del release`);
      assert(serviceRollbackSha === rollbackSha, `${context}: rollbackSha distinto del rollback`);
      if (promoteOnlyRoles) {
        assert(
          IMAGE_DIGEST_PATTERN.test(String(service.rollbackExpectedImageDigest || '').toLowerCase()),
          `${context}: rollbackExpectedImageDigest inválido`,
        );
        assert(
          service.rollbackExpectedImageDigest === String(service.rollbackExpectedImageDigest).toLowerCase(),
          `${context}: rollbackExpectedImageDigest debe estar en lowercase canónico`,
        );
      } else {
        assert(
          service.rollbackExpectedImageDigest === undefined,
          `${context}: rollbackExpectedImageDigest sólo se permite en modo selectivo`,
        );
      }
      assert(service.expectedImageDigest === undefined, `${context}: expectedImageDigest sólo se permite para frozen`);
      assert(service.expectedCliMessage === undefined, `${context}: expectedCliMessage sólo se permite para frozen`);
      assert(service.railwayProjectId === undefined, `${context}: railwayProjectId sólo se permite para frozen`);
      assert(service.railwayEnvironmentId === undefined, `${context}: railwayEnvironmentId sólo se permite para frozen`);
      assert(service.railwayServiceId === undefined, `${context}: railwayServiceId sólo se permite para frozen`);
      assert(service.shaProvenance === undefined, `${context}: shaProvenance sólo se permite para frozen`);
      assert(service.verification === 'endpoint', `${context}: debe verificarse por endpoint`);
      assert(service.versionPath === topologyService.versionPath, `${context}: versionPath incorrecto`);
      assert(service.versionUrlEnv === urlEnvironmentName(service.role), `${context}: versionUrlEnv incorrecto`);
    } else {
      assert(serviceExpectedSha === releaseSha, `${context}: expectedSha distinto del release`);
      assert(serviceRollbackSha === rollbackSha, `${context}: rollbackSha distinto del rollback`);
      if (promoteOnlyRoles) {
        assert(
          IMAGE_DIGEST_PATTERN.test(String(service.rollbackExpectedImageDigest || '').toLowerCase()),
          `${context}: rollbackExpectedImageDigest inválido`,
        );
        assert(
          service.rollbackExpectedImageDigest === String(service.rollbackExpectedImageDigest).toLowerCase(),
          `${context}: rollbackExpectedImageDigest debe estar en lowercase canónico`,
        );
      } else {
        assert(
          service.rollbackExpectedImageDigest === undefined,
          `${context}: rollbackExpectedImageDigest sólo se permite en modo selectivo`,
        );
      }
      assert(service.expectedImageDigest === undefined, `${context}: expectedImageDigest sólo se permite para frozen`);
      assert(service.expectedCliMessage === undefined, `${context}: expectedCliMessage sólo se permite para frozen`);
      assert(service.railwayProjectId === undefined, `${context}: railwayProjectId sólo se permite para frozen`);
      assert(service.railwayEnvironmentId === undefined, `${context}: railwayEnvironmentId sólo se permite para frozen`);
      assert(service.railwayServiceId === undefined, `${context}: railwayServiceId sólo se permite para frozen`);
      assert(service.shaProvenance === undefined, `${context}: shaProvenance sólo se permite para frozen`);
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

function validateFrozenDeploymentList(service, deployments, gitResolvedSha) {
  assert(service?.deploymentMode === 'frozen', 'La verificación live sólo admite servicios frozen');
  assert(Array.isArray(deployments) && deployments.length > 0, `${service.role}: Railway no devolvió deployments`);
  for (const deployment of deployments) {
    assert(
      Number.isFinite(Date.parse(deployment?.createdAt || '')),
      `${service.role}: createdAt inválido`,
    );
  }
  const ordered = [...deployments].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt || '');
    const rightTime = Date.parse(right?.createdAt || '');
    return rightTime - leftTime;
  });
  const current = ordered[0];
  assert(current.id === service.baselineDeploymentId, `${service.role}: el deployment Railway actual cambió`);
  assert(current.status === 'SUCCESS', `${service.role}: el deployment Railway protegido no está SUCCESS`);
  assert(
    String(current.meta?.imageDigest || '').toLowerCase() === service.expectedImageDigest,
    `${service.role}: la imagen Railway actual cambió`,
  );
  let shortSha = null;
  if (service.shaProvenance === CLI_MESSAGE_PROVENANCE) {
    assert(
      current.meta?.cliMessage === service.expectedCliMessage,
      `${service.role}: el mensaje CLI Railway actual cambió`,
    );
    const shortMatch = /^([0-9a-f]{7,40})\b/i.exec(service.expectedCliMessage);
    assert(shortMatch, `${service.role}: el mensaje CLI protegido no contiene un SHA`);
    shortSha = shortMatch[1].toLowerCase();
    assert(service.expectedSha.startsWith(shortSha), `${service.role}: el SHA corto no corresponde al protegido`);
    assert(
      normalizeSha(gitResolvedSha, `${service.role}.gitResolvedSha`) === service.expectedSha,
      `${service.role}: Git no resuelve el SHA corto al commit protegido`,
    );
    if (current.meta?.commitHash) {
      assert(
        normalizeSha(current.meta.commitHash, `${service.role}.railwayCommitHash`) === service.expectedSha,
        `${service.role}: Railway commitHash no coincide con el protegido`,
      );
    }
  } else {
    assert(
      service.shaProvenance === GITHUB_COMMIT_PROVENANCE,
      `${service.role}: shaProvenance frozen no soportada`,
    );
    assert(
      normalizeSha(current.meta.commitHash, `${service.role}.railwayCommitHash`) === service.expectedSha,
      `${service.role}: Railway commitHash no coincide con el protegido`,
    );
  }
  return {
    role: service.role,
    service: service.service,
    deploymentId: current.id,
    status: current.status,
    imageDigest: current.meta.imageDigest.toLowerCase(),
    ...(shortSha ? { cliMessage: current.meta.cliMessage } : {}),
    ...(shortSha ? { shortSha } : {}),
    resolvedSha: service.expectedSha,
    shaProvenance: service.shaProvenance,
    railwayCommitHashPresent: Boolean(current.meta?.commitHash),
  };
}

function collectRailwayDeploymentEvidence(
  manifest,
  document,
  {
    mode = 'release',
    now = new Date(),
    maxAgeMs = 15 * 60 * 1000,
    futureSkewMs = 2 * 60 * 1000,
    evidenceNotBefore = null,
  } = {},
) {
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
  const capturedTimestamp = Date.parse(capturedAt);
  const nowTimestamp = Date.parse(now instanceof Date ? now.toISOString() : String(now));
  assert(Number.isFinite(nowTimestamp), 'railwayEvidence: now inválido');
  assert(Number.isFinite(maxAgeMs) && maxAgeMs > 0, 'railwayEvidence: maxAgeMs inválido');
  assert(Number.isFinite(futureSkewMs) && futureSkewMs >= 0, 'railwayEvidence: futureSkewMs inválido');
  assert(
    capturedTimestamp <= nowTimestamp + futureSkewMs,
    'railwayEvidence: capturedAt está en el futuro',
  );
  assert(
    capturedTimestamp >= nowTimestamp - maxAgeMs,
    'railwayEvidence: evidencia vencida',
  );
  if (mode === 'rollback') {
    assert(evidenceNotBefore, 'railwayEvidence: rollback exige evidenceNotBefore');
  }
  const notBefore = normalizeBuiltAt(evidenceNotBefore || manifest.release.builtAt);
  assert(
    capturedTimestamp >= Date.parse(notBefore),
    mode === 'rollback'
      ? 'railwayEvidence: evidencia anterior al inicio del rollback'
      : 'railwayEvidence: evidencia anterior al release',
  );
  assert(Array.isArray(document.services), 'railwayEvidence.services debe ser una lista');

  const selective = Array.isArray(manifest.policy.promoteOnlyRoles);
  const expectedServices = manifest.services.filter(
    (service) =>
      service.verification === 'railway-deployment-metadata'
      || (
        mode === 'rollback'
        && selective
        && service.deploymentMode === 'promote'
      ),
  );
  const byRole = new Map();
  for (const [index, item] of document.services.entries()) {
    const context = `railwayEvidence.services[${index}]`;
    assertAllowedKeys(
      item,
      new Set(['role', 'service', 'sha', 'deploymentId', 'imageDigest', 'status', 'source']),
      context,
    );
    const service = expectedServices.find((candidate) => candidate.role === item.role);
    assert(service, `${context}: rol no pendiente o desconocido ${item.role}`);
    assert(!byRole.has(item.role), `${context}: rol duplicado ${item.role}`);
    assert(item.service === service.service, `${context}: nombre de servicio incorrecto`);
    const expectedSha = mode === 'rollback' ? service.rollbackSha : service.expectedSha;
    assert(normalizeSha(item.sha, `${context}.sha`) === expectedSha, `${context}: SHA incorrecto`);
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item.deploymentId || '',
      ),
      `${context}: deploymentId inválido`,
    );
    const selectivePromotedRollback =
      mode === 'rollback'
      && selective
      && service.deploymentMode === 'promote';
    if (service.deploymentMode === 'frozen') {
      assert(
        item.deploymentId.toLowerCase() === service.baselineDeploymentId,
        `${context}: frozen cambió de deployment`,
      );
      assert(
        String(item.imageDigest || '').toLowerCase() === service.expectedImageDigest,
        `${context}: frozen cambió de imagen`,
      );
    } else if (selectivePromotedRollback) {
      assert(
        item.deploymentId.toLowerCase() === service.baselineDeploymentId,
        `${context}: rollback promote no coincide con deployment baseline`,
      );
      assert(
        String(item.imageDigest || '').toLowerCase() === service.rollbackExpectedImageDigest,
        `${context}: rollback promote no coincide con imagen baseline`,
      );
    } else {
      assert(item.imageDigest === undefined, `${context}: imageDigest sólo se acepta para frozen`);
    }
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
      ...(service.deploymentMode === 'frozen' || selectivePromotedRollback
        ? { imageDigest: item.imageDigest.toLowerCase() }
        : {}),
    });
  }
  for (const service of expectedServices) {
    assert(byRole.has(service.role), `railwayEvidence: falta ${service.role}`);
  }
  assert(
    byRole.size === expectedServices.length,
    'railwayEvidence contiene servicios inesperados',
  );
  return {
    expectedSha: mode === 'rollback' ? manifest.rollback.sha : manifest.release.sha,
    capturedAt,
    evidence: [...byRole.values()],
    frozenRoles: manifest.services
      .filter((service) => service.deploymentMode === 'frozen')
      .map((service) => service.role),
  };
}

async function collectVersionEvidence(
  manifest,
  { mode = 'release', environment = process.env, fetchImpl = global.fetch } = {},
) {
  assert(['release', 'rollback'].includes(mode), 'mode debe ser release o rollback');
  assert(typeof fetchImpl === 'function', 'fetch no está disponible');
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
    const expectedRelease = mode === 'rollback'
      ? { sha: service.rollbackSha }
      : manifest.release;
    evidence.push(validateVersionPayload(await response.json(), service, expectedRelease));
  }

  return {
    expectedSha: mode === 'rollback' ? manifest.rollback.sha : manifest.release.sha,
    evidence,
    pendingRoles: manifest.services
      .filter(
        (service) =>
          service.verification !== 'endpoint'
          || (
            mode === 'rollback'
            && Array.isArray(manifest.policy.promoteOnlyRoles)
            && service.deploymentMode === 'promote'
          ),
      )
      .map((service) => service.role),
    missingVersionRoles: manifest.services
      .filter(
        (service) =>
          service.deploymentMode === 'promote' && service.verification !== 'endpoint',
      )
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
  normalizePromoteOnlyRoles,
  normalizeSha,
  parsePromoteOnlyCsv,
  validateFrozenDeploymentList,
  validateReleaseManifest,
  validateVersionPayload,
};
