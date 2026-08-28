const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { verifyRestrictedDirectory, verifyRestrictedFile } = require('./secure-config');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const EVIDENCE_KIND = 'chaman-mongo-infrastructure-evidence';
const TESTING_LOCAL_MODE = 'testing-local-drill';
const PRODUCTION_MODE = 'production-disposable';

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

function hash(value, label) {
  const result = text(value, label).toLowerCase();
  if (!SHA256.test(result)) fail(`${label} debe ser SHA-256.`);
  return result;
}

function parseDate(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(`${label} debe ser ISO-8601.`);
  return date;
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256Json(value) {
  return sha256Buffer(`${JSON.stringify(canonical(value))}\n`);
}

function unwrapList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.edges)) return value.edges.map((entry) => entry?.node || entry).filter(Boolean);
  if (Array.isArray(value.nodes)) return value.nodes;
  return [];
}

function idAndName(value, label) {
  if (!value || typeof value !== 'object') fail(`${label} no existe en railway status --json.`);
  return {
    id: uuid(value.id || value.environmentId || value.serviceId || value.volumeId, `${label}.id`),
    name: text(value.name || value.environmentName || value.serviceName || value.volumeName, `${label}.name`),
  };
}

function projectFromStatus(raw) {
  const candidate = raw?.project && typeof raw.project === 'object' ? raw.project : raw;
  const project = idAndName(candidate, 'project');
  const environments = unwrapList(candidate.environments || raw?.environments);
  if (!environments.length && raw?.environment && typeof raw.environment === 'object') {
    environments.push(raw.environment);
  }
  if (!environments.length && raw?.environmentId && raw?.environmentName) {
    environments.push({
      id: raw.environmentId,
      name: raw.environmentName,
      services: raw.services,
      serviceInstances: raw.serviceInstances,
      volumes: raw.volumes,
      volumeInstances: raw.volumeInstances,
    });
  }
  if (!environments.length) fail('railway status --json no contiene environments reconocibles.');
  return { project, environments };
}

function resolveOne(items, selector, label, mapper = idAndName) {
  const normalizedSelector = text(selector, `${label} selector`).toLowerCase();
  const mapped = items.map((item, index) => ({ raw: item, normalized: mapper(item, `${label}[${index}]`) }));
  const matches = mapped.filter(({ normalized }) =>
    normalized.id.toLowerCase() === normalizedSelector || normalized.name.toLowerCase() === normalizedSelector,
  );
  if (matches.length !== 1) fail(`El selector ${label} debe resolver exactamente un nodo; encontro ${matches.length}.`);
  return matches[0];
}

function normalizeService(item, label) {
  const service = item?.service && typeof item.service === 'object' ? item.service : item;
  return idAndName({
    id: item?.serviceId || item?.service_id || service.id,
    name: item?.serviceName || item?.service_name || service.name,
  }, label);
}

function normalizeVolume(item, label) {
  const volume = item?.volume && typeof item.volume === 'object' ? item.volume : item;
  const normalized = idAndName({
    id: volume.id || item?.volumeId,
    name: volume.name || item?.volumeName || 'volume',
  }, label);
  const serviceId = item?.serviceId || item?.service_id || item?.service?.id ||
    volume?.serviceId || volume?.service_id || volume?.service?.id || null;
  return { ...normalized, serviceId: serviceId ? uuid(serviceId, `${label}.serviceId`) : null };
}

function deriveRailwayAsset(raw, selectors) {
  const { project, environments } = projectFromStatus(raw);
  if (selectors.projectId && uuid(selectors.projectId, 'selector.projectId') !== project.id) {
    fail('El projectId solicitado no coincide con la captura cruda de Railway.');
  }
  const environment = resolveOne(environments, selectors.environment, 'environment');
  const environmentRaw = environment.raw;
  const serviceItems = unwrapList(
    environmentRaw.services || environmentRaw.serviceInstances || environmentRaw.service_instances,
  );
  if (!serviceItems.length) fail('El environment seleccionado no contiene services reconocibles.');
  const service = resolveOne(serviceItems, selectors.service, 'service', normalizeService);
  const volumeItems = unwrapList(
    environmentRaw.volumes || environmentRaw.volumeInstances || environmentRaw.volume_instances,
  );
  const normalizedVolumes = volumeItems.map((item, index) => normalizeVolume(item, `volume[${index}]`));
  const linkedVolumes = normalizedVolumes.filter((item) => item.serviceId === service.normalized.id);
  if (linkedVolumes.length !== 1) {
    fail(`El servicio Mongo seleccionado debe resolver exactamente un volumen; encontro ${linkedVolumes.length}.`);
  }
  const graph = {
    projectId: project.id,
    environmentId: environment.normalized.id,
    environmentName: environment.normalized.name,
    serviceId: service.normalized.id,
    serviceName: service.normalized.name,
    volumeIds: [linkedVolumes[0].id],
  };
  return { ...graph, graphSha256: sha256Json(graph) };
}

function validateRawCapture(capture, baseDir, label, projectId) {
  exactKeys(capture, ['environmentSelector', 'file', 'sha256', 'commandSha256'], label);
  const environmentSelector = text(capture.environmentSelector, `${label}.environmentSelector`);
  const file = text(capture.file, `${label}.file`);
  if (path.basename(file) !== file) fail(`${label}.file debe ser un nombre simple.`);
  const rawPath = path.resolve(baseDir, file);
  const relative = path.relative(path.resolve(baseDir), rawPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`${label}.file sale del directorio de evidencia.`);
  if (!fs.existsSync(rawPath) || !fs.statSync(rawPath).isFile()) fail(`Falta captura cruda ${file}.`);
  const expectedHash = hash(capture.sha256, `${label}.sha256`);
  if (sha256File(rawPath).toLowerCase() !== expectedHash) fail(`Checksum invalido para ${file}.`);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  } catch (error) {
    fail(`Captura Railway ${file} no es JSON valido: ${error.message}`);
  }
  const commandSha256 = hash(capture.commandSha256, `${label}.commandSha256`);
  const expectedCommandSha256 = sha256Buffer(`${JSON.stringify([
    'railway', 'status', '--project', projectId, '--environment', environmentSelector, '--json',
  ])}\n`);
  if (commandSha256 !== expectedCommandSha256) {
    fail(`${label}.commandSha256 no corresponde al comando Railway esperado.`);
  }
  return {
    environmentSelector,
    commandSha256,
    file,
    sha256: expectedHash,
    raw,
  };
}

function validateRailwayAsset(value, rawCapture, projectId, label) {
  exactKeys(
    value,
    ['provider', 'environmentId', 'environmentName', 'serviceId', 'serviceName', 'volumeIds', 'graphSha256'],
    label,
  );
  if (value.provider !== 'railway') fail(`${label}.provider debe ser railway.`);
  if (!Array.isArray(value.volumeIds)) fail(`${label}.volumeIds debe ser una lista.`);
  const stored = {
    projectId,
    environmentId: uuid(value.environmentId, `${label}.environmentId`),
    environmentName: text(value.environmentName, `${label}.environmentName`),
    serviceId: uuid(value.serviceId, `${label}.serviceId`),
    serviceName: text(value.serviceName, `${label}.serviceName`),
    volumeIds: [...new Set(value.volumeIds.map((item) => uuid(item, `${label}.volumeIds`)))].sort(),
  };
  if (stored.volumeIds.length !== 1) fail(`${label}.volumeIds debe contener exactamente un volumen.`);
  const derived = deriveRailwayAsset(rawCapture.raw, {
    projectId,
    environment: stored.environmentId,
    service: stored.serviceId,
  });
  for (const key of ['environmentId', 'environmentName', 'serviceId', 'serviceName']) {
    if (String(stored[key]).toLowerCase() !== String(derived[key]).toLowerCase()) {
      fail(`${label}.${key} no coincide con la captura cruda Railway.`);
    }
  }
  if (JSON.stringify(stored.volumeIds) !== JSON.stringify(derived.volumeIds)) {
    fail(`${label}.volumeIds no coincide con la captura cruda Railway.`);
  }
  const graphSha256 = hash(value.graphSha256, `${label}.graphSha256`);
  if (graphSha256 !== derived.graphSha256) fail(`${label}.graphSha256 no coincide con el grafo derivado.`);
  return { provider: 'railway', ...derived };
}

function validateLocalTarget(value, label) {
  exactKeys(
    value,
    ['provider', 'instanceId', 'endpointFingerprintSha256', 'runtimeProofSha256', 'replicaSet', 'dbPathSha256'],
    label,
  );
  if (value.provider !== 'local-mongodb') fail(`${label}.provider debe ser local-mongodb.`);
  const instanceId = text(value.instanceId, `${label}.instanceId`);
  if (!/^local-mongodb:[0-9a-f]{64}$/i.test(instanceId)) fail(`${label}.instanceId invalido.`);
  return {
    provider: 'local-mongodb',
    instanceId: instanceId.toLowerCase(),
    endpointFingerprintSha256: hash(value.endpointFingerprintSha256, `${label}.endpointFingerprintSha256`),
    runtimeProofSha256: hash(value.runtimeProofSha256, `${label}.runtimeProofSha256`),
    replicaSet: text(value.replicaSet, `${label}.replicaSet`),
    dbPathSha256: hash(value.dbPathSha256, `${label}.dbPathSha256`),
  };
}

function validateInfrastructureEvidence(value, {
  now = new Date(),
  baseDir = process.cwd(),
  allowExpired = false,
} = {}) {
  exactKeys(
    value,
    [
      'schemaVersion', 'kind', 'evidenceId', 'drillMode', 'collection', 'collectedAt', 'expiresAt',
      'source', 'target', 'collector', 'reviewedBy',
    ],
    'evidencia de infraestructura',
  );
  if (value.schemaVersion !== 2 || value.kind !== EVIDENCE_KIND) {
    fail('Formato de evidencia de infraestructura no soportado; debe generarse con el collector v2.');
  }
  const evidenceId = text(value.evidenceId, 'evidenceId');
  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(evidenceId)) fail('evidenceId invalido.');
  const drillMode = text(value.drillMode, 'drillMode');
  if (![TESTING_LOCAL_MODE, PRODUCTION_MODE].includes(drillMode)) fail('drillMode invalido.');
  exactKeys(value.collection, ['method', 'projectId', 'railwayCliVersion', 'readOnly', 'rawCaptures'], 'collection');
  if (value.collection.method !== 'railway-cli-status-json' || value.collection.readOnly !== true) {
    fail('La evidencia debe provenir de railway status --json en modo lectura.');
  }
  const projectId = uuid(value.collection.projectId, 'collection.projectId');
  text(value.collection.railwayCliVersion, 'collection.railwayCliVersion');
  if (!Array.isArray(value.collection.rawCaptures) || value.collection.rawCaptures.length < 1) {
    fail('collection.rawCaptures debe contener capturas crudas.');
  }
  const captures = value.collection.rawCaptures.map((capture, index) =>
    validateRawCapture(capture, baseDir, `collection.rawCaptures[${index}]`, projectId),
  );
  const expectedCaptures = drillMode === TESTING_LOCAL_MODE ? 1 : 2;
  if (captures.length !== expectedCaptures || new Set(captures.map((capture) => capture.file)).size !== captures.length) {
    fail(`El modo ${drillMode} exige ${expectedCaptures} captura(s) Railway distinta(s).`);
  }
  const collectedAt = parseDate(value.collectedAt, 'collectedAt');
  const expiresAt = parseDate(value.expiresAt, 'expiresAt');
  if (expiresAt <= collectedAt || expiresAt - collectedAt > 4 * 60 * 60 * 1000) {
    fail('La evidencia de infraestructura excede cuatro horas o tiene fechas invalidas.');
  }
  if (now < collectedAt) fail('La evidencia de infraestructura esta fechada en el futuro.');
  if (!allowExpired && now >= expiresAt) fail('La evidencia de infraestructura esta vencida.');
  const sourceCapture = captures.find((capture) =>
    capture.environmentSelector.toLowerCase() === String(value.source.environmentName || '').toLowerCase() ||
    capture.environmentSelector.toLowerCase() === String(value.source.environmentId || '').toLowerCase(),
  );
  if (!sourceCapture) fail('No existe captura cruda Railway para source.');
  const source = validateRailwayAsset(value.source, sourceCapture, projectId, 'source');
  let target;
  if (drillMode === TESTING_LOCAL_MODE) {
    target = validateLocalTarget(value.target, 'target');
    if (source.environmentName.toLowerCase() !== 'testing') {
      fail('testing-local-drill exige que source se derive del environment Testing.');
    }
  } else {
    const targetCapture = captures.find((capture) =>
      capture.environmentSelector.toLowerCase() === String(value.target.environmentName || '').toLowerCase() ||
      capture.environmentSelector.toLowerCase() === String(value.target.environmentId || '').toLowerCase(),
    );
    if (!targetCapture) fail('No existe captura cruda Railway para target.');
    target = validateRailwayAsset(value.target, targetCapture, projectId, 'target');
    for (const key of ['environmentId', 'serviceId']) {
      if (source[key] === target[key]) fail(`Origen y destino comparten ${key} Railway.`);
    }
    if (source.volumeIds.some((item) => target.volumeIds.includes(item))) fail('Origen y destino comparten volumen Railway.');
  }
  requiredDistinctReviewer(value.collector, value.reviewedBy);
  return { evidenceId, drillMode, projectId, collectedAt, expiresAt, source, target, captures };
}

function requiredDistinctReviewer(collectorValue, reviewerValue) {
  const collector = text(collectorValue, 'collector');
  const reviewer = text(reviewerValue, 'reviewedBy');
  if (collector.toLowerCase() === reviewer.toLowerCase()) fail('collector y reviewedBy deben ser personas distintas.');
}

function loadInfrastructureEvidence(filePath, options = {}) {
  if (!filePath) fail('Falta --infrastructure-evidence.');
  const resolved = path.resolve(filePath);
  verifyRestrictedDirectory(path.dirname(resolved));
  verifyRestrictedFile(resolved);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    fail(`Evidencia de infraestructura invalida: ${error.message}`);
  }
  const validated = validateInfrastructureEvidence(value, { ...options, baseDir: path.dirname(resolved) });
  for (const capture of validated.captures) verifyRestrictedFile(path.join(path.dirname(resolved), capture.file));
  return {
    path: resolved,
    sha256: sha256File(resolved),
    value,
    validated,
  };
}

function bindAttestationToEvidence(attestation, validatedAttestation, evidence, side) {
  if (String(attestation.infrastructureEvidenceSha256 || '').toLowerCase() !== evidence.sha256.toLowerCase()) {
    fail('La atestacion no esta ligada al SHA-256 de la evidencia de infraestructura.');
  }
  if (validatedAttestation.drillMode !== evidence.validated.drillMode) {
    fail('drillMode de la atestacion no coincide con la evidencia.');
  }
  const assetValue = evidence.validated[side];
  const identity = validatedAttestation.instanceIdentity;
  if (identity.provider !== assetValue.provider) fail(`Proveedor atestado de ${side} no coincide.`);
  if (side === 'source') {
    if (identity.instanceId.toLowerCase() !== assetValue.serviceId) {
      fail('La identidad source no coincide con el servicio derivado de Railway.');
    }
  } else {
    const expectedInstance = assetValue.provider === 'railway' ? assetValue.serviceId : assetValue.instanceId;
    if (identity.instanceId.toLowerCase() !== expectedInstance) {
      fail('La identidad target no coincide con la infraestructura sellada.');
    }
  }
}

module.exports = {
  EVIDENCE_KIND,
  PRODUCTION_MODE,
  TESTING_LOCAL_MODE,
  bindAttestationToEvidence,
  deriveRailwayAsset,
  loadInfrastructureEvidence,
  sha256File,
  sha256Json,
  validateInfrastructureEvidence,
};
