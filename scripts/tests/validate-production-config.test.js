const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const validator = path.join(__dirname, '..', 'validate-production-config.js');

function validClimaEnv(overrides = {}) {
  return {
    ...process.env,
    CHAMAN_SERVICE: 'sdc-api-clima',
    ENV: 'production',
    API_DATOS: 'http://chaman-datos.railway.internal:5003',
    SOIL_INTELLIGENCE_INTERNAL_TOKEN: 's'.repeat(32),
    AGROMETEO_INTERNAL_TOKEN: 'a'.repeat(32),
    OPEN_METEO_API_KEY: 'open-meteo-test-key-valid',
    OPEN_METEO_ARCHIVE_API_KEY: 'open-meteo-archive-test-key-valid',
    OPEN_METEO_ARCHIVE_BASE_URL:
      'https://customer-archive-api.open-meteo.com/v1',
    SWAGGER_ENABLED: 'false',
    CORS_ORIGINS: 'https://app.chamanagro.ar',
    GOOGLE_LOGIN_ENABLED: 'false',
    CHAMAN_RELEASE_VERSION: '2026.08.28-rc.1',
    CHAMAN_RELEASE_BUILT_AT: '2026-08-28T16:30:00.000Z',
    RAILWAY_GIT_COMMIT_SHA: '4bf3af39643406f91cd74d902a3f71770c7c01fc',
    ...overrides,
  };
}

function runValidator(overrides = {}) {
  const result = spawnSync(process.execPath, [validator], {
    env: validClimaEnv(overrides),
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout || ''}\n${result.stderr || ''}`,
  };
}

test('rechaza el placeholder documentado de OPEN_METEO_API_KEY', () => {
  const result = runValidator({
    OPEN_METEO_API_KEY: '<open-meteo-customer-api-key>',
  });

  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /OPEN_METEO_API_KEY tiene un valor placeholder angular/,
  );
});

test('rechaza cualquier placeholder angular en variables requeridas', () => {
  const result = runValidator({ API_DATOS: '<private-api-url>' });

  assert.equal(result.status, 1);
  assert.match(result.output, /API_DATOS tiene un valor placeholder angular/);
});

test('acepta una configuracion productiva sin placeholders', () => {
  const result = runValidator();

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Validacion productiva OK/);
});

test('rechaza archive customer sin una clave Professional separada', () => {
  const result = runValidator({
    OPEN_METEO_ARCHIVE_API_KEY: '',
    OPEN_METEO_ARCHIVE_BASE_URL:
      'https://customer-archive-api.open-meteo.com/v1',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /no coincide con la API key configurada/);
});

test('datos exige forecast comercial en produccion', () => {
  const result = runValidator({
    CHAMAN_SERVICE: 'sdc-datos',
    MONGO_URI: 'mongodb://mongo.railway.internal:27017/chaman',
    OPEN_METEO_API_KEY: '',
    OPEN_METEO_ARCHIVE_API_KEY: '',
    OPEN_METEO_FORECAST_BASE_URL: 'https://api.open-meteo.com/v1',
    OPEN_METEO_ARCHIVE_BASE_URL: 'https://archive-api.open-meteo.com/v1',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Falta variable requerida: OPEN_METEO_API_KEY/);
});

test('acepta Standard sin archive y deja trazada la cobertura de 92 dias', () => {
  const result = runValidator({
    OPEN_METEO_ARCHIVE_API_KEY: '',
    OPEN_METEO_ARCHIVE_BASE_URL: '',
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /hasta 92 dias de pasado/);
});

test('datos acepta forecast y archive customer con claves separadas', () => {
  const result = runValidator({
    CHAMAN_SERVICE: 'sdc-datos',
    MONGO_URI: 'mongodb://mongo.railway.internal:27017/chaman',
  });

  assert.equal(result.status, 0, result.output);
});

test('datos rechaza un host forecast falsificado', () => {
  const result = runValidator({
    CHAMAN_SERVICE: 'sdc-datos',
    MONGO_URI: 'mongodb://mongo.railway.internal:27017/chaman',
    OPEN_METEO_FORECAST_BASE_URL:
      'https://customer-api.open-meteo.com.attacker.example/v1',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /host oficial de Open-Meteo/);
});

test('rechaza Open-Meteo por HTTP aunque el hostname sea oficial', () => {
  const result = runValidator({
    OPEN_METEO_FORECAST_BASE_URL: 'http://customer-api.open-meteo.com/v1',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /debe usar HTTPS/);
});

test('rechaza un hostname que solo imita el sufijo de Open-Meteo', () => {
  const result = runValidator({
    OPEN_METEO_FORECAST_BASE_URL:
      'https://customer-api.open-meteo.com.attacker.example/v1',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /host oficial de Open-Meteo/);
});

test('rechaza clave comercial combinada con endpoint publico', () => {
  const result = runValidator({
    OPEN_METEO_FORECAST_BASE_URL: 'https://api.open-meteo.com/v1',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /no coincide con la API key configurada/);
});

test('rechaza mezclar el host archive en el endpoint forecast', () => {
  const result = runValidator({
    OPEN_METEO_FORECAST_BASE_URL:
      'https://customer-archive-api.open-meteo.com/v1',
    OPEN_METEO_ARCHIVE_API_KEY: 'archive-test-key',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /host oficial de Open-Meteo para forecast/);
});

test('lora exige token y direccion si activa el inventario ChirpStack', () => {
  const result = runValidator({
    CHAMAN_SERVICE: 'sdc-api-lora',
    API_DATOS: 'http://chaman-datos.railway.internal:5003',
    LORAWAN_MQTT_ENABLED: 'false',
    CHIRPSTACK_DEVICE_SYNC_ENABLED: 'true',
    CHIRPSTACK_GRPC_ADDRESS: '',
    CHIRPSTACK_API_TOKEN: '',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /falta CHIRPSTACK_GRPC_ADDRESS/);
  assert.match(result.output, /falta CHIRPSTACK_API_TOKEN/);
});

test('lora acepta inventario ChirpStack interno con token', () => {
  const result = runValidator({
    CHAMAN_SERVICE: 'sdc-api-lora',
    API_DATOS: 'http://chaman-datos.railway.internal:5003',
    LORAWAN_MQTT_ENABLED: 'false',
    CHIRPSTACK_DEVICE_SYNC_ENABLED: 'true',
    CHIRPSTACK_GRPC_ADDRESS: 'chirpstack-ns.railway.internal:8080',
    CHIRPSTACK_API_TOKEN: 'chirpstack-api-token-test',
    LORAWAN_CATALOG_INTERNAL_TOKEN: 'catalog-token-test',
  });

  assert.equal(result.status, 0, result.output);
});

test('datos exige fecha verificable para /version y acepta SOURCE_DATE_EPOCH', () => {
  const missing = runValidator({
    CHAMAN_SERVICE: 'sdc-datos',
    MONGO_URI: 'mongodb://mongo.railway.internal:27017/chaman',
    CHAMAN_RELEASE_BUILT_AT: '',
    SOURCE_DATE_EPOCH: '',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.output, /requiere CHAMAN_RELEASE_BUILT_AT o SOURCE_DATE_EPOCH/);

  const fallback = runValidator({
    CHAMAN_SERVICE: 'sdc-datos',
    MONGO_URI: 'mongodb://mongo.railway.internal:27017/chaman',
    CHAMAN_RELEASE_BUILT_AT: '',
    SOURCE_DATE_EPOCH: '1787934600',
  });
  assert.equal(fallback.status, 0, fallback.output);
});

test('meteo worker deshabilitado valida red privada sin exigir la clave CDS', () => {
  const result = runValidator({
    CHAMAN_SERVICE: 'sdc-meteo-worker',
    API_DATOS: 'http://chaman-datos.railway.internal:5000',
    REDIS_HOST: 'redis.railway.internal',
    CHAMAN_METEO_INTERNAL_TOKEN: 'm'.repeat(32),
    CHAMAN_METEO_ENABLED: 'true',
    CHAMAN_METEO_IMPORT_ENABLED: 'false',
    CDS_API_KEY: '',
  });

  assert.equal(result.status, 0, result.output);
});

test('meteo worker activo exige CDS y rechaza variables de reparación persistentes', () => {
  const result = runValidator({
    CHAMAN_SERVICE: 'sdc-meteo-worker',
    API_DATOS: 'http://chaman-datos.railway.internal:5000',
    REDIS_HOST: 'redis.railway.internal',
    CHAMAN_METEO_INTERNAL_TOKEN: 'm'.repeat(32),
    CHAMAN_METEO_ENABLED: 'true',
    CHAMAN_METEO_IMPORT_ENABLED: 'true',
    CDS_API_KEY: '',
    CHAMAN_METEO_REPAIR_FROM: '2026-01-01',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /falta CDS_API_KEY/);
  assert.match(result.output, /CHAMAN_METEO_REPAIR_FROM debe estar ausente/);
});
