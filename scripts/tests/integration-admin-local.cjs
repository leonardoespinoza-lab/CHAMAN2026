/* Manual isolated test after building modelos, API and datos. Never uses DB_URL.
 * Starts its own loopback mongod and verifies server PID before creating fixtures.
 * Business algorithms and rate limiter are stubs; registry, guards, HTTP and Mongo are real.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { randomUUID, randomBytes } = require("node:crypto");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const apiRequire = createRequire(
  path.join(root, "sdc-api-cliente/package.json"),
);
const dataRequire = createRequire(path.join(root, "sdc-datos/package.json"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

test(
  "Admin integrations: isolated HTTP, Mongo, keys, CAS, usage and scope changes",
  { timeout: 120000 },
  async (t) => {
    const binary = "C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe";
    await fs.access(binary);
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "chaman-api-admin-fixture-"),
    );
    const port = await freePort();
    const log = path.join(directory, "mongod.log");
    const child = spawn(
      binary,
      [
        "--bind_ip",
        "127.0.0.1",
        "--port",
        String(port),
        "--dbpath",
        directory,
        "--logpath",
        log,
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    child.stderr.resume();
    let spawnError;
    child.once("error", (e) => {
      spawnError = e;
    });
    let connection, dataApp, apiApp;
    const oldEnv = { ...process.env };
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null)
          throw new Error("Owned Mongo stopped; no database used.");
        if (
          (await fs.readFile(log, "utf8").catch(() => "")).includes(
            "Waiting for connections",
          )
        ) {
          ready = true;
          break;
        }
        await delay(150);
      }
      assert.equal(ready, true);
      const mongoose = dataRequire("mongoose");
      const db = "api_admin_fixture_" + randomUUID().replaceAll("-", "");
      connection = await mongoose
        .createConnection(`mongodb://127.0.0.1:${port}/${db}`, {
          serverSelectionTimeoutMS: 5000,
        })
        .asPromise();
      assert.equal(
        Number((await connection.db.admin().serverStatus()).pid),
        child.pid,
      );
      assert.equal(connection.name, db);
      process.env.ENV = "testing";
      process.env.NODE_ENV = "test";
      process.env.CHAMAN_INTEGRATIONS_ADMIN_ENABLED = "true";
      process.env.CHAMAN_INTEGRATIONS_ENABLED = "true";
      process.env.CHAMAN_INTEGRATIONS_REGISTRY_SOURCE = "database";
      process.env.CHAMAN_INTEGRATIONS_INTERNAL_TOKEN =
        randomBytes(32).toString("hex");
      apiRequire("reflect-metadata");
      const { Test: DataTest } = dataRequire("@nestjs/testing");
      const { getModelToken } = dataRequire("@nestjs/mongoose");
      const {
        IntegrationClientSchema,
        IntegrationUsageSchema,
      } = require("../../sdc-datos/dist/entidades/integration-control/module");
      const {
        IntegrationControlService,
      } = require("../../sdc-datos/dist/entidades/integration-control/service");
      const {
        IntegrationControlController,
        IntegrationControlGuard,
      } = require("../../sdc-datos/dist/entidades/integration-control/controller");
      const clients = connection.model(
        "IntegrationClientRecord",
        IntegrationClientSchema,
      );
      const usage = connection.model(
        "IntegrationUsageEvent",
        IntegrationUsageSchema,
      );
      await Promise.all([clients.init(), usage.init()]);
      const dm = await DataTest.createTestingModule({
        controllers: [IntegrationControlController],
        providers: [
          IntegrationControlService,
          IntegrationControlGuard,
          {
            provide: getModelToken("IntegrationClientRecord"),
            useValue: clients,
          },
          { provide: getModelToken("IntegrationUsageEvent"), useValue: usage },
        ],
      }).compile();
      dataApp = dm.createNestApplication({ logger: false });
      await dataApp.listen(0, "127.0.0.1");
      const dataOrigin = await dataApp.getUrl();
      process.env.API_DATOS = dataOrigin;
      apiRequire("tsconfig-paths").register({
        baseUrl: path.join(root, "sdc-api-cliente/dist"),
        paths: { "src/*": ["*"] },
      });
      const { Test } = apiRequire("@nestjs/testing");
      const { HttpModule, HttpService } = apiRequire("@nestjs/axios");
      const { HttpException } = apiRequire("@nestjs/common");
      const {
        AxiosService,
      } = require("../../sdc-api-cliente/dist/auxiliares/axios/axios.service");
      const {
        IntegrationAdminController,
      } = require("../../sdc-api-cliente/dist/integraciones/admin.controller");
      const {
        IntegrationAdminService,
      } = require("../../sdc-api-cliente/dist/integraciones/admin.service");
      const {
        IntegrationControlStore,
      } = require("../../sdc-api-cliente/dist/integraciones/control-store");
      const {
        IntegrationRegistry,
      } = require("../../sdc-api-cliente/dist/integraciones/registry");
      const {
        IntegrationGuard,
      } = require("../../sdc-api-cliente/dist/integraciones/guard");
      const {
        IntegrationRuntime,
      } = require("../../sdc-api-cliente/dist/integraciones/runtime");
      const {
        IntegrationsController,
      } = require("../../sdc-api-cliente/dist/integraciones/controller");
      const {
        IntegrationsService,
      } = require("../../sdc-api-cliente/dist/integraciones/service");
      const {
        UsuariosRepository,
      } = require("../../sdc-api-cliente/dist/entidades/usuario/repository");
      const {
        LicenciaPorEntidadsService,
      } = require("../../sdc-api-cliente/dist/entidades/licenciaPorEntidad/service");
      const {
        AdvisorScopeService,
      } = require("../../sdc-api-cliente/dist/auxiliares/authorization/advisor-scope.service");
      const operator = {
        _id: "a".repeat(24),
        username: "fixture",
        activo: true,
        permisos: [{ nivel: "Asesor", rol: "Admin" }],
      };
      let rateBlocked = false;
      const am = await Test.createTestingModule({
        imports: [HttpModule.register({ timeout: 5000 })],
        controllers: [IntegrationAdminController, IntegrationsController],
        providers: [
          AxiosService,
          IntegrationAdminService,
          IntegrationControlStore,
          IntegrationRegistry,
          IntegrationGuard,
          {
            provide: UsuariosRepository,
            useValue: {
              getById: async () => operator,
              getByUsername: async () => operator,
            },
          },
          {
            provide: LicenciaPorEntidadsService,
            useValue: {
              getLicenciaEfectivaPorPermiso: async () => ({
                _id: "c".repeat(24),
              }),
            },
          },
          {
            provide: AdvisorScopeService,
            useValue: { enrichPermission: async () => {} },
          },
          {
            provide: IntegrationRuntime,
            useValue: {
              rateLimit: async () => {
                if (rateBlocked) throw new HttpException("fixture limit", 429);
              },
            },
          },
          {
            provide: IntegrationsService,
            useValue: { catalog: async () => ({ datos: [] }) },
          },
        ],
      }).compile();
      am.get(HttpService).axiosRef.interceptors.request.use((config) => {
        if (new URL(config.url).origin !== dataOrigin)
          throw new Error("External HTTP forbidden in this fixture.");
        return config;
      });
      apiApp = am.createNestApplication({ logger: false });
      apiApp.use((req, res, next) => {
        if (req.headers.authorization === "Bearer fixture-admin") {
          res.locals.permiso = { nivel: "Admin", rol: "Admin" };
          res.locals.token = { user: { _id: "b".repeat(24) } };
        }
        next();
      });
      await apiApp.listen(0, "127.0.0.1");
      const origin = await apiApp.getUrl();
      const call = async (url, method = "GET", body, key) => {
        const headers = { "Content-Type": "application/json" };
        if (url.startsWith("/admin/"))
          headers.Authorization = "Bearer fixture-admin";
        if (key) headers["x-api-key"] = key;
        return fetch(origin + url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error",
        });
      };
      const settings = {
        name: "Fixture",
        enabled: false,
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["catalogos:leer", "fenologia:leer"],
        limits: { productores: 50, establecimientos: 50, lotes: 50 },
        requestsPerMinute: 60,
        maxSowingAgeDays: 366,
      };
      let current;
      await t.test(
        "creates two keyless clients, rejects duplicate operator and data-server bypass",
        async () => {
          const r = await call("/admin/integraciones", "POST", {
            ...settings,
            id: "fixture-one",
            advisorUserId: operator._id,
            permissionIndex: 0,
          });
          assert.equal(r.status, 201);
          current = await r.json();
          const r2 = await call("/admin/integraciones", "POST", {
            ...settings,
            id: "fixture-two",
            advisorUserId: "d".repeat(24),
            permissionIndex: 0,
          });
          assert.equal(r2.status, 201);
          const duplicate = await call("/admin/integraciones", "POST", {
            ...settings,
            id: "fixture-three",
            advisorUserId: operator._id,
            permissionIndex: 0,
          });
          assert.equal(duplicate.status, 409);
          assert.equal(
            (
              await fetch(
                dataOrigin + "/internal/integration-control/command",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "list",
                    environment: "testing",
                  }),
                },
              )
            ).status,
            401,
          );
        },
      );
      await t.test("competing edits do not overwrite each other", async () => {
        const responses = await Promise.all(
          [70, 80].map((lotes) =>
            call("/admin/integraciones/fixture-one", "PUT", {
              revision: 1,
              settings: { ...settings, limits: { ...settings.limits, lotes } },
            }),
          ),
        );
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        current = await responses.find((r) => r.status === 200).json();
        assert.equal(current.revision, 2);
      });
      let key;
      await t.test(
        "issues once, stores no plaintext, and activates only after explicit configuration",
        async () => {
          const issued = await call(
            "/admin/integraciones/fixture-one/claves",
            "POST",
            { revision: current.revision },
          );
          assert.equal(issued.status, 201);
          const payload = await issued.json();
          key = payload.credential;
          current = payload.client;
          assert.equal(
            JSON.stringify(
              await clients.findOne({ id: current.id }).lean(),
            ).includes(key),
            false,
          );
          assert.equal(
            JSON.stringify(
              await (await call("/admin/integraciones")).json(),
            ).includes(key),
            false,
          );
          assert.equal(
            (await call("/integraciones/v1/servicios", "GET", undefined, key))
              .status,
            401,
          );
          const r = await call("/admin/integraciones/fixture-one", "PUT", {
            revision: current.revision,
            settings: { ...settings, enabled: true },
          });
          assert.equal(r.status, 200);
          current = await r.json();
          assert.equal(
            (await call("/integraciones/v1/servicios", "GET", undefined, key))
              .status,
            200,
          );
        },
      );
      await t.test(
        "service removal takes effect immediately and 403/429 are metered",
        async () => {
          assert.equal(
            (
              await call(
                "/integraciones/v1/catalogos/semillas",
                "GET",
                undefined,
                key,
              )
            ).status,
            200,
          );
          const r = await call("/admin/integraciones/fixture-one", "PUT", {
            revision: current.revision,
            settings: {
              ...settings,
              enabled: true,
              scopes: ["fenologia:leer"],
            },
          });
          current = await r.json();
          assert.equal(
            (
              await call(
                "/integraciones/v1/catalogos/semillas",
                "GET",
                undefined,
                key,
              )
            ).status,
            403,
          );
          rateBlocked = true;
          assert.equal(
            (await call("/integraciones/v1/servicios", "GET", undefined, key))
              .status,
            429,
          );
          rateBlocked = false;
          for (
            let i = 0;
            i < 30 && (await usage.countDocuments({ status: 0 }));
            i++
          )
            await delay(100);
          const report = await (
            await call("/admin/integraciones/fixture-one/consumo?days=30")
          ).json();
          assert.equal(
            report.rows.reduce((n, r) => n + r.requests, 0),
            4,
          );
          assert.equal(
            report.rows.reduce((n, r) => n + r.errors, 0),
            2,
          );
          assert.equal(
            report.rows.reduce((n, r) => n + r.rateLimited, 0),
            1,
          );
          assert.equal(
            report.rows.reduce((n, r) => n + r.unfinished, 0),
            0,
          );
          const neighbor = await (
            await call("/admin/integraciones/fixture-two/consumo?days=30")
          ).json();
          assert.equal(neighbor.rows.length, 0);
        },
      );
      await t.test(
        "revocation prevents the same key from authenticating again",
        async () => {
          const r = await call(
            `/admin/integraciones/fixture-one/claves/${current.keys[0].id}/revocar`,
            "POST",
            { revision: current.revision },
          );
          assert.equal(r.status, 201);
          assert.equal(
            (await call("/integraciones/v1/servicios", "GET", undefined, key))
              .status,
            401,
          );
          const saved = await clients.findOne({ id: "fixture-one" }).lean();
          assert.equal(saved.keys.length, 0);
          assert.equal(saved.advisorUserId, operator._id);
        },
      );
      console.log(
        "# Verified local-only fixture; no real clients, Production or Railway accessed.",
      );
    } finally {
      if (apiApp) await apiApp.close();
      if (dataApp) await dataApp.close();
      if (connection) await connection.close();
      for (const key of Object.keys(process.env))
        if (!(key in oldEnv)) delete process.env[key];
      Object.assign(process.env, oldEnv);
      if (child.exitCode === null) {
        child.kill();
        await delay(500);
      }
      console.log("# Mongo fixture preserved for inspection: " + directory);
    }
  },
);
