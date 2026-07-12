const path = require('path');
const { MongoClient } = require(path.join(
  __dirname,
  '..',
  'sdc-datos',
  'node_modules',
  'mongodb',
));

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
const DB_NAME = process.env.DB_NAME || 'chaman_testing';
const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const TESTING_PASSWORD_HASH =
  '$2b$10$mVFAD8N3OW.PmN9MxGEOG.FQIjmVuHrzDWl1OVH4Gb4CG45AHhtTu';

async function main() {
  if (process.env.CHAMAN_TESTING_BOOTSTRAP !== 'true') {
    throw new Error('seed-testing-admin.js solo puede ejecutarse con CHAMAN_TESTING_BOOTSTRAP=true.');
  }
  if (!MONGO_URI || !username) {
    throw new Error('Faltan MONGO_URI o ADMIN_USERNAME para el admin de testing.');
  }

  const client = await MongoClient.connect(MONGO_URI);
  try {
    const db = client.db(DB_NAME);
    const now = new Date();
    await db.collection('usuarios').updateOne(
      { username },
      {
        $set: {
          activo: true,
          fechaCreacion: now,
          username,
          email: username,
          hash: TESTING_PASSWORD_HASH,
          permisos: [{ nivel: 'Admin', rol: 'Admin' }],
          datosPersonales: { nombre: 'Admin Testing CHAMAN2026', email: username },
        },
      },
      { upsert: true },
    );
    await db.collection('clients').updateOne(
      { id: '1', clientSecret: '1' },
      {
        $set: {
          id: '1',
          clientSecret: '1',
          grants: ['password', 'refresh_token'],
          redirectUris: [],
          accessTokenLifetime: 36000,
          refreshTokenLifetime: 360000,
        },
      },
      { upsert: true },
    );
    console.log(`[testing-bootstrap] Admin temporal listo: ${username}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('[testing-bootstrap] No se pudo crear admin temporal:', error);
  process.exit(1);
});
