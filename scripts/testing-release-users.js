#!/usr/bin/env node

/**
 * Identidades efimeras y reversibles para la certificacion de Testing.
 * Nunca opera fuera de chaman_testing y nunca modifica usuarios existentes.
 */

const bcrypt = require("../sdc-auth/node_modules/bcrypt");
const { MongoClient } = require("../sdc-datos/node_modules/mongodb");
const {
  DB_NAME,
  PREFIX,
  cleanupTestingReleaseUsers,
} = require("./testing-release-users-cleanup");


function mongoUrl() {
  return (
    process.env.MONGO_PUBLIC_URL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI
  );
}

function assertTesting(db, url) {
  if (db.databaseName !== DB_NAME || /production|chaman_prod/i.test(String(url))) {
    throw new Error("Operacion rechazada: solo se permite chaman_testing.");
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));

async function permissionTemplate(db, level, role) {
  const users = await db
    .collection("usuarios")
    .find({ activo: true, permisos: { $elemMatch: { nivel: level, rol: role } } })
    .toArray();
  for (const user of users) {
    const permission = (user.permisos || []).find(
      (item) => item.nivel === level && item.rol === role,
    );
    if (permission) return clone(permission);
  }
  throw new Error(`No existe plantilla activa ${level}:${role} en Testing.`);
}

async function cleanup(db) {
  return cleanupTestingReleaseUsers(db);
}

async function apply(db) {
  const password = process.env.TESTING_RELEASE_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("TESTING_RELEASE_PASSWORD debe tener al menos 12 caracteres.");
  }

  await cleanup(db);
  const allModules = {
    Enfermedades: true,
    Riego: true,
    HuellaHidrica: true,
    NDVI: true,
    Clima: true,
    EtapasFenologicas: true,
    Sensores: true,
    Camaras: true,
    Malezas: true,
    FrioTermica: true,
    Fertilizacion: true,
    Fumigacion: true,
    Certificados: true,
  };
  const activeLots = await db
    .collection("lotes")
    .find({ idSiembra: { $exists: true, $ne: null } })
    .toArray();
  const producerPermissions = [];
  const producerIds = new Set();
  for (const lot of activeLots) {
    const idProductor = lot.idProductor && String(lot.idProductor);
    if (!idProductor || producerIds.has(idProductor)) continue;
    producerIds.add(idProductor);
    producerPermissions.push({
      nivel: "Productor",
      rol: "Admin",
      idProductor: lot.idProductor,
      idDistribuidor: lot.idDistribuidor || null,
      idQuimica: lot.idQuimica || null,
      modulos: allModules,
    });
  }
  const templates = [
    { slug: "admin", permiso: { nivel: "Admin", rol: "Admin" } },
    { slug: "todos-productores", permisos: producerPermissions },
    ...producerPermissions.map((permiso) => ({
      slug: `productor-${String(permiso.idProductor)}`,
      permiso,
    })),
    {
      slug: "productor-admin",
      permiso: await permissionTemplate(db, "Productor", "Admin"),
    },
    {
      slug: "establecimiento-lectura",
      permiso: await permissionTemplate(db, "Establecimiento", "Lectura"),
    },
    {
      slug: "distribuidor-admin",
      permiso: await permissionTemplate(db, "Distribuidor", "Admin"),
    },
    {
      slug: "quimica-admin",
      permiso: await permissionTemplate(db, "Quimica", "Admin"),
    },
  ];
  const hash = await bcrypt.hash(password, 10);
  const now = new Date();
  const documents = templates.map(({ slug, permiso, permisos }) => {
    const username = `${PREFIX}${slug}@chaman.local`;
    return {
      username,
      email: username,
      activo: true,
      fechaCreacion: now,
      hash,
      datosPersonales: {
        nombre: `Certificacion temporal ${slug}`,
        email: username,
      },
      permisos: permisos || [permiso],
      metadata: { temporal: true, purpose: "testing-release-certification" },
    };
  });
  await db.collection("usuarios").insertMany(documents, { ordered: true });
  return documents.map((document) => ({
    username: document.username,
    permisos: document.permisos.map((item) => `${item.nivel}:${item.rol}`),
  }));
}

(async () => {
  const url = mongoUrl();
  if (!url) throw new Error("No se encontro URL de MongoDB.");
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || DB_NAME);
    assertTesting(db, url);
    if (process.argv.includes("--cleanup")) {
      console.log(JSON.stringify({ removed: await cleanup(db) }, null, 2));
      return;
    }
    if (!process.argv.includes("--apply")) {
      console.log(
        JSON.stringify(
          {
            mode: "plan",
            database: DB_NAME,
            identities: [
              "Admin:Admin",
              "Productor:Admin",
              "Establecimiento:Lectura",
              "Distribuidor:Admin",
              "Quimica:Admin",
            ],
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(JSON.stringify({ created: await apply(db) }, null, 2));
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
