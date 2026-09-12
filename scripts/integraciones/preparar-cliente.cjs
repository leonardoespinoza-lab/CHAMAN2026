"use strict";
// Offline preparation only. No deployment, DB access or HTTP calls.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

function prepare(config, directory) {
  const environment = config?.environment ?? "testing";
  if (!["testing", "production"].includes(environment))
    throw Error("Entorno invalido: testing o production.");
  const fields = ["productores", "establecimientos", "lotes"];
  if (
    (environment === "production" || config.limits !== undefined) &&
    (!config.limits ||
      typeof config.limits !== "object" ||
      Array.isArray(config.limits) ||
      Object.keys(config.limits).length !== fields.length ||
      fields.some(
        (k) =>
          !Number.isInteger(config.limits[k]) ||
          config.limits[k] < 0 ||
          config.limits[k] > 100000,
      ))
  )
    throw Error(
      "Limites invalidos: indicar productores, establecimientos y lotes (0 a 100000).",
    );
  if (
    (environment === "production" || config.maxSowingAgeDays !== undefined) &&
    (!Number.isInteger(config.maxSowingAgeDays) ||
      config.maxSowingAgeDays < 1 ||
      config.maxSowingAgeDays > 366)
  )
    throw Error("Antiguedad maxima de siembra invalida (1 a 366 dias).");
  if (
    !config ||
    !/^[a-z0-9_-]{3,50}$/.test(config.id) ||
    typeof config.name !== "string" ||
    !config.name.trim() ||
    !/^[a-f0-9]{24}$/.test(config.advisorUserId)
  )
    throw Error("ID, nombre e ID real del asesor son obligatorios.");
  if (!Number.isInteger(config.permissionIndex) || config.permissionIndex < 0)
    throw Error("Indice de permiso invalido.");
  const scopes = [
    "estructura:leer",
    "estructura:crear",
    "catalogos:leer",
    "fenologia:leer",
  ];
  if (
    !Array.isArray(config.scopes) ||
    !config.scopes.length ||
    config.scopes.some((scope) => !scopes.includes(scope))
  )
    throw Error("Permisos invalidos.");
  const expires = Date.parse(config.expiresAt);
  if (
    !Number.isFinite(expires) ||
    expires <= Date.now() ||
    expires > Date.now() + 366 * 86400000
  )
    throw Error("Vencimiento futuro requerido, hasta 366 dias.");
  if (
    !Number.isInteger(config.requestsPerMinute) ||
    config.requestsPerMinute < 1 ||
    config.requestsPerMinute > 600
  )
    throw Error("Cupo invalido.");
  const output = fs.realpathSync(directory);
  if (!fs.statSync(output).isDirectory())
    throw Error(
      "El destino debe ser una carpeta privada existente fuera de Git.",
    );
  const git = spawnSync("git", ["-C", output, "rev-parse", "--show-toplevel"], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (git.error || git.status === 0)
    throw Error(
      "No guardar credenciales dentro de Git; comprobar Git y elegir otra carpeta.",
    );
  const keyId = `k_${crypto.randomBytes(12).toString("hex")}`;
  const credential = `chm_${environment === "production" ? "live" : "test"}_${keyId}.${crypto.randomBytes(32).toString("base64url")}`;
  const client = {
    id: config.id,
    name: config.name.trim(),
    environment,
    ...(config.limits ? { limits: { ...config.limits } } : {}),
    ...(config.maxSowingAgeDays !== undefined
      ? { maxSowingAgeDays: config.maxSowingAgeDays }
      : {}),
    advisorUserId: config.advisorUserId,
    permissionIndex: config.permissionIndex,
    enabled: true,
    scopes: [...new Set(config.scopes)],
    expiresAt: new Date(expires).toISOString(),
    requestsPerMinute: config.requestsPerMinute,
    keys: [
      {
        id: keyId,
        sha256: crypto.createHash("sha256").update(credential).digest("hex"),
        expiresAt: new Date(expires).toISOString(),
      },
    ],
  };
  const secretPath = path.join(output, `${config.id}-${keyId}.apikey`);
  const registryPath = path.join(output, `${config.id}-${keyId}.server.json`);
  fs.writeFileSync(secretPath, credential + "\n", { flag: "wx", mode: 0o600 });
  fs.writeFileSync(registryPath, JSON.stringify(client, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return {
    integration: config.id,
    environment,
    secretPath,
    registryPath,
    expiresAt: client.expiresAt,
    status: "prepared_offline_not_activated",
  };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 4)
      throw Error(
        "Uso: node preparar-cliente.cjs configuracion-sin-clave.json carpeta-privada-existente",
      );
    const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    console.log(JSON.stringify(prepare(config, process.argv[3]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { prepare };
