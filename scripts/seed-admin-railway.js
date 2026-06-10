const { MongoClient } = require('../sdc-datos/node_modules/mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'chaman';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin@chaman.local').toLowerCase();
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!MONGO_URI) {
  throw new Error('MONGO_URI es requerido para sembrar admin en Railway.');
}

if (!ADMIN_PASSWORD_HASH) {
  throw new Error('ADMIN_PASSWORD_HASH es requerido. Generar hash bcrypt fuera del contenedor.');
}

async function main() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db(DB_NAME);
  const now = new Date();

  await db.collection('usuarios').updateOne(
    { username: ADMIN_USERNAME },
    {
      $set: {
        activo: true,
        fechaCreacion: now,
        username: ADMIN_USERNAME,
        email: ADMIN_USERNAME,
        hash: ADMIN_PASSWORD_HASH,
        permisos: [{ nivel: 'Admin', rol: 'Admin' }],
        datosPersonales: {
          nombre: 'Admin CHAMAN2026',
          email: ADMIN_USERNAME,
        },
      },
    },
    { upsert: true },
  );

  await client.close();
  console.log('Admin Railway listo');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
