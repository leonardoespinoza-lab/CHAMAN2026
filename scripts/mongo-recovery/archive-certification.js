const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const {
  assertNoSecrets,
  compareInventories,
  normalizeInventory,
  readJson,
  sha256File,
  sha256Json,
  validateTargetAttestation,
} = require('./lib');
const { verifyRestrictedDirectory, verifyRestrictedFile } = require('./secure-config');
const { validateRuntimeProof } = require('./runtime-proof');
const { bindAttestationToEvidence, validateInfrastructureEvidence } = require('./infrastructure-evidence');

const ARCHIVE_CERTIFICATION_KIND = 'chaman-mongo-archive-certification';
const ARCHIVE_CERTIFICATION_STABILITY_DELAY_SECONDS = 130;
const SHA256 = /^[0-9a-f]{64}$/i;
const COMPARISON_KEYS = [
  'ok', 'sourceCollections', 'targetCollections',
  'sourceDocuments', 'targetDocuments', 'findings',
];

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} debe ser un objeto JSON.`);
  const extras = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !(key in value));
  if (extras.length || missing.length) fail(`${label} contiene campos inesperados o faltantes.`);
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`Falta ${label}.`);
  return value.trim();
}

function hash(value, label) {
  const normalized = text(value, label).toLowerCase();
  if (!SHA256.test(normalized)) fail(`${label} invalido.`);
  return normalized;
}

function integer(value, label, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) fail(`${label} invalido.`);
  return value;
}

function isoDate(value, label) {
  const parsed = new Date(value);
  if (typeof value !== 'string' || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label} invalido.`);
  }
  return parsed;
}

function inventoryCounts(inventory) {
  return {
    collections: inventory.collections.length,
    documents: inventory.collections.reduce((sum, item) => sum + (item.count || 0), 0),
  };
}

function comparisonValue(value, label, expected) {
  exactKeys(value, COMPARISON_KEYS, label);
  if (typeof value.ok !== 'boolean' || !Array.isArray(value.findings)) {
    fail(`${label} contiene estado o findings invalidos.`);
  }
  for (const key of ['sourceCollections', 'targetCollections', 'sourceDocuments', 'targetDocuments']) {
    integer(value[key], `${label}.${key}`);
  }
  if (value.findings.length !== expected.findings.length) {
    fail(`${label} no coincide con la comparacion recalculada.`);
  }
  value.findings.forEach((finding, index) => {
    exactKeys(finding, Object.keys(expected.findings[index]), `${label}.findings[${index}]`);
  });
  if (!isDeepStrictEqual(value, expected)) {
    fail(`${label} no coincide con la comparacion recalculada.`);
  }
  return value;
}

function comparisonFields(value) {
  return Object.fromEntries(COMPARISON_KEYS.map((key) => [key, value[key]]));
}

function artifact(certificateDir, value, label, expectedName) {
  exactKeys(value, ['file', 'sha256'], label);
  const file = text(value.file, `${label}.file`);
  if (file !== expectedName || path.basename(file) !== file) fail(`${label}.file invalido.`);
  const resolved = path.resolve(certificateDir, file);
  const relative = path.relative(path.resolve(certificateDir), resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label} intenta salir del directorio de certificacion.`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) fail(`Falta ${label}.`);
  const expectedSha256 = hash(value.sha256, `${label}.sha256`);
  if (sha256File(resolved).toLowerCase() !== expectedSha256) fail(`Checksum invalido para ${label}.`);
  return { path: resolved, sha256: expectedSha256 };
}

function buildArchiveCertification(fields) {
  const certificate = {
    schemaVersion: 1,
    kind: ARCHIVE_CERTIFICATION_KIND,
    ...fields,
  };
  assertNoSecrets(certificate);
  return certificate;
}

function validateArchiveCertification(value, {
  certificateDir,
  manifest,
  manifestPath,
  manifestVerified,
} = {}) {
  exactKeys(
    value,
    [
      'schemaVersion', 'kind', 'drillId', 'drillMode', 'sourceDatabase', 'certificationDatabase',
      'sourceManifestSha256', 'archiveSha256', 'certificationTarget', 'restoreArtifacts',
      'inventory', 'audits', 'sourceObservation', 'certifierGitSha', 'tools', 'certifiedAt', 'status',
    ],
    'certificacion de archive',
  );
  if (value.schemaVersion !== 1 || value.kind !== ARCHIVE_CERTIFICATION_KIND) {
    fail('Formato de certificacion de archive no soportado.');
  }
  assertNoSecrets(value);
  if (!manifest || !manifestPath || !manifestVerified) fail('Falta el manifiesto validado para la certificacion.');
  if (manifest.schemaVersion !== 2 || manifest.certificationRequired !== true) {
    fail('La certificacion exige un manifiesto candidato schema v2.');
  }
  const drillId = text(value.drillId, 'drillId');
  if (drillId !== manifest.drillId || value.drillMode !== manifest.drillMode) {
    fail('La certificacion no coincide con drillId/drillMode del manifiesto.');
  }
  if (value.sourceDatabase !== manifest.database) fail('La certificacion refiere otra base source.');
  if (!/^[0-9a-f]{40}$/i.test(value.certifierGitSha || '')) fail('certifierGitSha invalido.');
  exactKeys(value.tools, ['mongosh', 'mongorestore'], 'tools');
  text(value.tools.mongosh, 'tools.mongosh');
  text(value.tools.mongorestore, 'tools.mongorestore');
  const certificationDatabase = text(value.certificationDatabase, 'certificationDatabase');
  if (!/^chaman_restore_drill_[A-Za-z0-9_-]{1,42}$/.test(certificationDatabase)) {
    fail('certificationDatabase no es descartable o contiene caracteres invalidos.');
  }
  if (hash(value.sourceManifestSha256, 'sourceManifestSha256') !== sha256File(manifestPath).toLowerCase()) {
    fail('La certificacion no coincide con el SHA del manifiesto.');
  }
  if (
    hash(value.archiveSha256, 'archiveSha256') !== manifest.archive.sha256.toLowerCase() ||
    value.archiveSha256.toLowerCase() !== sha256File(manifestVerified.archivePath).toLowerCase()
  ) {
    fail('La certificacion no coincide con el archive sellado.');
  }
  exactKeys(
    value.certificationTarget,
    [
      'targetAttestationSha256', 'infrastructureEvidenceSha256', 'targetRuntimeProofSha256',
      'verificationRuntimeProofSha256', 'instanceId', 'endpointFingerprintSha256',
      'replicaSet', 'dbPathSha256', 'processId', 'verificationProcessId',
    ],
    'certificationTarget',
  );
  for (const key of ['targetAttestationSha256', 'infrastructureEvidenceSha256', 'targetRuntimeProofSha256', 'verificationRuntimeProofSha256', 'endpointFingerprintSha256', 'dbPathSha256']) {
    hash(value.certificationTarget[key], `certificationTarget.${key}`);
  }
  text(value.certificationTarget.instanceId, 'certificationTarget.instanceId');
  text(value.certificationTarget.replicaSet, 'certificationTarget.replicaSet');
  integer(value.certificationTarget.processId, 'certificationTarget.processId', { min: 1 });
  integer(value.certificationTarget.verificationProcessId, 'certificationTarget.verificationProcessId', { min: 1 });
  exactKeys(
    value.restoreArtifacts,
    [
      'intent', 'receipt', 'verification', 'runtimeProof', 'verifyRuntimeProof',
      'postRestoreRuntime', 'liveBeforeAuditsRuntime', 'liveAfterAuditsRuntime',
      'targetAttestation', 'infrastructureEvidence', 'emptyInventory', 'beforeAuditsInventory',
    ],
    'restoreArtifacts',
  );
  const intentArtifact = artifact(certificateDir, value.restoreArtifacts.intent, 'restoreArtifacts.intent', 'restore-intent.json');
  const receiptArtifact = artifact(certificateDir, value.restoreArtifacts.receipt, 'restoreArtifacts.receipt', 'restore-receipt.json');
  const verificationArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.verification,
    'restoreArtifacts.verification',
    'verification.json',
  );
  const runtimeProofArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.runtimeProof,
    'restoreArtifacts.runtimeProof',
    'target-runtime-proof-restore.json',
  );
  const verifyRuntimeProofArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.verifyRuntimeProof,
    'restoreArtifacts.verifyRuntimeProof',
    'target-runtime-proof-verify.json',
  );
  const postRestoreRuntimeArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.postRestoreRuntime,
    'restoreArtifacts.postRestoreRuntime',
    'target-runtime-proof-live-after-restore.json',
  );
  const liveBeforeAuditsRuntimeArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.liveBeforeAuditsRuntime,
    'restoreArtifacts.liveBeforeAuditsRuntime',
    'target-runtime-proof-live-before-audits.json',
  );
  const liveAfterAuditsRuntimeArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.liveAfterAuditsRuntime,
    'restoreArtifacts.liveAfterAuditsRuntime',
    'target-runtime-proof-live-after-audits.json',
  );
  const targetAttestationArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.targetAttestation,
    'restoreArtifacts.targetAttestation',
    'target-attestation.json',
  );
  const infrastructureEvidenceArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.infrastructureEvidence,
    'restoreArtifacts.infrastructureEvidence',
    'infrastructure-evidence.json',
  );
  const emptyInventoryArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.emptyInventory,
    'restoreArtifacts.emptyInventory',
    'target-inventory-before.json',
  );
  const beforeAuditsArtifact = artifact(
    certificateDir,
    value.restoreArtifacts.beforeAuditsInventory,
    'restoreArtifacts.beforeAuditsInventory',
    'target-inventory-before-audits.json',
  );
  const runtimeProofValue = readJson(runtimeProofArtifact.path);
  const runtimeProofValidated = validateRuntimeProof(runtimeProofValue, {
    expectedDatabase: certificationDatabase,
    allowExpired: true,
    purpose: 'operation',
  });
  if (
    runtimeProofValidated.schemaVersion !== 2 ||
    runtimeProofValidated.ttlMonitorEnabled !== false ||
    runtimeProofArtifact.sha256 !== value.certificationTarget.targetRuntimeProofSha256.toLowerCase() ||
    runtimeProofValidated.instanceId !== value.certificationTarget.instanceId.toLowerCase() ||
    runtimeProofValidated.endpointFingerprintSha256 !== value.certificationTarget.endpointFingerprintSha256.toLowerCase() ||
    runtimeProofValidated.replicaSet !== value.certificationTarget.replicaSet ||
    runtimeProofValidated.dbPathSha256 !== value.certificationTarget.dbPathSha256.toLowerCase() ||
    runtimeProofValidated.processId !== value.certificationTarget.processId
  ) {
    fail('Runtime proof de certificacion no coincide con la identidad sellada o TTL no esta deshabilitado.');
  }
  const validateOperationRuntime = (runtimeArtifact, label) => {
    const runtimeValue = readJson(runtimeArtifact.path);
    const runtimeValidated = validateRuntimeProof(runtimeValue, {
      expectedDatabase: certificationDatabase,
      allowExpired: true,
      purpose: 'operation',
    });
    if (
      runtimeValidated.schemaVersion !== 2 ||
      runtimeValidated.ttlMonitorEnabled !== false ||
      runtimeValidated.instanceId !== runtimeProofValidated.instanceId ||
      runtimeValidated.endpointFingerprintSha256 !== runtimeProofValidated.endpointFingerprintSha256 ||
      runtimeValidated.replicaSet !== runtimeProofValidated.replicaSet ||
      runtimeValidated.dbPathSha256 !== runtimeProofValidated.dbPathSha256
    ) {
      fail(`${label} no coincide con el runtime local sellado o TTL no esta deshabilitado.`);
    }
    return { value: runtimeValue, validated: runtimeValidated, artifact: runtimeArtifact };
  };
  const verifyRuntime = validateOperationRuntime(verifyRuntimeProofArtifact, 'Runtime proof de verify');
  const postRestoreRuntime = validateOperationRuntime(postRestoreRuntimeArtifact, 'Runtime post-restore');
  const liveBeforeAuditsRuntime = validateOperationRuntime(liveBeforeAuditsRuntimeArtifact, 'Runtime pre-auditoria');
  const liveAfterAuditsRuntime = validateOperationRuntime(liveAfterAuditsRuntimeArtifact, 'Runtime post-auditoria');
  if (
    postRestoreRuntime.validated.processId !== runtimeProofValidated.processId ||
    verifyRuntime.validated.processId !== value.certificationTarget.verificationProcessId ||
    liveBeforeAuditsRuntime.validated.processId !== verifyRuntime.validated.processId ||
    liveAfterAuditsRuntime.validated.processId !== verifyRuntime.validated.processId ||
    verifyRuntimeProofArtifact.sha256 !== value.certificationTarget.verificationRuntimeProofSha256.toLowerCase()
  ) {
    fail('Los processId o proofs runtime de la certificacion no forman una cadena estable.');
  }
  const targetAttestationValue = readJson(targetAttestationArtifact.path);
  const targetAttestation = validateTargetAttestation(targetAttestationValue, { allowExpired: true });
  const evidenceValue = readJson(infrastructureEvidenceArtifact.path);
  const evidenceValidated = validateInfrastructureEvidence(evidenceValue, {
    allowExpired: true,
    baseDir: certificateDir,
  });
  const evidence = {
    sha256: infrastructureEvidenceArtifact.sha256,
    value: evidenceValue,
    validated: evidenceValidated,
  };
  bindAttestationToEvidence(targetAttestationValue, targetAttestation, evidence, 'target');
  if (
    targetAttestation.drillId !== drillId ||
    targetAttestation.drillMode !== manifest.drillMode ||
    targetAttestation.database !== certificationDatabase ||
    targetAttestationArtifact.sha256 !== value.certificationTarget.targetAttestationSha256.toLowerCase() ||
    infrastructureEvidenceArtifact.sha256 !== value.certificationTarget.infrastructureEvidenceSha256.toLowerCase() ||
    evidenceValidated.source.provider !== manifest.sourceInstance.provider ||
    evidenceValidated.source.serviceId !== manifest.sourceInstance.instanceId.toLowerCase() ||
    evidenceValidated.target.instanceId !== runtimeProofValidated.instanceId
  ) {
    fail('Atestacion/evidencia de certificacion no coincide con manifiesto, destino o runtime sellado.');
  }
  const emptyInventory = normalizeInventory(readJson(emptyInventoryArtifact.path));
  if (
    emptyInventory.schemaVersion !== 2 ||
    emptyInventory.database !== certificationDatabase ||
    emptyInventory.collections.length !== 0
  ) {
    fail('El certificado no acredita un destino inicial vacio con digest documental.');
  }
  exactKeys(
    value.inventory,
    ['file', 'sha256', 'collections', 'documents', 'serverVersion', 'capturedAt'],
    'inventory',
  );
  const inventoryArtifact = artifact(
    certificateDir,
    { file: value.inventory.file, sha256: value.inventory.sha256 },
    'inventory',
    'target-inventory-after-audits.json',
  );
  const inventory = normalizeInventory(readJson(inventoryArtifact.path));
  const inventoryCapturedAt = new Date(value.inventory.capturedAt);
  if (!Number.isFinite(inventoryCapturedAt.getTime()) || inventoryCapturedAt.toISOString() !== value.inventory.capturedAt) {
    fail('inventory.capturedAt invalido.');
  }
  if (inventory.schemaVersion !== 2 || inventory.database !== certificationDatabase) {
    fail('El inventario certificado refiere otra base local o carece de digest documental.');
  }
  if (
    integer(value.inventory.collections, 'inventory.collections') !== inventory.collections.length ||
    integer(value.inventory.documents, 'inventory.documents') !==
      inventory.collections.reduce((sum, item) => sum + (item.count || 0), 0) ||
    text(value.inventory.serverVersion, 'inventory.serverVersion') !== inventory.serverVersion ||
    inventoryCapturedAt.toISOString() !== inventory.capturedAt
  ) {
    fail('El resumen del inventario certificado no coincide.');
  }
  exactKeys(value.audits, ['agronomic', 'lotIntegrity'], 'audits');
  const agronomicArtifact = artifact(
    certificateDir,
    value.audits.agronomic,
    'audits.agronomic',
    'audit-restored-agronomic-data.json',
  );
  const lotArtifact = artifact(
    certificateDir,
    value.audits.lotIntegrity,
    'audits.lotIntegrity',
    'audit-lote-data-integrity.json',
  );
  const agronomic = readJson(agronomicArtifact.path);
  const lotIntegrity = readJson(lotArtifact.path);
  if (agronomic.ok !== true || lotIntegrity.ok !== true) fail('La certificacion contiene auditorias no aprobadas.');
  exactKeys(
    value.sourceObservation,
    ['sourcePointInTimeGuaranteed', 'comparison', 'beforeToCertified', 'afterToCertified'],
    'sourceObservation',
  );
  const beforeToCertified = compareInventories(manifestVerified.sourceBefore, inventory);
  const afterToCertified = compareInventories(manifestVerified.sourceAfter, inventory);
  if (
    value.sourceObservation.sourcePointInTimeGuaranteed !== manifestVerified.sourcePointInTimeGuaranteed ||
    JSON.stringify(value.sourceObservation.comparison) !== JSON.stringify(manifestVerified.sourceComparison) ||
    JSON.stringify(value.sourceObservation.beforeToCertified) !== JSON.stringify(beforeToCertified) ||
    JSON.stringify(value.sourceObservation.afterToCertified) !== JSON.stringify(afterToCertified)
  ) {
    fail('La certificacion oculta o altera la deriva source/archive observada.');
  }
  const certifiedAt = isoDate(value.certifiedAt, 'certifiedAt');
  if (value.status !== 'certified') fail('La certificacion no esta aprobada.');
  const intent = readJson(intentArtifact.path);
  const receipt = readJson(receiptArtifact.path);
  const verification = readJson(verificationArtifact.path);
  exactKeys(intent, [
    'schemaVersion', 'kind', 'restoreRole', 'drillId', 'sourceManifestSha256',
    'targetAttestationSha256', 'infrastructureEvidenceSha256', 'targetRuntimeProofSha256',
    'archiveCertificationSha256', 'sourceDatabase', 'targetDatabase', 'emptyInventorySha256',
    'authorizedAt', 'status',
  ], 'restore intent de certificacion');
  exactKeys(receipt, [
    'schemaVersion', 'kind', 'restoreRole', 'drillId', 'sourceManifestSha256',
    'targetAttestationSha256', 'infrastructureEvidenceSha256', 'targetRuntimeProofSha256',
    'archiveCertificationSha256', 'restoreIntentSha256', 'sourceDatabase', 'targetDatabase',
    'targetMongoVersion', 'startedAt', 'completedAt', 'postRestoreRuntime',
    'restoredInventory', 'status',
  ], 'restore receipt de certificacion');
  exactKeys(verification, [
    'schemaVersion', 'kind', 'restoreRole', 'drillId', 'sourceManifestSha256',
    'archiveCertificationSha256', 'restoreReceiptSha256', 'sourceDatabase', 'targetDatabase',
    'currentRuntimeProofSha256', 'liveRuntimeValueSha256', 'postAuditRuntimeValueSha256',
    'runtimeProcessId', 'verifiedAt', 'restoreCompletedAt', 'stabilityCheckedAt',
    'stabilityDelaySeconds', 'requiredStabilityDelaySeconds', 'inventory',
    'auditWindowInventory', 'audits', 'status',
  ], 'verification de certificacion');
  exactKeys(
    receipt.postRestoreRuntime,
    ['file', 'sha256', 'valueSha256'],
    'restore receipt.postRestoreRuntime',
  );
  exactKeys(
    receipt.restoredInventory,
    ['file', 'sha256', 'collections', 'documents', 'certifiedComparison'],
    'restore receipt.restoredInventory',
  );
  exactKeys(
    verification.inventory,
    [...COMPARISON_KEYS, 'file', 'sha256'],
    'verification.inventory',
  );
  exactKeys(
    verification.auditWindowInventory,
    ['ok', 'immediate', 'beforeAudits', 'afterAudits', 'beforeVsAfter'],
    'verification.auditWindowInventory',
  );
  exactKeys(
    verification.auditWindowInventory.immediate,
    ['file', 'sha256', 'expectedComparison'],
    'verification.auditWindowInventory.immediate',
  );
  exactKeys(
    verification.auditWindowInventory.beforeAudits,
    ['file', 'sha256', 'sourceComparison'],
    'verification.auditWindowInventory.beforeAudits',
  );
  exactKeys(
    verification.auditWindowInventory.afterAudits,
    ['file', 'sha256', 'sourceComparison'],
    'verification.auditWindowInventory.afterAudits',
  );
  if (
    intent.schemaVersion !== 2 || receipt.schemaVersion !== 2 || verification.schemaVersion !== 2 ||
    intent.kind !== 'chaman-mongo-restore-intent' ||
    receipt.kind !== 'chaman-mongo-restore-receipt' ||
    verification.kind !== 'chaman-mongo-restore-verification' ||
    intent.restoreRole !== 'certification' ||
    receipt.restoreRole !== 'certification' ||
    verification.restoreRole !== 'certification' ||
    intent.status !== 'restore-authorized' || receipt.status !== 'restored-unverified' ||
    verification.status !== 'passed'
  ) {
    fail('La cadena de restore usada para certificar no es valida.');
  }
  const restoreCompletedAt = isoDate(receipt.completedAt, 'restore-receipt.completedAt');
  const restoreAuthorizedAt = isoDate(intent.authorizedAt, 'restore-intent.authorizedAt');
  const restoreStartedAt = isoDate(receipt.startedAt, 'restore-receipt.startedAt');
  const stabilityCheckedAt = isoDate(verification.stabilityCheckedAt, 'verification.stabilityCheckedAt');
  const verifiedAt = isoDate(verification.verifiedAt, 'verification.verifiedAt');
  const stabilityDelaySeconds = Number(verification.stabilityDelaySeconds);
  const measuredDelaySeconds = (stabilityCheckedAt.getTime() - restoreCompletedAt.getTime()) / 1000;
  if (
    verification.restoreCompletedAt !== receipt.completedAt ||
    verification.requiredStabilityDelaySeconds !== ARCHIVE_CERTIFICATION_STABILITY_DELAY_SECONDS ||
    !Number.isFinite(stabilityDelaySeconds) ||
    stabilityDelaySeconds < ARCHIVE_CERTIFICATION_STABILITY_DELAY_SECONDS ||
    stabilityDelaySeconds !== measuredDelaySeconds ||
    restoreAuthorizedAt < runtimeProofValidated.collectedAt ||
    restoreAuthorizedAt >= runtimeProofValidated.expiresAt ||
    restoreStartedAt < restoreAuthorizedAt ||
    restoreStartedAt >= runtimeProofValidated.expiresAt ||
    restoreCompletedAt < restoreStartedAt ||
    postRestoreRuntime.validated.collectedAt < restoreStartedAt ||
    restoreCompletedAt < postRestoreRuntime.validated.collectedAt ||
    restoreCompletedAt >= postRestoreRuntime.validated.expiresAt ||
    stabilityCheckedAt < verifyRuntime.validated.collectedAt ||
    stabilityCheckedAt >= verifyRuntime.validated.expiresAt ||
    liveBeforeAuditsRuntime.validated.collectedAt < stabilityCheckedAt ||
    verifiedAt < liveBeforeAuditsRuntime.validated.collectedAt ||
    verifiedAt >= liveBeforeAuditsRuntime.validated.expiresAt ||
    verifiedAt < liveAfterAuditsRuntime.validated.collectedAt ||
    verifiedAt >= liveAfterAuditsRuntime.validated.expiresAt ||
    liveAfterAuditsRuntime.validated.collectedAt < liveBeforeAuditsRuntime.validated.collectedAt ||
    verifiedAt < stabilityCheckedAt ||
    certifiedAt.getTime() !== verifiedAt.getTime()
  ) {
    fail('La certificacion no acredita una ventana estable completa de 130 segundos.');
  }
  const manifestSha256 = sha256File(manifestPath).toLowerCase();
  for (const [artifactValue, label] of [[intent, 'intent'], [receipt, 'receipt'], [verification, 'verification']]) {
    if (
      artifactValue.drillId !== drillId ||
      artifactValue.sourceDatabase !== manifest.database ||
      artifactValue.targetDatabase !== certificationDatabase ||
      String(artifactValue.sourceManifestSha256 || '').toLowerCase() !== manifestSha256
    ) {
      fail(`${label} de certificacion no coincide con manifiesto/destino.`);
    }
  }
  for (const [artifactValue, label] of [[intent, 'intent'], [receipt, 'receipt']]) {
    if (
      String(artifactValue.targetAttestationSha256 || '').toLowerCase() !==
        value.certificationTarget.targetAttestationSha256.toLowerCase() ||
      String(artifactValue.infrastructureEvidenceSha256 || '').toLowerCase() !==
        value.certificationTarget.infrastructureEvidenceSha256.toLowerCase() ||
      String(artifactValue.targetRuntimeProofSha256 || '').toLowerCase() !==
        value.certificationTarget.targetRuntimeProofSha256.toLowerCase()
    ) {
      fail(`${label} no coincide con atestacion/evidencia/runtime de la certificacion.`);
    }
  }
  if (
    String(receipt.restoreIntentSha256 || '').toLowerCase() !== intentArtifact.sha256 ||
    String(verification.restoreReceiptSha256 || '').toLowerCase() !== receiptArtifact.sha256 ||
    String(verification.inventory?.sha256 || '').toLowerCase() !== inventoryArtifact.sha256 ||
    String(intent.emptyInventorySha256 || '').toLowerCase() !== emptyInventoryArtifact.sha256
  ) {
    fail('La cadena intent/receipt/verification/inventory de certificacion fue alterada.');
  }
  if (
    String(receipt.postRestoreRuntime?.file || '') !== path.basename(postRestoreRuntimeArtifact.path) ||
    String(receipt.postRestoreRuntime?.sha256 || '').toLowerCase() !== postRestoreRuntimeArtifact.sha256 ||
    String(receipt.postRestoreRuntime?.valueSha256 || '').toLowerCase() !== sha256Json(postRestoreRuntime.value).toLowerCase() ||
    String(verification.currentRuntimeProofSha256 || '').toLowerCase() !== verifyRuntimeProofArtifact.sha256 ||
    String(verification.liveRuntimeValueSha256 || '').toLowerCase() !== sha256Json(liveBeforeAuditsRuntime.value).toLowerCase() ||
    String(verification.postAuditRuntimeValueSha256 || '').toLowerCase() !== sha256Json(liveAfterAuditsRuntime.value).toLowerCase() ||
    verification.runtimeProcessId !== verifyRuntime.validated.processId
  ) {
    fail('La cadena runtime del restore/verify de certificacion fue alterada.');
  }
  if (
    String(verification.audits?.agronomicMatrix?.sha256 || '').toLowerCase() !== agronomicArtifact.sha256 ||
    String(verification.audits?.lotIntegrity?.sha256 || '').toLowerCase() !== lotArtifact.sha256
  ) {
    fail('Los hashes de auditoria no coinciden con verification.json.');
  }
  const immediateFile = receipt.restoredInventory?.file;
  if (immediateFile !== 'target-inventory-after-restore.json') fail('El certificado no liga inventario inmediato.');
  const immediatePath = path.resolve(certificateDir, immediateFile);
  if (
    !fs.existsSync(immediatePath) ||
    sha256File(immediatePath).toLowerCase() !== String(receipt.restoredInventory.sha256 || '').toLowerCase()
  ) {
    fail('El inventario inmediato de certificacion fue alterado o falta.');
  }
  const immediate = normalizeInventory(readJson(immediatePath));
  const beforeAudits = normalizeInventory(readJson(beforeAuditsArtifact.path));
  const immediateCounts = inventoryCounts(immediate);
  const immediateExpectedComparison = compareInventories(immediate, immediate);
  const beforeAuditsComparison = compareInventories(immediate, beforeAudits);
  const afterAuditsComparison = compareInventories(immediate, inventory);
  const beforeVsAfterComparison = compareInventories(beforeAudits, inventory);
  if (
    immediate.schemaVersion !== 2 ||
    immediate.database !== certificationDatabase ||
    beforeAudits.schemaVersion !== 2 ||
    beforeAudits.database !== certificationDatabase ||
    text(receipt.targetMongoVersion, 'receipt.targetMongoVersion') !== immediate.serverVersion ||
    integer(receipt.restoredInventory.collections, 'receipt.restoredInventory.collections') !==
      immediateCounts.collections ||
    integer(receipt.restoredInventory.documents, 'receipt.restoredInventory.documents') !==
      immediateCounts.documents ||
    receipt.restoredInventory.certifiedComparison !== null
  ) {
    fail('El resumen del inventario inmediato o certifiedComparison del primer restore no coincide.');
  }
  if (
    !compareInventories(inventory, immediate).ok ||
    !compareInventories(inventory, beforeAudits).ok ||
    !compareInventories(immediate, beforeAudits).ok
  ) {
    fail('Inventarios inmediato, pre-auditoria y certificado final no coinciden exactamente.');
  }
  comparisonValue(
    comparisonFields(verification.inventory),
    'verification.inventory',
    afterAuditsComparison,
  );
  comparisonValue(
    verification.auditWindowInventory.immediate.expectedComparison,
    'verification.auditWindowInventory.immediate.expectedComparison',
    immediateExpectedComparison,
  );
  comparisonValue(
    verification.auditWindowInventory.beforeAudits.sourceComparison,
    'verification.auditWindowInventory.beforeAudits.sourceComparison',
    beforeAuditsComparison,
  );
  comparisonValue(
    verification.auditWindowInventory.afterAudits.sourceComparison,
    'verification.auditWindowInventory.afterAudits.sourceComparison',
    afterAuditsComparison,
  );
  comparisonValue(
    verification.auditWindowInventory.beforeVsAfter,
    'verification.auditWindowInventory.beforeVsAfter',
    beforeVsAfterComparison,
  );
  const auditWindowOk = immediateExpectedComparison.ok && beforeAuditsComparison.ok &&
    afterAuditsComparison.ok && beforeVsAfterComparison.ok;
  if (
    verification.inventory.file !== path.basename(inventoryArtifact.path) ||
    String(verification.auditWindowInventory?.immediate?.sha256 || '').toLowerCase() !==
      sha256File(immediatePath).toLowerCase() ||
    verification.auditWindowInventory.immediate.file !== path.basename(immediatePath) ||
    String(verification.auditWindowInventory?.beforeAudits?.sha256 || '').toLowerCase() !==
      beforeAuditsArtifact.sha256 ||
    verification.auditWindowInventory.beforeAudits.file !== path.basename(beforeAuditsArtifact.path) ||
    String(verification.auditWindowInventory.afterAudits.sha256 || '').toLowerCase() !==
      inventoryArtifact.sha256 ||
    verification.auditWindowInventory.afterAudits.file !== path.basename(inventoryArtifact.path) ||
    verification.auditWindowInventory.ok !== auditWindowOk ||
    auditWindowOk !== true
  ) {
    fail('verification.json no liga la ventana completa de inventarios certificados.');
  }
  return {
    drillId,
    certificationDatabase,
    inventory,
    inventoryPath: inventoryArtifact.path,
    certificateDir: path.resolve(certificateDir),
    sourcePointInTimeGuaranteed: value.sourceObservation.sourcePointInTimeGuaranteed,
    targetAttestationExpiresAt: targetAttestation.expiresAt,
    evidenceCapturePaths: evidenceValidated.captures.map((capture) => path.join(certificateDir, capture.file)),
  };
}

function validateCertificationCleanupReceipt(receipt, {
  certification,
  manifestPath,
  certificateDir,
} = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('cleanup receipt de certificacion invalido.');
  exactKeys(receipt, [
    'schemaVersion', 'kind', 'drillId', 'database', 'sourceManifestSha256',
    'targetAttestationSha256', 'infrastructureEvidenceSha256', 'restoreIntentSha256',
    'restoreReceiptSha256', 'originalTargetRuntimeProofSha256', 'freshRuntimeProofFile',
    'freshRuntimeProofSha256', 'liveRuntimeProofFile', 'liveRuntimeProofSha256',
    'runtimeProcessId', 'liveRuntimeValueSha256',
    'originalAttestationExpired', 'rescanFound', 'completedAt', 'status',
  ], 'cleanup receipt de certificacion');
  const intentPath = path.join(certificateDir, 'restore-intent.json');
  const restoreReceiptPath = path.join(certificateDir, 'restore-receipt.json');
  const freshRuntimeFile = text(receipt.freshRuntimeProofFile, 'freshRuntimeProofFile');
  const liveRuntimeFile = text(receipt.liveRuntimeProofFile, 'liveRuntimeProofFile');
  if (
    !/^target-runtime-proof-cleanup-[0-9a-f]{16}\.json$/i.test(freshRuntimeFile) ||
    !/^target-runtime-proof-live-cleanup-[0-9a-f]{16}\.json$/i.test(liveRuntimeFile)
  ) {
    fail('Nombres de pruebas runtime de cleanup invalidos.');
  }
  const freshRuntimePath = path.join(certificateDir, freshRuntimeFile);
  const liveRuntimePath = path.join(certificateDir, liveRuntimeFile);
  const completedAt = isoDate(receipt.completedAt, 'cleanup-receipt.completedAt');
  const certifiedAt = isoDate(certification.value.certifiedAt, 'certifiedAt');
  const targetAttestationExpiresAt = certification.validated.targetAttestationExpiresAt;
  if (!(targetAttestationExpiresAt instanceof Date) || !Number.isFinite(targetAttestationExpiresAt.getTime())) {
    fail('Falta expiracion validada de la atestacion target original.');
  }
  const expectedOriginalAttestationExpired = completedAt >= targetAttestationExpiresAt;
  if (completedAt < certifiedAt) fail('Cleanup de certificacion esta fechado antes del certificado.');
  for (const runtimePath of [freshRuntimePath, liveRuntimePath]) {
    if (!fs.existsSync(runtimePath) || !fs.statSync(runtimePath).isFile()) fail('Falta prueba runtime del cleanup certificado.');
  }
  const freshRuntimeSha256 = sha256File(freshRuntimePath).toLowerCase();
  const liveRuntimeSha256 = sha256File(liveRuntimePath).toLowerCase();
  const freshRuntimeValue = readJson(freshRuntimePath);
  const liveRuntimeValue = readJson(liveRuntimePath);
  const freshRuntime = validateRuntimeProof(freshRuntimeValue, {
    expectedDatabase: certification.validated.certificationDatabase,
    allowExpired: true,
    purpose: 'cleanup',
  });
  const liveRuntime = validateRuntimeProof(liveRuntimeValue, {
    expectedDatabase: certification.validated.certificationDatabase,
    allowExpired: true,
    purpose: 'cleanup',
  });
  if (
    receipt.schemaVersion !== 1 ||
    receipt.kind !== 'chaman-mongo-cleanup-receipt' ||
    receipt.status !== 'dropped' ||
    receipt.rescanFound !== false ||
    receipt.drillId !== certification.value.drillId ||
    receipt.database !== certification.validated.certificationDatabase ||
    String(receipt.sourceManifestSha256 || '').toLowerCase() !== sha256File(manifestPath).toLowerCase() ||
    String(receipt.restoreIntentSha256 || '').toLowerCase() !== sha256File(intentPath).toLowerCase() ||
    String(receipt.restoreReceiptSha256 || '').toLowerCase() !== sha256File(restoreReceiptPath).toLowerCase() ||
    String(receipt.targetAttestationSha256 || '').toLowerCase() !==
      certification.value.certificationTarget.targetAttestationSha256.toLowerCase() ||
    String(receipt.infrastructureEvidenceSha256 || '').toLowerCase() !==
      certification.value.certificationTarget.infrastructureEvidenceSha256.toLowerCase() ||
    String(receipt.originalTargetRuntimeProofSha256 || '').toLowerCase() !==
      certification.value.certificationTarget.targetRuntimeProofSha256.toLowerCase() ||
    String(receipt.freshRuntimeProofSha256 || '').toLowerCase() !== freshRuntimeSha256 ||
    !freshRuntimeSha256.startsWith(freshRuntimeFile.slice(-21, -5).toLowerCase()) ||
    String(receipt.liveRuntimeProofSha256 || '').toLowerCase() !== liveRuntimeSha256 ||
    !String(receipt.liveRuntimeValueSha256 || '').toLowerCase().startsWith(liveRuntimeFile.slice(-21, -5).toLowerCase()) ||
    String(receipt.liveRuntimeValueSha256 || '').toLowerCase() !== sha256Json(liveRuntimeValue).toLowerCase() ||
    receipt.runtimeProcessId !== freshRuntime.processId ||
    liveRuntime.processId !== freshRuntime.processId ||
    freshRuntime.schemaVersion !== 2 || liveRuntime.schemaVersion !== 2 ||
    freshRuntime.instanceId !== certification.value.certificationTarget.instanceId.toLowerCase() ||
    liveRuntime.instanceId !== freshRuntime.instanceId ||
    freshRuntime.endpointFingerprintSha256 !== certification.value.certificationTarget.endpointFingerprintSha256.toLowerCase() ||
    liveRuntime.endpointFingerprintSha256 !== freshRuntime.endpointFingerprintSha256 ||
    freshRuntime.replicaSet !== certification.value.certificationTarget.replicaSet ||
    liveRuntime.replicaSet !== freshRuntime.replicaSet ||
    freshRuntime.dbPathSha256 !== certification.value.certificationTarget.dbPathSha256.toLowerCase() ||
    liveRuntime.dbPathSha256 !== freshRuntime.dbPathSha256 ||
    receipt.originalAttestationExpired !== expectedOriginalAttestationExpired ||
    completedAt < freshRuntime.collectedAt ||
    completedAt < liveRuntime.collectedAt ||
    completedAt >= freshRuntime.expiresAt ||
    completedAt >= liveRuntime.expiresAt ||
    liveRuntime.collectedAt < freshRuntime.collectedAt
  ) {
    fail('Cleanup de la base de certificacion no coincide o no acredita drop + rescan.');
  }
  return true;
}

function loadArchiveCertification(filePath, manifestContext, { requireCleanup = true } = {}) {
  if (!filePath) fail('Falta --archive-certification.');
  const resolved = path.resolve(filePath);
  const certificateDir = path.dirname(resolved);
  verifyRestrictedDirectory(certificateDir);
  verifyRestrictedFile(resolved);
  const artifactNames = [
    'restore-intent.json', 'restore-receipt.json', 'verification.json',
    'target-runtime-proof-restore.json', 'target-runtime-proof-verify.json',
    'target-runtime-proof-live-after-restore.json',
    'target-runtime-proof-live-before-audits.json', 'target-runtime-proof-live-after-audits.json',
    'target-attestation.json', 'infrastructure-evidence.json', 'target-inventory-before.json',
    'target-inventory-after-restore.json', 'target-inventory-after-audits.json',
    'target-inventory-before-audits.json',
    'audit-restored-agronomic-data.json', 'audit-lote-data-integrity.json',
  ];
  for (const name of artifactNames) verifyRestrictedFile(path.join(certificateDir, name));
  const value = readJson(resolved);
  const validated = validateArchiveCertification(value, {
    certificateDir,
    manifest: manifestContext.manifest,
    manifestPath: manifestContext.manifestPath,
    manifestVerified: manifestContext.verified,
  });
  const loaded = { path: resolved, sha256: sha256File(resolved), value, validated };
  for (const capturePath of validated.evidenceCapturePaths) verifyRestrictedFile(capturePath);
  if (requireCleanup) {
    const cleanupPath = path.join(certificateDir, 'cleanup-receipt.json');
    verifyRestrictedFile(cleanupPath);
    const cleanupReceipt = readJson(cleanupPath);
    for (const file of [cleanupReceipt.freshRuntimeProofFile, cleanupReceipt.liveRuntimeProofFile]) {
      if (typeof file !== 'string' || path.basename(file) !== file) fail('Cleanup refiere prueba runtime invalida.');
      verifyRestrictedFile(path.join(certificateDir, file));
    }
    validateCertificationCleanupReceipt(cleanupReceipt, {
      certification: loaded,
      manifestPath: manifestContext.manifestPath,
      certificateDir,
    });
  }
  return loaded;
}

module.exports = {
  ARCHIVE_CERTIFICATION_KIND,
  ARCHIVE_CERTIFICATION_STABILITY_DELAY_SECONDS,
  buildArchiveCertification,
  loadArchiveCertification,
  validateCertificationCleanupReceipt,
  validateArchiveCertification,
};
