const fs = require('node:fs');
const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} debe ser un objeto.`);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in value));
  if (extras.length || missing.length) {
    fail(`${label} invalido; extras=[${extras.join(',')}], faltantes=[${missing.join(',')}].`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`Falta ${label}.`);
  return value.trim();
}

function uuid(value, label) {
  const result = text(value, label).toLowerCase();
  if (!UUID.test(result)) fail(`${label} debe ser UUID.`);
  return result;
}

function hashes(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} debe contener al menos un fingerprint.`);
  const result = [...new Set(value.map((item) => text(item, label).toLowerCase()))].sort();
  if (result.some((item) => !SHA256.test(item))) fail(`${label} contiene un SHA-256 invalido.`);
  return result;
}

function asset(value, label) {
  exactKeys(
    value,
    ['environmentId', 'serviceId', 'volumeId', 'networkIdentityId', 'endpointFingerprintsSha256'],
    label,
  );
  return {
    environmentId: uuid(value.environmentId, `${label}.environmentId`),
    serviceId: uuid(value.serviceId, `${label}.serviceId`),
    volumeId: uuid(value.volumeId, `${label}.volumeId`),
    networkIdentityId: uuid(value.networkIdentityId, `${label}.networkIdentityId`),
    endpointFingerprintsSha256: hashes(
      value.endpointFingerprintsSha256,
      `${label}.endpointFingerprintsSha256`,
    ),
  };
}

function parseDate(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(`${label} debe ser ISO-8601.`);
  return date;
}

function validateInfrastructureEvidence(value, { now = new Date() } = {}) {
  exactKeys(
    value,
    [
      'schemaVersion',
      'kind',
      'evidenceId',
      'collection',
      'collectedAt',
      'expiresAt',
      'source',
      'target',
      'assertions',
      'collector',
      'reviewedBy',
    ],
    'evidencia de infraestructura',
  );
  if (value.schemaVersion !== 1 || value.kind !== 'chaman-railway-mongo-isolation-evidence') {
    fail('Formato de evidencia de infraestructura no soportado.');
  }
  const evidenceId = text(value.evidenceId, 'evidenceId');
  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(evidenceId)) fail('evidenceId invalido.');
  exactKeys(value.collection, ['method', 'projectId', 'readOnly'], 'collection');
  if (value.collection.method !== 'railway-read-only-api' || value.collection.readOnly !== true) {
    fail('La evidencia debe provenir del canal railway-read-only-api.');
  }
  const projectId = uuid(value.collection.projectId, 'collection.projectId');
  const collectedAt = parseDate(value.collectedAt, 'collectedAt');
  const expiresAt = parseDate(value.expiresAt, 'expiresAt');
  if (expiresAt <= collectedAt || expiresAt - collectedAt > 4 * 60 * 60 * 1000 || now >= expiresAt) {
    fail('La evidencia de infraestructura esta vencida o excede cuatro horas.');
  }
  const source = asset(value.source, 'source');
  const target = asset(value.target, 'target');
  exactKeys(
    value.assertions,
    [
      'distinctEnvironment',
      'distinctService',
      'distinctVolume',
      'distinctNetworkIdentity',
      'targetHasNoProductionConsumers',
    ],
    'assertions',
  );
  for (const [key, assertion] of Object.entries(value.assertions)) {
    if (assertion !== true) fail(`assertions.${key} debe ser true.`);
  }
  const equalities = [
    ['environmentId', 'environment'],
    ['serviceId', 'servicio'],
    ['volumeId', 'volumen'],
    ['networkIdentityId', 'identidad de red'],
  ];
  for (const [key, label] of equalities) {
    if (source[key] === target[key]) fail(`Origen y destino comparten ${label} Railway.`);
  }
  const sourceEndpoints = new Set(source.endpointFingerprintsSha256);
  if (target.endpointFingerprintsSha256.some((hash) => sourceEndpoints.has(hash))) {
    fail('Un alias de endpoint aparece tanto en Produccion como en recovery.');
  }
  requiredDistinctReviewer(value.collector, value.reviewedBy);
  return { evidenceId, projectId, collectedAt, expiresAt, source, target };
}

function requiredDistinctReviewer(collectorValue, reviewerValue) {
  const collector = text(collectorValue, 'collector');
  const reviewer = text(reviewerValue, 'reviewedBy');
  if (collector.toLowerCase() === reviewer.toLowerCase()) {
    fail('collector y reviewedBy deben ser personas distintas.');
  }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadInfrastructureEvidence(filePath, options) {
  if (!filePath) fail('Falta --infrastructure-evidence.');
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Evidencia de infraestructura invalida: ${error.message}`);
  }
  return {
    path: filePath,
    sha256: sha256File(filePath),
    value,
    validated: validateInfrastructureEvidence(value, options),
  };
}

function bindAttestationToEvidence(attestation, validatedAttestation, evidence, side) {
  if (attestation.infrastructureEvidenceSha256 !== evidence.sha256) {
    fail('La atestacion no esta ligada al SHA-256 de la evidencia de infraestructura.');
  }
  const assetValue = evidence.validated[side];
  const identity = validatedAttestation.instanceIdentity;
  if (identity.provider !== 'railway' || identity.instanceId.toLowerCase() !== assetValue.serviceId) {
    fail(`La identidad atestada de ${side} no coincide con el servicio Railway comprobado.`);
  }
  if (!assetValue.endpointFingerprintsSha256.includes(identity.endpointFingerprintSha256)) {
    fail(`El endpoint runtime de ${side} no figura en la evidencia Railway.`);
  }
}

module.exports = {
  bindAttestationToEvidence,
  loadInfrastructureEvidence,
  validateInfrastructureEvidence,
};
