const fs = require('fs');
const path = require('path');

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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

function deploymentMode(service, environment) {
  if (environment === 'testing' && service.testingPromotion?.mode === 'frozen-at-baseline') {
    return 'frozen';
  }
  return 'promote';
}

function assertPromotionTopology(topology) {
  const code = codeServices(topology);
  const protectedServices = code.filter((service) => service.testingPromotion !== undefined);
  assert(
    protectedServices.length === 1 && protectedServices[0].role === 'lora',
    'La única excepción de promoción permitida es testing-lora',
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

function normalizeDeploymentBaseline(baseline, topology, environment) {
  assertPromotionTopology(topology);
  assert(baseline && typeof baseline === 'object', 'deploymentBaseline es obligatorio');
  assert(baseline.schemaVersion === 1, 'deploymentBaseline.schemaVersion no soportado');
  assert(baseline.environment === environment, 'deploymentBaseline pertenece a otro entorno');
  assert(baseline.readOnlyEvidence === true, 'deploymentBaseline debe ser evidencia read-only');
  assert(baseline.doNotDeploy === true, 'deploymentBaseline debe declarar doNotDeploy=true');
  assert(Array.isArray(baseline.services), 'deploymentBaseline.services debe ser una lista');
  const expected = codeServices(topology);
  const byRole = new Map();
  for (const service of baseline.services) {
    assertAllowedKeys(
      service,
      new Set(['role', 'service', 'deploymentId', 'observedSha', 'imageDigest', 'cliMessage']),
      `baseline ${service.role || 'desconocido'}`,
    );
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service.deploymentId || ''), `baseline ${service.role}: deploymentId inválido`);
    assert(!byRole.has(service.role), `baseline: rol duplicado ${service.role}`);
    const topologyService = expected.find((item) => item.role === service.role);
    assert(topologyService, `baseline: rol desconocido ${service.role}`);
    assert(service.service === topologyService[environment], `baseline ${service.role}: nombre incorrecto`);
    const mode = deploymentMode(topologyService, environment);
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
      assert(
        service.observedSha.toLowerCase() === topologyService.testingPromotion.expectedSha,
        `baseline ${service.role}: observedSha no coincide con la topología protegida`,
      );
      assert(
        service.deploymentId.toLowerCase() === topologyService.testingPromotion.deploymentId,
        `baseline ${service.role}: deploymentId no coincide con la topología protegida`,
      );
      assert(
        service.imageDigest.toLowerCase() === topologyService.testingPromotion.imageDigest,
        `baseline ${service.role}: imageDigest no coincide con la topología protegida`,
      );
      assert(
        service.cliMessage === topologyService.testingPromotion.cliMessage,
        `baseline ${service.role}: cliMessage no coincide con la topología protegida`,
      );
    } else {
      assert(service.observedSha === undefined, `baseline ${service.role}: observedSha sólo se permite para frozen`);
      assert(service.imageDigest === undefined, `baseline ${service.role}: imageDigest sólo se permite para frozen`);
      assert(service.cliMessage === undefined, `baseline ${service.role}: cliMessage sólo se permite para frozen`);
    }
    byRole.set(service.role, {
      deploymentId: service.deploymentId.toLowerCase(),
      observedSha: service.observedSha ? service.observedSha.toLowerCase() : null,
      imageDigest: service.imageDigest ? service.imageDigest.toLowerCase() : null,
      cliMessage: service.cliMessage || null,
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
}) {
  assertPromotionTopology(topology);
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
      const mode = deploymentMode(service, environment);
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
        ...(frozen ? { expectedImageDigest: baseline.imageDigest } : {}),
        ...(frozen
          ? {
              expectedCliMessage: baseline.cliMessage,
              railwayProjectId: service.testingPromotion.railwayProjectId,
              railwayEnvironmentId: service.testingPromotion.railwayEnvironmentId,
              railwayServiceId: service.testingPromotion.railwayServiceId,
              shaProvenance: 'railway-cli-message+git-resolution',
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
        'deploymentMode',
        'expectedSha',
        'rollbackSha',
        'baselineDeploymentId',
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
    const expectedMode = deploymentMode(topologyService, manifest.environment);
    assert(service.deploymentMode === expectedMode, `${context}: deploymentMode no autorizado`);
    const serviceExpectedSha = normalizeSha(service.expectedSha, `${context}.expectedSha`);
    const serviceRollbackSha = normalizeSha(service.rollbackSha, `${context}.rollbackSha`);
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        service.baselineDeploymentId || '',
      ),
      `${context}: baselineDeploymentId inválido`,
    );
    if (service.deploymentMode === 'frozen') {
      assert(manifest.environment === 'testing', `${context}: frozen sólo se permite en Testing`);
      assert(
        serviceExpectedSha === topologyService.testingPromotion.expectedSha,
        `${context}: frozen no coincide con el SHA protegido`,
      );
      assert(serviceExpectedSha === serviceRollbackSha, `${context}: frozen no puede cambiar en rollback`);
      assert(
        service.baselineDeploymentId === topologyService.testingPromotion.deploymentId,
        `${context}: frozen no coincide con el deployment protegido`,
      );
      assert(
        IMAGE_DIGEST_PATTERN.test(String(service.expectedImageDigest || '').toLowerCase()),
        `${context}: expectedImageDigest inválido`,
      );
      assert(
        service.expectedImageDigest === topologyService.testingPromotion.imageDigest,
        `${context}: frozen no coincide con la imagen protegida`,
      );
      assert(
        service.expectedCliMessage === topologyService.testingPromotion.cliMessage,
        `${context}: frozen no coincide con el mensaje CLI protegido`,
      );
      for (const field of ['railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId']) {
        assert(UUID_PATTERN.test(String(service[field] || '')), `${context}: ${field} inválido`);
        assert(
          service[field] === topologyService.testingPromotion[field],
          `${context}: ${field} no coincide con la topología protegida`,
        );
      }
      assert(
        service.shaProvenance === 'railway-cli-message+git-resolution',
        `${context}: shaProvenance no soportada`,
      );
      assert(
        service.verification === 'railway-deployment-metadata',
        `${context}: frozen debe verificarse por metadata de Railway`,
      );
      assert(!service.versionPath && !service.versionUrlEnv, `${context}: frozen no usa endpoint de release`);
    } else if (topologyService.versionPath) {
      assert(serviceExpectedSha === releaseSha, `${context}: expectedSha distinto del release`);
      assert(serviceRollbackSha === rollbackSha, `${context}: rollbackSha distinto del rollback`);
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
  const ordered = [...deployments].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt || '');
    const rightTime = Date.parse(right?.createdAt || '');
    assert(Number.isFinite(leftTime) && Number.isFinite(rightTime), `${service.role}: createdAt inválido`);
    return rightTime - leftTime;
  });
  const current = ordered[0];
  assert(current.id === service.baselineDeploymentId, `${service.role}: el deployment Railway actual cambió`);
  assert(current.status === 'SUCCESS', `${service.role}: el deployment Railway protegido no está SUCCESS`);
  assert(
    String(current.meta?.imageDigest || '').toLowerCase() === service.expectedImageDigest,
    `${service.role}: la imagen Railway actual cambió`,
  );
  assert(
    current.meta?.cliMessage === service.expectedCliMessage,
    `${service.role}: el mensaje CLI Railway actual cambió`,
  );
  const shortMatch = /^([0-9a-f]{7,40})\b/i.exec(service.expectedCliMessage);
  assert(shortMatch, `${service.role}: el mensaje CLI protegido no contiene un SHA`);
  const shortSha = shortMatch[1].toLowerCase();
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
  return {
    role: service.role,
    service: service.service,
    deploymentId: current.id,
    status: current.status,
    imageDigest: current.meta.imageDigest.toLowerCase(),
    cliMessage: current.meta.cliMessage,
    shortSha,
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

  const expectedServices = manifest.services.filter(
    (service) => service.verification === 'railway-deployment-metadata',
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
    if (service.deploymentMode === 'frozen') {
      assert(
        item.deploymentId.toLowerCase() === service.baselineDeploymentId,
        `${context}: frozen cambió de deployment`,
      );
      assert(
        String(item.imageDigest || '').toLowerCase() === service.expectedImageDigest,
        `${context}: frozen cambió de imagen`,
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
      ...(service.deploymentMode === 'frozen'
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
      .filter((service) => service.verification !== 'endpoint')
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
  normalizeSha,
  validateFrozenDeploymentList,
  validateReleaseManifest,
  validateVersionPayload,
};
