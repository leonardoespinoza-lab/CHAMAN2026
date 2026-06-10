const path = require('path');

const mongoose = require(path.join(
  __dirname,
  '..',
  'sdc-datos',
  'node_modules',
  'mongoose',
));
const bcrypt = require(path.join(
  __dirname,
  '..',
  'sdc-auth',
  'node_modules',
  'bcrypt',
));

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chaman';
const ADMIN_USERNAME =
  (process.env.ADMIN_USERNAME || 'admin@chaman.local').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Chaman2026!';

async function main() {
  await mongoose.connect(MONGO_URI);

  const db = mongoose.connection.db;
  const usuarios = db.collection('usuarios');
  const clients = db.collection('clients');

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const now = new Date();

  const usuario = {
    activo: true,
    fechaCreacion: now,
    username: ADMIN_USERNAME,
    email: ADMIN_USERNAME,
    hash,
    permisos: [{ nivel: 'Admin', rol: 'Admin' }],
    datosPersonales: {
      nombre: 'Admin Local CHAMAN2026',
      email: ADMIN_USERNAME,
    },
  };

  await usuarios.updateOne(
    { username: ADMIN_USERNAME },
    { $set: usuario },
    { upsert: true },
  );

  await clients.updateOne(
    { id: '1', clientSecret: '1' },
    {
      $set: {
        id: '1',
        clientSecret: '1',
        grants: ['password', 'refresh_token'],
        redirectUris: [],
        accessTokenLifetime: 3600 * 10,
        refreshTokenLifetime: 3600 * 100,
      },
    },
    { upsert: true },
  );

  console.log('Admin local listo');
  console.log('Cliente OAuth local listo');
  console.log(`Usuario: ${ADMIN_USERNAME}`);
  console.log(`Clave: ${ADMIN_PASSWORD}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
