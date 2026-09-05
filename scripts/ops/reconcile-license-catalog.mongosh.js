/*
 * Consolida copias identicas de planes en un catalogo reutilizable.
 *
 * Por defecto SOLO PREVISUALIZA. Para aplicar se requieren ambas variables:
 *   CHAMAN_LICENSE_CATALOG_APPLY=true
 *   CHAMAN_LICENSE_CATALOG_PLAN_HASH=<hash impreso por la previsualizacion>
 *
 * Ejecutar solamente despues de un mongodump verificado del ambiente objetivo.
 */

const run = async () => {
const databaseName = String(
  process.env.CHAMAN_LICENSE_CATALOG_DB || 'chaman',
).trim();
if (!['chaman', 'chaman_testing'].includes(databaseName)) {
  throw new Error(`Base no autorizada para reconciliar licencias: ${databaseName}`);
}
const database = db.getSiblingDB(databaseName);
const now = new Date();
const apply = process.env.CHAMAN_LICENSE_CATALOG_APPLY === 'true';
const expectedHash = String(
  process.env.CHAMAN_LICENSE_CATALOG_PLAN_HASH || '',
).trim();
const crypto = require('crypto');

const id = (value) => (value == null ? '' : String(value));
const sortedObject = (value) =>
  Object.fromEntries(
    Object.entries(value || {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
const normalizedDefinition = (license) => ({
  modeloFacturacion: license.modeloFacturacion || 'sin_cargo',
  modoLimite: license.modoLimite || 'informativo',
  maxUsuarios: license.maxUsuarios ?? null,
  maxDistribuidores:
    license.maxDistribuidores ?? license.maxdDistribuidores ?? null,
  maxProductores: license.maxProductores ?? null,
  maxEstablecimientos: license.maxEstablecimientos ?? null,
  maxLotes: license.maxLotes ?? null,
  maxHectareas: license.maxHectareas ?? license.maxdHectareas ?? null,
  modulos: sortedObject(license.modulos),
});
const definitionKey = (license) => JSON.stringify(normalizedDefinition(license));
const isCurrent = (assignment) => {
  if (
    assignment.estado &&
    !['activa', 'gracia', 'programada'].includes(String(assignment.estado))
  ) {
    return false;
  }
  const start = assignment.fechaInicio || assignment.fechaCreacion;
  if (start && new Date(start).getTime() > now.getTime()) return false;
  return !(
    assignment.fechaExpiracion &&
    new Date(assignment.fechaExpiracion).getTime() < now.getTime()
  );
};
const planIdentity = (definition) => {
  const integral =
    definition.modulos?.Riego === true ||
    definition.modulos?.['Huella Hídrica'] === true;
  if (
    definition.maxDistribuidores === 10 &&
    definition.maxProductores === 50 &&
    definition.maxEstablecimientos === 100 &&
    definition.maxLotes === 500
  ) {
    return { codigo: 'gratis_empresa', nombre: 'Plan Empresa', default: false };
  }
  if (
    definition.maxProductores === 25 &&
    definition.maxEstablecimientos === 50 &&
    definition.maxLotes === 250
  ) {
    return integral
      ? { codigo: 'gratis_red_integral', nombre: 'Plan Red Integral', default: false }
      : { codigo: 'gratis_red', nombre: 'Plan Red', default: false };
  }
  if (
    definition.maxDistribuidores === 1 &&
    definition.maxProductores === 1 &&
    definition.maxEstablecimientos === 1 &&
    definition.maxLotes === 1 &&
    definition.maxHectareas === 10000
  ) {
    return { codigo: 'gratis_individual', nombre: 'Plan Individual', default: true };
  }
  throw new Error(
    `Perfil de licencia desconocido; no se consolida: ${JSON.stringify(definition)}`,
  );
};

const licenses = await (await database.licencias.find({})).toArray();
const assignments = await (await database.licenciaporentidads.find({})).toArray();
const assignedByLicense = new Map();
for (const assignment of assignments) {
  const key = id(assignment.idLicencia);
  assignedByLicense.set(key, [...(assignedByLicense.get(key) || []), assignment]);
}

const grouped = new Map();
for (const license of licenses) {
  const key = definitionKey(license);
  grouped.set(key, [...(grouped.get(key) || []), license]);
}

const groups = [...grouped.entries()]
  .map(([key, candidates]) => {
    const ranked = [...candidates].sort((left, right) => {
      const leftCurrent = (assignedByLicense.get(id(left._id)) || []).some(isCurrent);
      const rightCurrent = (assignedByLicense.get(id(right._id)) || []).some(isCurrent);
      if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
      return id(left._id).localeCompare(id(right._id));
    });
    const canonical = ranked[0];
    const duplicates = ranked.slice(1);
    const definition = JSON.parse(key);
    return {
      definition,
      identity: planIdentity(definition),
      canonicalId: id(canonical._id),
      duplicateIds: duplicates.map((item) => id(item._id)),
      assignmentsToRepoint: assignments.filter((assignment) =>
        duplicates.some(
          (duplicate) => id(duplicate._id) === id(assignment.idLicencia),
        ),
      ).length,
    };
  })
  .sort((left, right) => left.identity.codigo.localeCompare(right.identity.codigo));

const identityCodes = groups.map((group) => group.identity.codigo);
if (new Set(identityCodes).size !== identityCodes.length) {
  throw new Error(
    `Mas de un perfil produce la misma identidad comercial: ${identityCodes.join(', ')}`,
  );
}

const plan = {
  database: database.getName(),
  sourceLicenseCount: licenses.length,
  targetLicenseCount: groups.length,
  duplicateLicensesToRemove: groups.reduce(
    (total, group) => total + group.duplicateIds.length,
    0,
  ),
  assignmentsToRepoint: groups.reduce(
    (total, group) => total + group.assignmentsToRepoint,
    0,
  ),
  plans: groups.map((group) => ({
    ...group.identity,
    canonicalId: group.canonicalId,
    duplicates: group.duplicateIds.length,
    assignmentsToRepoint: group.assignmentsToRepoint,
    limits: group.definition,
  })),
};
const planHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(plan))
  .digest('hex');

print(EJSON.stringify({ mode: apply ? 'apply' : 'preview', planHash, plan }, null, 2));

if (!apply) return;
if (!expectedHash || expectedHash !== planHash) {
  throw new Error(
    `Plan hash invalido. Esperado ${planHash}; recibido ${expectedHash || '(vacio)'}`,
  );
}
const currentLicenses = await (await database.licencias.find({})).toArray();
const currentAssignments = await (await database.licenciaporentidads.find({})).toArray();
if (EJSON.stringify(currentLicenses) !== EJSON.stringify(licenses) ||
    EJSON.stringify(currentAssignments) !== EJSON.stringify(assignments)) {
  throw new Error('El catalogo cambio despues de generar el plan');
}

const reconciliationId = new ObjectId();
const backupCollection = database.license_catalog_reconciliation_backups;
const originalLicenseIds = licenses.map((license) => license._id);
const originalAssignmentIds = assignments.map((assignment) => assignment._id);
let backupPrepared = false;

const restoreOriginalDocuments = async () => {
  for (const license of licenses) {
    await database.licencias.replaceOne(
      { _id: license._id },
      license,
      { upsert: true },
    );
  }
  for (const assignment of assignments) {
    await database.licenciaporentidads.replaceOne(
      { _id: assignment._id },
      assignment,
      { upsert: true },
    );
  }
};

try {
  await backupCollection.insertOne({
    _id: reconciliationId,
    kind: 'license-catalog-reconciliation-backup',
    status: 'prepared',
    database: database.getName(),
    planHash,
    createdAt: now,
    sourceLicenseCount: licenses.length,
    sourceAssignmentCount: assignments.length,
    licenses,
    assignments,
  });
  backupPrepared = true;

  for (const group of groups) {
    const definition = group.definition;
    const identity = group.identity;
    const updateResult = await database.licencias.updateOne(
      { _id: ObjectId(group.canonicalId) },
      {
        $set: {
          ...definition,
          maxdDistribuidores: definition.maxDistribuidores,
          maxdHectareas: definition.maxHectareas,
          ...identity,
          version: 1,
          estado: 'activo',
          origen: 'sistema',
          motivoCreacion: 'Catalogo consolidado desde planes legacy equivalentes',
        },
      },
    );
    if (updateResult.matchedCount !== 1) {
      throw new Error(`No se encontro el plan canonico ${group.canonicalId}`);
    }
    if (group.duplicateIds.length) {
      const repointed = await database.licenciaporentidads.updateMany(
        { idLicencia: { $in: group.duplicateIds.map((value) => ObjectId(value)) } },
        { $set: { idLicencia: ObjectId(group.canonicalId) } },
      );
      if (repointed.matchedCount !== group.assignmentsToRepoint) {
        throw new Error('Las asignaciones cambiaron durante la consolidacion');
      }
      await database.licencias.deleteMany({
        _id: { $in: group.duplicateIds.map((value) => ObjectId(value)) },
      });
    }
  }

  // La consolidacion no modifica estados, fechas ni condiciones de contratos.
  const finalCount = await database.licencias.countDocuments({});
  if (finalCount !== plan.targetLicenseCount) {
    throw new Error(
      `Conteo final inesperado: ${finalCount}; esperado ${plan.targetLicenseCount}`,
    );
  }
  const finalAssignments = await (await database.licenciaporentidads.find({})).toArray();
  if (finalAssignments.length !== assignments.length) {
    throw new Error(
      `Conteo de asignaciones inesperado: ${finalAssignments.length}; esperado ${assignments.length}`,
    );
  }
  const finalAssignmentIds = new Set(
    finalAssignments.map((assignment) => id(assignment._id)),
  );
  if (originalAssignmentIds.some((assignmentId) => !finalAssignmentIds.has(id(assignmentId)))) {
    throw new Error('La reconciliacion perdio una o mas asignaciones originales');
  }
  for (const original of assignments) {
    const current = finalAssignments.find((item) => id(item._id) === id(original._id));
    const { idLicencia: previousPlan, ...previousContract } = original;
    const { idLicencia: currentPlan, ...currentContract } = current;
    if (EJSON.stringify(previousContract) !== EJSON.stringify(currentContract)) {
      throw new Error('Se alteraron condiciones de una asignacion durante la consolidacion');
    }
  }
  const finalLicenseIds = new Set(
    (await (await database.licencias.find({}, { _id: 1 })).toArray()).map((license) => id(license._id)),
  );
  const expectedCanonicalIds = new Set(groups.map((group) => group.canonicalId));
  if (
    finalLicenseIds.size !== expectedCanonicalIds.size ||
    [...finalLicenseIds].some((licenseId) => !expectedCanonicalIds.has(licenseId))
  ) {
    throw new Error('El catalogo final no coincide con los planes canonicos aprobados');
  }
  const orphanAssignments = finalAssignments.filter(
    (assignment) => !finalLicenseIds.has(id(assignment.idLicencia)),
  );
  if (orphanAssignments.length) {
    throw new Error(
      `La reconciliacion dejo ${orphanAssignments.length} asignaciones huerfanas`,
    );
  }

  await backupCollection.updateOne(
    { _id: reconciliationId },
    {
      $set: {
        status: 'applied',
        completedAt: new Date(),
        finalLicenseCount: finalCount,
        finalAssignmentCount: finalAssignments.length,
      },
    },
  );
  print(EJSON.stringify({
    applied: true,
    reconciliationId,
    planHash,
    finalLicenseCount: finalCount,
    finalAssignmentCount: finalAssignments.length,
    orphanAssignments: 0,
  }, null, 2));
} catch (error) {
  if (backupPrepared) {
    try {
      await restoreOriginalDocuments();
      const restoredLicenseCount = await database.licencias.countDocuments({
        _id: { $in: originalLicenseIds },
      });
      const restoredAssignmentCount = await database.licenciaporentidads.countDocuments({
        _id: { $in: originalAssignmentIds },
      });
      if (
        restoredLicenseCount !== licenses.length ||
        restoredAssignmentCount !== assignments.length
      ) {
        throw new Error(
          `Rollback incompleto: licencias ${restoredLicenseCount}/${licenses.length}; asignaciones ${restoredAssignmentCount}/${assignments.length}`,
        );
      }
      await backupCollection.updateOne(
        { _id: reconciliationId },
        {
          $set: {
            status: 'rolled_back',
            rolledBackAt: new Date(),
            error: String(error?.message || error),
          },
        },
      );
    } catch (rollbackError) {
      throw new Error(
        `Fallo la reconciliacion (${error?.message || error}) y tambien el rollback (${rollbackError?.message || rollbackError})`,
      );
    }
  }
  throw error;
}
};
run().catch((error) => { print(String(error?.message || error)); quit(1); });
