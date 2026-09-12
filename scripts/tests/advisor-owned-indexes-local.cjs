// Isolated Mongo test. Does not read DB_URL, remote credentials or Railway.
// Leaves its temporary directory for inspection; stops only its own child PID.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const dataRequire = createRequire(path.join(root, "sdc-datos/package.json"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test(
  "advisor-owned farm indexes: safe transition on a fresh, owned loopback Mongo",
  { timeout: 60000 },
  async (t) => {
    const binary = "C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe";
    await fs.access(binary);
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "chaman-advisor-owned-index-"),
    );
    const listener = net.createServer();
    await new Promise((r) => listener.listen(0, "127.0.0.1", r));
    const port = listener.address().port;
    await new Promise((r) => listener.close(r));
    const log = path.join(dir, "mongo.log");
    const child = spawn(
      binary,
      [
        "--bind_ip",
        "127.0.0.1",
        "--port",
        String(port),
        "--dbpath",
        dir,
        "--logpath",
        log,
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    child.stderr.resume();
    let startupError;
    child.on("error", (e) => {
      startupError = e;
    });
    let connection;
    let unregister;
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (startupError) throw startupError;
        assert.equal(child.exitCode, null, "Owned Mongo stopped");
        if (
          (await fs.readFile(log, "utf8").catch(() => "")).includes(
            "Waiting for connections",
          )
        ) {
          ready = true;
          break;
        }
        await delay(100);
      }
      assert.equal(ready, true);
      const mongoose = dataRequire("mongoose");
      const database =
        "advisor_owned_fixture_" + randomUUID().replaceAll("-", "");
      connection = await mongoose
        .createConnection(`mongodb://127.0.0.1:${port}/${database}`, {
          serverSelectionTimeoutMS: 5000,
          autoIndex: false,
        })
        .asPromise();
      assert.equal(
        Number((await connection.db.admin().serverStatus()).pid),
        child.pid,
      );
      assert.equal(connection.name, database);
      unregister = dataRequire("tsconfig-paths").register({
        baseUrl: path.join(root, "sdc-datos/dist"),
        paths: { "src/*": ["*"] },
      });
      const { EstablecimientoSchema } = dataRequire(
        "./dist/entidades/establecimiento/modelos/schema",
      );
      const model = connection.model(
        "AdvisorFixture",
        EstablecimientoSchema,
        "establecimientos",
      );
      await model.createCollection();
      const collection = model.collection;
      const oldName = "uniq_establecimiento_productor_nombre_activo_v2";
      await collection.createIndex(
        { nombre: 1, idProductor: 1 },
        {
          name: oldName,
          unique: true,
          partialFilterExpression: { archivado: false },
        },
      );
      const a = new mongoose.Types.ObjectId(),
        b = new mongoose.Types.ObjectId(),
        producer = new mongoose.Types.ObjectId();
      const own = (owner) => ({
        nombre: "Campo propio",
        carteraPropiaAsesor: true,
        idAsesorPropietario: owner,
      });
      await model.create(own(a));
      await assert.rejects(
        () => model.create(own(b)),
        (e) => e.code === 11000,
      );
      await t.test(
        "create and verify both v3 constraints before retiring v2",
        async () => {
          const indexes = EstablecimientoSchema.indexes().filter(
            ([, options]) => options.unique,
          );
          assert.equal(indexes.length, 2);
          for (const [key, options] of indexes)
            await collection.createIndex(key, options);
          const actual = await collection.indexes();
          for (const [key, options] of indexes) {
            const index = actual.find((i) => i.name === options.name);
            assert.deepEqual(index.key, key);
            assert.equal(index.unique, true);
            assert.deepEqual(
              index.partialFilterExpression,
              options.partialFilterExpression,
            );
          }
          assert(actual.some((i) => i.name === oldName));
          // Only this just-created collection on the verified child can reach here.
          assert.equal(connection.name, database);
          assert.equal(
            Number((await connection.db.admin().serverStatus()).pid),
            child.pid,
          );
          await collection.dropIndex(oldName);
        },
      );
      await t.test(
        "two advisors can use the same own-field name, without producer records",
        async () => {
          await model.create(own(b));
          assert.equal(
            await model.countDocuments({ carteraPropiaAsesor: true }),
            2,
          );
          await assert.rejects(
            () => model.create(own(a)),
            (e) => e.code === 11000,
          );
          assert.equal(
            await connection.db.collection("productors").countDocuments(),
            0,
          );
        },
      );
      await t.test(
        "producer uniqueness remains independent of the assigned advisor",
        async () => {
          await model.create({
            nombre: "Campo del productor",
            idProductor: producer,
            idAsesorPropietario: a,
          });
          await assert.rejects(
            () =>
              model.create({
                nombre: "Campo del productor",
                idProductor: producer,
                idAsesorPropietario: b,
              }),
            (e) => e.code === 11000,
          );
        },
      );
      await t.test(
        "legacy ownerless records still reject duplicates; archived names can be reused",
        async () => {
          await model.create({ nombre: "Legado sin dueño" });
          await assert.rejects(
            () => model.create({ nombre: "Legado sin dueño" }),
            (e) => e.code === 11000,
          );
          await model.updateOne(
            { nombre: "Campo propio", idAsesorPropietario: a },
            { $set: { archivado: true } },
          );
          await model.create(own(a));
          assert.equal(
            await model.countDocuments({
              nombre: "Campo propio",
              archivado: false,
            }),
            2,
          );
        },
      );
    } finally {
      unregister?.();
      await connection?.close();
      if (child.exitCode === null) {
        child.kill();
        await Promise.race([
          new Promise((r) => child.once("exit", r)),
          delay(2000),
        ]);
      }
    }
  },
);
