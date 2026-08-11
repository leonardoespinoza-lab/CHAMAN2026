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

test('datos exige forecast y archive comerciales en produccion', () => {
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
  assert.match(
    result.output,
    /Falta variable requerida: OPEN_METEO_ARCHIVE_API_KEY/,
  );
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
    OPEN_METEO_FORECAST_BASE_URL:
      'http://customer-api.open-meteo.com/v1',
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
