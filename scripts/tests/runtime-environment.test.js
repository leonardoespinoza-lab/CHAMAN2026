const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
  productionValidationArgs,
  resolveRuntimeEnvironment,
} = require("../runtime-environment");

test("Railway es la autoridad del entorno de deployment", () => {
  assert.equal(
    resolveRuntimeEnvironment({
      RAILWAY_ENVIRONMENT_NAME: "testing",
      ENV: "production",
      NODE_ENV: "production",
    }),
    "testing",
  );
  assert.equal(
    resolveRuntimeEnvironment({
      RAILWAY_ENVIRONMENT_NAME: "  PrOdUcTiOn  ",
      ENV: "test",
      NODE_ENV: "test",
    }),
    "production",
  );
});

test("fuera de Railway conserva fallback ENV y luego NODE_ENV", () => {
  assert.equal(
    resolveRuntimeEnvironment({ ENV: "test", NODE_ENV: "production" }),
    "test",
  );
  assert.equal(
    resolveRuntimeEnvironment({ NODE_ENV: "  Production " }),
    "production",
  );
  assert.equal(resolveRuntimeEnvironment({}), "");
});

test("railway:start pasa el nombre canonico al validator y su alias se ejecuta", () => {
  const args = productionValidationArgs("sdc-api-clima");
  assert.deepEqual(args, [
    "scripts/validate-production-config.js",
    "sdc-api-clima",
  ]);

  const env = {
    ...process.env,
    ENV: "production",
    API_DATOS: "http://chaman-datos.railway.internal:5003",
    SOIL_INTELLIGENCE_INTERNAL_TOKEN: "s".repeat(32),
    AGROMETEO_INTERNAL_TOKEN: "a".repeat(32),
    OPEN_METEO_API_KEY: "open-meteo-test-key-valid",
    OPEN_METEO_ARCHIVE_API_KEY: "open-meteo-archive-test-key-valid",
    OPEN_METEO_FORECAST_BASE_URL: "https://customer-api.open-meteo.com/v1",
    OPEN_METEO_ARCHIVE_BASE_URL:
      "https://customer-archive-api.open-meteo.com/v1",
    SWAGGER_ENABLED: "false",
    CORS_ORIGINS: "https://app.chamanagro.ar",
    GOOGLE_LOGIN_ENABLED: "false",
  };
  delete env.CHAMAN_SERVICE;
  delete env.SERVICE;

  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, "../.."),
    env,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /Validacion productiva OK/);
});
