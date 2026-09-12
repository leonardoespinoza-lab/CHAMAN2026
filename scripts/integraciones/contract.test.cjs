"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { prepare } = require("./preparar-cliente.cjs");
const { queryPhenology } = require("./consultar-fenologia.cjs");
const docDir = path.resolve(__dirname, "../../docs/integraciones/v1");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(docDir, name), "utf8"));

test("OpenAPI references resolve and no endpoint in Postman is invented", () => {
  const doc = read("openapi.json");
  assert.equal(doc.openapi, "3.0.3");
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.$ref)
      assert.ok(
        value.$ref
          .slice(2)
          .split("/")
          .reduce((v, key) => v?.[key], doc),
        value.$ref,
      );
    Object.values(value).forEach(visit);
  };
  visit(doc);
  for (const item of read("Chaman-Integraciones.postman_collection.json")
    .item) {
    const route = item.request.url
      .replace("{{baseUrl}}", "")
      .split("?")[0]
      .replace(/\{\{[^}]+\}\}/g, "{idExterno}");
    assert.ok(doc.paths[route]?.[item.request.method.toLowerCase()], route);
  }
  assert.equal(
    read("Chaman-Testing.postman_environment.json").values.find(
      (v) => v.key === "apiKey",
    ).value,
    "",
  );
  const production = read('Chaman-Produccion.postman_environment.json');
  assert.equal(production.values.find(v=>v.key==='apiKey').value, '');
  assert.ok(production.values.filter(v=>v.key!=='baseUrl').every(v=>v.value===''));
});

test("offline provisioning creates only a hash for the server, with unique keys and no secret stdout", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "chaman-integration-test-"),
  );
  const config = {
    id: "fixture",
    name: "Fixture",
    advisorUserId: "a".repeat(24),
    permissionIndex: 0,
    scopes: ["fenologia:leer"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    requestsPerMinute: 60,
  };
  try {
    const one = prepare(config, dir);
    const two = prepare(config, dir);
    assert.notEqual(one.secretPath, two.secretPath);
    const secret = fs.readFileSync(one.secretPath, "utf8").trim();
    assert.match(secret, /^chm_test_k_[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/);
    const server = JSON.parse(fs.readFileSync(one.registryPath, "utf8"));
    assert.equal(
      server.keys[0].sha256,
      crypto.createHash("sha256").update(secret).digest("hex"),
    );
    assert.ok(!JSON.stringify(server).includes(secret));
    assert.ok(!JSON.stringify(one).includes(secret));
    assert.equal(server.environment, "testing");
    assert.throws(
      () => prepare({ ...config, environment: "production" }, dir),
      /Limites/,
    );
    const live = prepare(
      {
        ...config,
        environment: "production",
        limits: { productores: 50, establecimientos: 50, lotes: 50 },
        maxSowingAgeDays: 366,
      },
      dir,
    );
    const liveSecret = fs.readFileSync(live.secretPath, "utf8").trim();
    const liveRegistry = JSON.parse(fs.readFileSync(live.registryPath, "utf8"));
    assert.match(liveSecret, /^chm_live_k_[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/);
    assert.equal(liveRegistry.environment, "production");
    assert.equal(
      liveRegistry.keys[0].sha256,
      crypto.createHash("sha256").update(liveSecret).digest("hex"),
    );
    assert.ok(!JSON.stringify(live).includes(liveSecret));
    assert.throws(() => prepare({ ...config, environment: "prod" }, dir));
    assert.throws(() => prepare({ ...config, advisorUserId: "admin" }, dir));
    assert.throws(
      () => prepare(config, path.resolve(__dirname, "../..")),
      /Git/,
    );
  } finally {
    // Only files generated in this exact test-owned temporary directory; no recursion.
    assert.ok(
      path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    assert.ok(path.basename(dir).startsWith("chaman-integration-test-"));
    for (const file of fs.readdirSync(dir)) {
      assert.match(file, /^fixture-k_[a-f0-9]{24}\.(apikey|server\.json)$/);
      fs.unlinkSync(path.join(dir, file));
    }
    fs.rmdirSync(dir);
  }
});

test("the client handles pending, unchanged and rate limits; credentials cannot follow redirects", async () => {
  const args = {
    baseUrl:
      "https://testing-api-testing.up.railway.app/sdc-quimica-test/integraciones/v1",
    apiKey: "chm_test_unit_fixture." + "a".repeat(43),
    sowingId: "s1",
  };
  const calls = [];
  const pending = await queryPhenology({
    ...args,
    fetchImpl: async (url, options) => {
      calls.push(options);
      return new Response(JSON.stringify({ estado: "pendiente" }), {
        status: 202,
        headers: { ETag: '"v1"' },
      });
    },
  });
  assert.equal(calls[0].redirect, "error");
  assert.equal(pending.pending, true);
  assert.equal(pending.etag, '"v1"');
  const unchanged = await queryPhenology({
    ...args,
    etag: '"v1"',
    fetchImpl: async () => new Response(null, { status: 304 }),
  });
  assert.equal(unchanged.unchanged, true);
  const limited = await queryPhenology({
    ...args,
    fetchImpl: async () =>
      new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
  });
  assert.equal(limited.afterSeconds, 60);
  await assert.rejects(
    queryPhenology({ ...args, baseUrl: "https://app.chamanagro.ar" }),
    /Testing/,
  );
  let sent = false;
  const liveUrl =
    "https://chaman-api-production.up.railway.app/sdc-quimica/integraciones/v1";
  const fetchImpl = async () => {
    sent = true;
    return new Response("{}", { status: 200 });
  };
  await assert.rejects(
    queryPhenology({ ...args, baseUrl: liveUrl, fetchImpl }),
    /Credencial/,
  );
  assert.equal(
    sent,
    false,
    "A sandbox key must not even be sent to Production",
  );
  await queryPhenology({
    ...args,
    baseUrl: liveUrl,
    apiKey: "chm_live_unit_fixture." + "b".repeat(43),
    fetchImpl,
  });
  assert.equal(sent, true);
});
