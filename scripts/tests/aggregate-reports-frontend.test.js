const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..", "..");
const distributor = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-distribuidor/dashboard/dashboard.component.ts",
  ),
  "utf8",
);
const company = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-quimica/dashboard/dashboard.component.ts",
  ),
  "utf8",
);
const reports = [distributor, company];

test("los informes agregados imprimen el logo Chaman y esperan su decodificacion", () => {
  for (const report of reports) {
    assert.match(
      report,
      /new URL\('\/images\/logo-light\.png', document\.baseURI\)/,
    );
    assert.match(report, /class="chaman-logo"/);
    assert.match(report, /imagen\.decode\(\)/);
    assert.match(report, /document\.fonts\.ready/);
    assert.match(report, /Promise\.race/);
    assert.match(report, /setTimeout\(resolve, 2500\)/);
    assert.match(report, /window\.addEventListener\('load'/);
  }
  assert.match(distributor, /distribuidorActual\?\.logo/);
  assert.match(company, /safeImageUrl\(this\.logoCompania\)/);
});

test("la impresion A4 mantiene encabezados y filas completas", () => {
  for (const report of reports) {
    assert.match(report, /@page \{ size: A4;/);
    assert.match(report, /thead \{ display: table-header-group;/);
    assert.match(
      report,
      /tr \{ break-inside: avoid-page; page-break-inside: avoid;/,
    );
    assert.match(report, /<h2>Resumen ejecutivo<\/h2>/);
    assert.match(report, /Corte del informe/);
  }
  assert.match(distributor, /hasta 10 de/);
  assert.match(distributor, /Hasta 8 prioridades operativas/);
  assert.match(company, /hasta 12 cultivos/);
  assert.match(company, /hasta 25 distribuidores/);
});

test("la matriz declara alcance real y no inventa datos de servicios no consolidados", () => {
  for (const report of reports) {
    for (const state of [
      "Con dato",
      "Parcial",
      "Sin dato",
      "No consolidado",
      "No aplica",
    ]) {
      assert.match(report, new RegExp(state));
    }
    for (const service of [
      "Ubicaci",
      "Suelo y ambiente",
      "Fenolog",
      "Monitoreo sanitario",
      "Riego",
      "Malezas",
      "Huella hidrica",
      "Clima observado y calidad climatica",
      "Camaras y sensores",
      "ndices satelitales",
      "lculos agrometeorol",
      "Helada, granizo y riesgos agroclimaticos",
      "Viento y ventana de aplicacion",
    ]) {
      assert.match(report, new RegExp(service));
    }
    assert.match(report, /este tablero no recibe su serie historica/);
    assert.match(report, /no se agregan en este alcance/);
    assert.match(
      report,
      /no recibe lot_soil_assessments y no infiere ausencia de suelo/,
    );
    assert.match(report, /esPrediccionMalezasOperativa/);
    assert.match(report, /esHuellaHidricaConsolidada/);
    assert.match(report, /calculada\/estimada y cantidad/);
  }
});

test("las campanas vigentes no aplican un corte temporal y conservan perennes historicos", () => {
  assert.doesNotMatch(distributor, /fechaHace6Meses|setMonth\([^)]*- 6\)/);
  for (const report of reports) {
    assert.match(report, /fechaSiembra fechaCosecha activa/);
    assert.match(report, /select: 'cultivo(?: variedad)? tipoCultivo'/);
    assert.match(report, /esCultivoPerenne/);
    assert.match(
      report,
      /if \(siembra\.fechaCosecha \|\| siembra\.activa === false\)/,
    );
    assert.match(report, /antiguedadDias <= 548/);
    assert.match(report, /perennes conservadas sin recorte por antiguedad/);
    assert.match(report, /const vistos = new Set<string>\(\)/);
    assert.doesNotMatch(
      report,
      /\.filter\(\(siembra\) => this\.esSiembraVigente\(siembra\)\)/,
    );
  }
});

test("el riesgo ejecutivo excluye modelos experimentales y provisionales", () => {
  for (const report of reports) {
    assert.match(report, /esFechaPrediccionSanitariaReciente/);
    assert.match(report, /esLecturaSanitariaOperativa/);
    assert.match(report, /this\.enfermedadesOperativas\(siembra\)/);
    assert.match(
      report,
      /lectura no agregable por validacion, calidad, trazabilidad o vigencia/,
    );
    assert.match(report, /no elevan alertas|no eleva el riesgo ejecutivo/);
  }
});

test("las consultas agregadas proyectan solo campos compactos del informe", () => {
  for (const report of reports) {
    assert.match(report, /ultimaPrediccionRiego\.cantidad/);
    assert.match(report, /ultimaPrediccionMalezas\.estado/);
    assert.match(report, /ultimaPrediccionMalezas\.especies\._id/);
    assert.doesNotMatch(
      report,
      /ubicacionAdministrativa sueloReferencia suelos/,
    );
  }
});
