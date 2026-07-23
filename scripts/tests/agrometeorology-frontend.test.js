const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..", "..");
const detail = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/detalles-lote.component.html",
  ),
  "utf8",
);
const cardHtml = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-calculos-meteorologicos/card-calculos-meteorologicos.component.html",
  ),
  "utf8",
);
const cardTs = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-calculos-meteorologicos/card-calculos-meteorologicos.component.ts",
  ),
  "utf8",
);

test("fenologia queda junto al detalle operativo y frio precede las variables meteorologicas", () => {
  const detailStart = detail.indexOf(
    '<section class="custom-card lot-summary-card">',
  );
  const detailEnd = detail.indexOf("</section>", detailStart);
  const phenologyStart = detail.indexOf("<app-card-etapas-fenologicas");
  const phenologyEnd = detail.indexOf("</app-card-etapas-fenologicas>");
  const coldStart = detail.indexOf("<app-card-frio-termico");
  const coldEnd = detail.indexOf("</app-card-frio-termico>");
  const agrometStart = detail.indexOf("<app-card-calculos-meteorologicos");

  assert.ok(detailStart >= 0);
  assert.ok(detailEnd > detailStart);
  assert.ok(phenologyStart > detailEnd);
  assert.match(
    detail.slice(detailEnd + "</section>".length, phenologyStart).trim(),
    /^@if\s*\(\s*siembra\s*&&\s*!siembra\.fechaCosecha\s*&&\s*helper\.puedeVerModulo\('EtapasFenologicas'\)\s*\)\s*\{$/,
  );
  assert.ok(phenologyEnd > phenologyStart);
  assert.ok(coldStart > phenologyEnd);
  assert.ok(coldEnd > coldStart);
  assert.ok(agrometStart > coldEnd);
  assert.equal(
    detail
      .slice(coldEnd + "</app-card-frio-termico>".length, agrometStart)
      .trim(),
    "",
  );
});

test("la vista es de solo lectura y contempla carga, vacio y error", () => {
  assert.match(cardHtml, /VARIABLES METEOROLÓGICAS/);
  assert.doesNotMatch(cardHtml, />\s*Calcular\s*</i);
  assert.match(cardHtml, /skeleton-grid/);
  assert.match(cardHtml, /Preparando la primera serie meteorologica/);
  assert.match(cardHtml, /No se pudo leer el seguimiento meteorologico/);
});

test("los graficos separan observaciones y pronostico y toleran suelo opcional", () => {
  assert.match(cardTs, /isForecast/);
  assert.match(cardTs, /dashStyle:\s*'Dash'/);
  assert.match(cardTs, /mostrarSuelo/);
  assert.match(cardTs, /connectNulls:\s*false/);
});
