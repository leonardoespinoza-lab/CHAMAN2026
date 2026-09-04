/*
 * Auditoria estrictamente de solo lectura para licencias y alcance de asesores.
 * Se ejecuta con mongosh contra una copia o una base indicada explicitamente.
 */

const database = db.getSiblingDB('chaman');
const now = new Date();

const licenses = database.licencias.find({}).toArray();
const assignments = database.licenciaporentidads.find({}).toArray();
const users = database.usuarios
  .find({}, { permisos: 1, activo: 1, archivado: 1, creadoPorUsuario: 1 })
  .toArray();
const producers = database.productors
  .find({}, { idAsesorPropietario: 1 })
  .toArray();
const establishments = database.establecimientos
  .find({}, { idAsesorPropietario: 1 })
  .toArray();
const lots = database.lotes
  .find({}, { idAsesorPropietario: 1 })
  .toArray();
const licenseEntities = {
  Quimica: database.quimicas.find({}, { _id: 1 }).toArray(),
  Distribuidor: database.distribuidors.find({}, { _id: 1 }).toArray(),
  Productor: database.productors.find({}, { _id: 1 }).toArray(),
  Establecimiento: database.establecimientos.find({}, { _id: 1 }).toArray(),
  Asesor: users.filter((user) =>
    (user.permisos || []).some((permission) => permission.nivel === 'Asesor'),
  ),
  Usuario: users.filter(
    (user) =>
      !(user.permisos || []).some((permission) => permission.nivel === 'Asesor'),
  ),
};

const id = (value) => (value === undefined || value === null ? '' : String(value));
const normalized = (value) => String(value || '').trim().toLowerCase();
const increment = (target, key) => {
  const normalizedKey = key || '(sin valor)';
  target[normalizedKey] = (target[normalizedKey] || 0) + 1;
};
const grouped = (items, selector) => {
  const result = {};
  for (const item of items) increment(result, selector(item));
  return result;
};
const sortedObject = (value) =>
  Object.fromEntries(
    Object.entries(value || {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
const licenseDefinitionKey = (license) =>
  JSON.stringify({
    nombre: normalized(license.nombre),
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
    default: license.default === true,
  });
const groupDetails = (items, selector) => {
  const map = new Map();
  for (const item of items) {
    const key = selector(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return [...map.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      ids: group.map((item) => id(item._id)),
    }))
    .sort((left, right) => right.count - left.count);
};
const assignmentIsCurrent = (assignment) => {
  const state = assignment.estado;
  if (
    state &&
    !['activa', 'gracia', 'programada'].includes(String(state))
  ) {
    return false;
  }
  const start = assignment.fechaInicio || assignment.fechaCreacion;
  if (start && new Date(start).getTime() > now.getTime()) return false;
  if (
    assignment.fechaExpiracion &&
    new Date(assignment.fechaExpiracion).getTime() < now.getTime()
  ) {
    return false;
  }
  return true;
};
const entityTypeById = new Map();
for (const [type, entities] of Object.entries(licenseEntities)) {
  for (const entity of entities) {
    const entityId = id(entity._id);
    const previous = entityTypeById.get(entityId) || [];
    entityTypeById.set(entityId, [...previous, type]);
  }
}
const inferredEntityType = (assignment) => {
  if (assignment.tipoEntidad) return assignment.tipoEntidad;
  const matches = entityTypeById.get(id(assignment.idEntidad)) || [];
  return matches.length === 1 ? matches[0] : matches.length ? matches.join('|') : 'Desconocida';
};
const definitionSummary = (() => {
  const byDefinition = new Map();
  for (const license of licenses) {
    const key = licenseDefinitionKey(license);
    const current = byDefinition.get(key) || {
      key,
      licenses: [],
      assignments: [],
    };
    current.licenses.push(license);
    byDefinition.set(key, current);
  }
  for (const assignment of assignments) {
    const license = licenses.find(
      (candidate) => id(candidate._id) === id(assignment.idLicencia),
    );
    if (!license) continue;
    byDefinition.get(licenseDefinitionKey(license)).assignments.push(assignment);
  }
  return [...byDefinition.values()]
    .map((group) => ({
      key: group.key,
      licenseCount: group.licenses.length,
      assignmentCount: group.assignments.length,
      currentAssignmentCount: group.assignments.filter(assignmentIsCurrent).length,
      assignmentTypes: grouped(group.assignments, inferredEntityType),
    }))
    .sort((left, right) => right.licenseCount - left.licenseCount);
})();
const expiryBucket = (assignment) => {
  if (!assignment.fechaExpiracion) return 'sin_vencimiento';
  const expiry = new Date(assignment.fechaExpiracion).getTime();
  if (Number.isNaN(expiry)) return 'vencimiento_invalido';
  return expiry < now.getTime() ? 'vencida' : 'vigente_por_fecha';
};

const licenseIds = new Set(licenses.map((license) => id(license._id)));
const referencedLicenseIds = new Set(
  assignments.map((assignment) => id(assignment.idLicencia)).filter(Boolean),
);
const assignmentHistoryByEntity = groupDetails(
  assignments.filter((assignment) => assignment.idEntidad),
  (assignment) => id(assignment.idEntidad),
);
const currentAssignments = assignments.filter(assignmentIsCurrent);
const multipleCurrentByEntity = groupDetails(
  currentAssignments.filter((assignment) => assignment.idEntidad),
  (assignment) => id(assignment.idEntidad),
);

const advisorPermissions = [];
for (const user of users) {
  for (const permission of user.permisos || []) {
    if (permission.nivel !== 'Asesor') continue;
    advisorPermissions.push({
      userId: id(user._id),
      active: user.activo !== false && user.archivado !== true,
      role: permission.rol,
      advisorId: id(permission.idAsesor),
      producerIds: (permission.idProductores || []).map(id).filter(Boolean),
      establishmentIds: (permission.idEstablecimientos || [])
        .map(id)
        .filter(Boolean),
      lotIds: (permission.idLotes || []).map(id).filter(Boolean),
    });
  }
}

const owners = (items) =>
  items.filter((item) => item.idAsesorPropietario).map((item) => id(item.idAsesorPropietario));
const advisorOwnerIds = new Set([
  ...owners(producers),
  ...owners(establishments),
  ...owners(lots),
]);
const declaredAdvisorIds = new Set(
  advisorPermissions.map((permission) => permission.advisorId).filter(Boolean),
);

const report = {
  auditedAt: now.toISOString(),
  database: database.getName(),
  readOnly: true,
  licenses: {
    total: licenses.length,
    byName: grouped(licenses, (license) => normalized(license.nombre)),
    byState: grouped(licenses, (license) => license.estado),
    byOrigin: grouped(licenses, (license) => license.origen),
    defaults: licenses
      .filter((license) => license.default === true)
      .map((license) => ({ id: id(license._id), nombre: license.nombre })),
    duplicateDefinitions: groupDetails(licenses, licenseDefinitionKey),
    definitionSummary,
    duplicateCodeVersions: groupDetails(
      licenses.filter((license) => license.codigo),
      (license) => `${normalized(license.codigo)}|${license.version || 1}`,
    ),
    unassigned: licenses
      .filter((license) => !referencedLicenseIds.has(id(license._id)))
      .map((license) => ({
        id: id(license._id),
        nombre: license.nombre,
        origen: license.origen,
        estado: license.estado,
      })),
  },
  assignments: {
    total: assignments.length,
    current: currentAssignments.length,
    byEntityType: grouped(assignments, (assignment) => assignment.tipoEntidad),
    byInferredEntityType: grouped(assignments, inferredEntityType),
    byState: grouped(assignments, (assignment) => assignment.estado),
    byOrigin: grouped(assignments, (assignment) => assignment.origen),
    byExpiry: grouped(assignments, expiryBucket),
    expirationRange: {
      oldest: assignments
        .map((assignment) => assignment.fechaExpiracion)
        .filter(Boolean)
        .sort()[0] || null,
      newest: assignments
        .map((assignment) => assignment.fechaExpiracion)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null,
    },
    currentByInferredEntityType: grouped(currentAssignments, inferredEntityType),
    currentByLicenseDefinition: grouped(currentAssignments, (assignment) => {
      const license = licenses.find(
        (candidate) => id(candidate._id) === id(assignment.idLicencia),
      );
      return license ? licenseDefinitionKey(license) : 'licencia_no_encontrada';
    }),
    missingEntity: assignments.filter((assignment) => !assignment.idEntidad).length,
    missingLicense: assignments.filter((assignment) => !assignment.idLicencia).length,
    orphanLicenseReference: assignments
      .filter(
        (assignment) =>
          assignment.idLicencia && !licenseIds.has(id(assignment.idLicencia)),
      )
      .map((assignment) => id(assignment._id)),
    entitiesWithHistory: assignmentHistoryByEntity.length,
    entitiesWithMultipleCurrent: multipleCurrentByEntity,
  },
  advisors: {
    usersWithAdvisorPermission: new Set(
      advisorPermissions.map((permission) => permission.userId),
    ).size,
    activeUsersWithAdvisorPermission: new Set(
      advisorPermissions
        .filter((permission) => permission.active)
        .map((permission) => permission.userId),
    ).size,
    permissionRoles: grouped(advisorPermissions, (permission) => permission.role),
    missingAdvisorIdentity: advisorPermissions.filter(
      (permission) => !permission.advisorId,
    ).length,
    withExplicitProducerLists: advisorPermissions.filter(
      (permission) => permission.producerIds.length > 0,
    ).length,
    withExplicitEstablishmentLists: advisorPermissions.filter(
      (permission) => permission.establishmentIds.length > 0,
    ).length,
    withExplicitLotLists: advisorPermissions.filter(
      (permission) => permission.lotIds.length > 0,
    ).length,
    distinctDeclaredAdvisorIds: declaredAdvisorIds.size,
    distinctOwnerAdvisorIds: advisorOwnerIds.size,
    ownerAdvisorIdsWithoutLoginPermission: [...advisorOwnerIds].filter(
      (ownerId) => !declaredAdvisorIds.has(ownerId),
    ).length,
    ownedEntities: {
      producers: owners(producers).length,
      establishments: owners(establishments).length,
      lots: owners(lots).length,
    },
  },
};

print(EJSON.stringify(report, null, 2));
