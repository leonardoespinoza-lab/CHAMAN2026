const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPlan,
  identity,
  resolveDbUrl,
} = require("../migrations/20260716-notification-eventkey-outbox");

function notification(id, user, eventKey, date) {
  return {
    _id: id,
    fechaCreacion: date,
    tenant: { idUsuario: user },
    data: { eventKey },
  };
}

test("promueve solo la notificacion mas antigua por usuario y evento", () => {
  const plan = buildPlan([
    notification("nueva", "u1", "evento-1", "2026-07-16T12:00:00Z"),
    notification("vieja", "u1", "evento-1", "2026-07-16T10:00:00Z"),
  ]);

  assert.deepEqual(plan.updates, [
    { _id: "vieja", idUsuario: "u1", eventKey: "evento-1" },
  ]);
  assert.deepEqual(plan.duplicates, ["nueva"]);
});

test("preserva todas las filas legacy cuando ya existe una canonica", () => {
  const key = identity("u1", "evento-1");
  const plan = buildPlan(
    [
      notification("legacy-1", "u1", "evento-1", "2026-07-16T10:00:00Z"),
      notification("legacy-2", "u1", "evento-1", "2026-07-16T12:00:00Z"),
    ],
    new Set([key]),
  );

  assert.equal(plan.updates.length, 0);
  assert.deepEqual(plan.duplicates, ["legacy-1", "legacy-2"]);
});

test("la identidad separa usuarios aunque compartan eventKey", () => {
  const plan = buildPlan([
    notification("u1-evento", "u1", "evento-1", "2026-07-16T10:00:00Z"),
    notification("u2-evento", "u2", "evento-1", "2026-07-16T10:00:00Z"),
  ]);

  assert.equal(plan.groups, 2);
  assert.equal(plan.updates.length, 2);
  assert.equal(plan.duplicates.length, 0);
});

test("omite claves vacias, demasiado largas o sin usuario", () => {
  const plan = buildPlan([
    notification("sin-user", "", "evento", "2026-07-16T10:00:00Z"),
    notification("sin-evento", "u1", "", "2026-07-16T10:00:00Z"),
    notification("larga", "u1", "x".repeat(513), "2026-07-16T10:00:00Z"),
  ]);

  assert.deepEqual(plan.invalid, ["sin-user", "sin-evento", "larga"]);
  assert.equal(plan.updates.length, 0);
});

test("resuelve las variables de conexion sin incorporar credenciales por defecto", () => {
  assert.equal(resolveDbUrl({ MONGO_URI: "mongodb://uri" }), "mongodb://uri");
  assert.equal(resolveDbUrl({ MONGO_URL: "mongodb://url" }), "mongodb://url");
  assert.equal(resolveDbUrl({}), "");
});
