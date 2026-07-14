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

test("la tarjeta meteorologica esta inmediatamente debajo de fenologia", () => {
  const phenologyEnd = detail.indexOf("</app-card-etapas-fenologicas>");
  const agrometStart = detail.indexOf("<app-card-calculos-meteorologicos");
  assert.ok(phenologyEnd >= 0);
  assert.ok(agrometStart > phenologyEnd);
  assert.equal(
    detail
      .slice(
        phenologyEnd + "</app-card-etapas-fenologicas>".length,
        agrometStart,
      )
      .trim(),
    "",
  );
});

test("la vista es de solo lectura y contempla carga, vacio y error", () => {
  assert.match(cardHtml, /CÁLCULOS METEOROLÓGICOS/);
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
