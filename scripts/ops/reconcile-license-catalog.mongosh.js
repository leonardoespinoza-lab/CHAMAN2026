/*
 * Consolida copias identicas de planes en un catalogo reutilizable.
 *
 * Por defecto SOLO PREVISUALIZA. Para aplicar se requieren ambas variables:
 *   CHAMAN_LICENSE_CATALOG_APPLY=true
 *   CHAMAN_LICENSE_CATALOG_PLAN_HASH=<hash impreso por la previsualizacion>
 *
 * Ejecutar solamente despues de un mongodump verificado del ambiente objetivo.
 */

const database = db.getSiblingDB('chaman');
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
    return { codigo: 'gratis_empresa', nombre: 'Gratis Empresa', default: false };
  }
  if (
    definition.maxProductores === 25 &&
    definition.maxEstablecimientos === 50 &&
    definition.maxLotes === 250
  ) {
    return integral
      ? { codigo: 'gratis_red_integral', nombre: 'Gratis Red Integral', default: false }
      : { codigo: 'gratis_red', nombre: 'Gratis Red', default: false };
  }
  if (
    definition.maxDistribuidores === 1 &&
    definition.maxProductores === 1 &&
    definition.maxEstablecimientos === 1 &&
    definition.maxLotes === 1 &&
    definition.maxHectareas === 10000
  ) {
    return { codigo: 'gratis_individual', nombre: 'Gratis Individual', default: true };
  }
  throw new Error(
    `Perfil de licencia desconocido; no se consolida: ${JSON.stringify(definition)}`,
  );
};

const licenses = database.licencias.find({}).toArray();
const assignments = database.licenciaporentidads.find({}).toArray();
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

if (!apply) quit(0);
if (!expectedHash || expectedHash !== planHash) {
  throw new Error(
    `Plan hash invalido. Esperado ${planHash}; recibido ${expectedHash || '(vacio)'}`,
  );
}
if (licenses.length !== plan.sourceLicenseCount) {
  throw new Error('El catalogo cambio despues de generar el plan');
}

const session = db.getMongo().startSession();
try {
  session.startTransaction();
  const tx = session.getDatabase(database.getName());
  for (const group of groups) {
    const definition = group.definition;
    const identity = group.identity;
    const updateResult = tx.licencias.updateOne(
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
      tx.licenciaporentidads.updateMany(
        { idLicencia: { $in: group.duplicateIds.map((value) => ObjectId(value)) } },
        { $set: { idLicencia: ObjectId(group.canonicalId) } },
      );
      tx.licencias.deleteMany({
        _id: { $in: group.duplicateIds.map((value) => ObjectId(value)) },
      });
    }
  }

  tx.licenciaporentidads.updateMany(
    {
      fechaExpiracion: { $lt: now },
      $or: [{ estado: { $exists: false } }, { estado: null }],
    },
    {
      $set: {
        estado: 'vencida',
        fechaActualizacion: now,
        origen: 'sistema',
      },
    },
  );

  const finalCount = tx.licencias.countDocuments({});
  if (finalCount !== plan.targetLicenseCount) {
    throw new Error(
      `Conteo final inesperado: ${finalCount}; esperado ${plan.targetLicenseCount}`,
    );
  }
  session.commitTransaction();
  print(EJSON.stringify({ applied: true, planHash, finalLicenseCount: finalCount }, null, 2));
} catch (error) {
  session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
