/**
 * Auditoria local, sin red, credenciales ni escrituras. No calibra agronomia.
 * Ejecutar: node scripts/audit-hydric-compatibility.cjs
 * Requiere dependencias locales y sdc-modelos compilado.
 * Compara motores reales de Git con la copia de trabajo; no copia formulas.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const ts = require(path.join(root, "sdc-api-cliente/node_modules/typescript"));
const BASE = "e4113ede";
const PROPOSAL = "1cf874da";
const cache = new Map();
const clone = (value) => JSON.parse(JSON.stringify(value));
const legacyMessages = new Set();
const originalLog = console.log;
const originalWarn = console.warn;
console.log = console.warn = (...args) => legacyMessages.add(args.join(" "));

function source(ref, file) {
  return ref === "working"
    ? fs.readFileSync(path.join(root, file), "utf8")
    : execFileSync("git", ["show", `${ref}:${file}`], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 8e6,
      });
}

function load(ref, file) {
  const key = `${ref}:${file}`;
  if (cache.has(key)) return cache.get(key).exports;
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = Module.createRequire(filename);
  mod.require = (name) => {
    if (name === "modelos/src" || name === "modelos")
      return require(path.join(root, "sdc-modelos/dist/index.js"));
    if (name.startsWith(".")) {
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), name),
      );
      return load(ref, `${target}.ts`);
    }
    return nativeRequire(name);
  };
  cache.set(key, mod);
  const js = ts.transpileModule(source(ref, file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
    },
  }).outputText;
  mod._compile(js, filename);
  return mod.exports;
}

const NativeDate = Date;
const now = NativeDate.parse("2026-09-13T12:00:00Z");
global.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [now]));
  }
  static now() {
    return now;
  }
};
const { Logger } = Module.createRequire(
  path.join(root, "sdc-api-predicciones/package.json"),
)("@nestjs/common");
Logger.overrideLogger(false);
const models = require(path.join(root, "sdc-modelos/dist/index.js"));
const irrigation = "sdc-api-predicciones/src/entidades/riego/";
const footprint = "sdc-datos/src/entidades/algoritmos/huella-hidrica.engine.ts";
const engines = Object.fromEntries(
  [BASE, PROPOSAL, "working"].map((ref) => [
    ref,
    {
      v12: load(ref, `${irrigation}riego-v12.engine.ts`).calcularRiegoV12,
      v13: load(ref, `${irrigation}riego-v13-fallback.engine.ts`)
        .calcularRiegoV13Estimado,
      hh: load(ref, footprint).calcularHuellaHidrica,
      seguimiento: load(ref, footprint).calcularSeguimientoHuellaHidrica,
    },
  ]),
);
// Contrato conservado tambien en seleccion de siembras y controles de seguridad.
const preservedFiles = [
  `${irrigation}riego-v12.engine.ts`,
  `${irrigation}riego-v13-fallback.engine.ts`,
  `${irrigation}riego-safety.ts`,
  footprint,
  "sdc-api-predicciones/src/auxiliares/helper.ts",
  "sdc-api-predicciones/src/entidades/siembra/service.ts",
];
for (const file of preservedFiles)
  assert.equal(
    source("working", file).replace(/\r\n/g, "\n"),
    source(BASE, file).replace(/\r\n/g, "\n"),
    `Cambio de algoritmo o elegibilidad no aislado: ${file}`,
  );
const candidateDemand = load(
  PROPOSAL,
  `${irrigation}riego-demanda-canonica.ts`,
).demandaRiegoCanonica;
const crops = [
  "Trigo",
  "Soja",
  "Maiz",
  "Cebada",
  "Arveja",
  "Papa",
  "Vid",
  "Manzano",
  "Peral",
  "Pecan",
];
// Valores artificiales de contrato, no un cronograma recomendado a clientes.
const chronos = {
  Trigo: {
    R0_R1: 13,
    R1_R2: 102,
    R2_R3: 124,
    R3_R4: 138,
    R4_R5: 144,
    R5_R6: 151,
    R6_R7: 185,
  },
  Soja: {
    siembra_emergencia: 10,
    emergencia_R1: 44,
    R1_R3: 66,
    R3_R5: 80,
    R5_R7: 118,
  },
  Maiz: {
    siembra_emergencia: 12,
    emergencia_floracion: 76,
    floracion_madurez: 160,
  },
};
const depths = Array.from({ length: 12 }, (_, i) => (i + 1) * 10);
const date = (offset) =>
  new Date(now + offset * 86400000).toISOString().slice(0, 10);
const lote = {
  capacidadDeCampo: 30,
  puntoMarchitez: 14,
  capacidadDeRiego: 8,
  eficienciaRiego: 85,
  anchoDeBulbo: 1,
  metrosLinealesHas: 10000,
  depositoN: "< 0.5",
  texturaLixiviacion: "Franco",
  texturaEscorrentia: "Franco",
  drenajeNaturalLixiviacion: "Bien Drenado",
  drenajeNaturalEscorrentia: "Bien Drenado",
  erosionEscorrentiaPendiente: "Baja (0 - 3%)",
  contenidoP: "< 12",
};
const summary = [];
let comparisons = 0;
for (const cultivo of crops) {
  const row = {
    cultivo,
    casos: 0,
    diferenciasRestaurado: 0,
    propuestaSinDemanda: 0,
    diferenciasDemandaPropuesta: 0,
    ejemplo: null,
  };
  for (const withChrono of [false, true])
    for (const age of [15, 60, 120]) {
      const crono = withChrono
        ? {
            cultivo,
            etapas: chronos[cultivo] || {
              Inicio: 20,
              Desarrollo: 60,
              Cierre: 100,
            },
          }
        : undefined;
      const siembra = {
        _id: "sintetica",
        idLote: "lote-sintetico",
        activa: true,
        fechaSiembra: date(-age),
        semilla: { cultivo },
        crono,
        rendimientoObtenidoKgHaSeco: 1000,
        lluviasPromedio: "< 600",
        fijacionN: "0",
        manejoAgronomico: "Bueno",
        intensidadLluvias: "Suaves",
        materiaOrganica: "< 1",
        labranza: "Siembra Directa",
      };
      const registro = {
        id: "r-sintetico",
        idSiembra: siembra._id,
        idLote: siembra.idLote,
        cultivo,
        tipoEvento: "inicio_etapa",
        etapa: models.esCultivoPerenne(cultivo) ? "Brotacion" : "Floracion",
        fechaInicioEtapa: date(-4),
        confianza: "alta",
        actualizadoEn: `${date(-1)}T12:00:00Z`,
      };
      const forecast = [0, 1, 2].map((d) => ({
        fecha: date(d),
        et0: 4,
        lluvia: 0,
        probabilidadLluvia: 0,
      }));
      const params = {
        siembra,
        lote,
        cultivo,
        crono,
        pronostico7Dias: forecast,
        suelo: depths.map((profundidad, i) => ({
          numeroDeSensor: i + 1,
          profundidad,
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
          hayRaices: true,
        })),
        humedadSuelo: [
          {
            fecha: `${date(0)}T11:00:00Z`,
            humedadSuelo: Object.fromEntries(
              depths.map((d) => [d, { last: 22 }]),
            ),
          },
        ],
        lluviaHistorica: [
          { fecha: `${date(0)}T10:00:00Z`, lluvia: { last: 0 } },
        ],
      };
      const hhParams = {
        siembra: { ...siembra, fechaCosecha: date(0) },
        lote,
        clima: Array.from({ length: age + 1 }, (_, d) => ({
          fecha: date(d - age),
          lluviaMm: 1,
          et0Mm: 4,
        })),
        riegos: [{ laminaMm: 2 }],
      };
      for (const method of ["v12", "v13", "hh", "seguimiento"]) {
        const input = method.startsWith("v") ? params : hhParams;
        const before = engines[BASE][method](clone(input));
        const after = engines.working[method](clone(input));
        assert.deepEqual(
          after,
          before,
          `${cultivo}/${withChrono}/${age}/${method}: cambio no aprobado`,
        );
        comparisons++;
        const observed = clone(input);
        observed.siembra.registrosFenologicos = [registro];
        assert.deepEqual(
          engines.working[method](observed),
          before,
          `${cultivo}/${method}: registro altero el algoritmo conservado`,
        );
        comparisons++;
      }
      // Aislamiento de la sustitucion de Kc con ET0 constante: no simula clima real
      // ni valida la etapa, el rendimiento o la temporada biologica del cultivo.
      const sumDays =
        crono && Object.values(crono.etapas).reduce((a, b) => a + b, 0);
      const progress = models.esCultivoPerenne(cultivo)
        ? ((now - new Date("2026-07-01T12:00:00Z").getTime()) /
            86400000 /
            365) *
          100
        : sumDays
          ? (age / sumDays) * 100
          : undefined;
      const kc = models.resolverKc(
        models.PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA[cultivo],
        progress,
      );
      try {
        const demanda = candidateDemand(siembra, forecast, {
          dataSource: { lastCalculatedAt: new Date().toISOString() },
          series: forecast.map((p) => ({
            date: p.fecha,
            stageSource: "cronograma_referencia",
            metrics: {
              et0Mm: 4,
              kc,
              etcMm: kc === undefined ? undefined : kc * 4,
            },
          })),
        });
        const oldDemand = engines[BASE].v13(clone(params)).pronosticosRiego[0]
          .consumoAgua;
        const newDemand = engines[PROPOSAL].v13({
          ...clone(params),
          demandaCanonica: demanda,
        }).pronosticosRiego[0].consumoAgua;
        if (oldDemand !== newDemand) row.diferenciasDemandaPropuesta++;
        if (age === 60 && withChrono)
          row.ejemplo = {
            dias: age,
            et0MmDia: 4,
            anteriorMmDia: oldDemand,
            propuestaMmDia: newDemand,
          };
      } catch (error) {
        if (!error.message.includes("Demanda de riego no disponible"))
          throw error;
        row.propuestaSinDemanda++;
      }
      row.casos++;
    }
  summary.push(row);
}
global.Date = NativeDate;
console.log = originalLog;
console.warn = originalWarn;
console.log(
  JSON.stringify(
    {
      baseline: BASE,
      propuestaArchivada: PROPOSAL,
      datos: "sinteticos, no representan clientes ni calibracion agronomica",
      comparacionesExactas: comparisons,
      casos: summary.reduce((n, r) => n + r.casos, 0),
      resultados: summary,
      archivosOperativosIdenticos: preservedFiles.length,
      avisosHeredados: [...legacyMessages].filter((message) =>
        message.includes("Cultivo no reconocido"),
      ),
      limites: [
        "Igualdad de software no prueba exactitud agronomica.",
        "No se ensayan aqui alertas reales, HTTP ni persistencia.",
        "El contraste de la propuesta aisla Kc con ET0 fija y sin registro manual.",
      ],
    },
    null,
    2,
  ),
);
