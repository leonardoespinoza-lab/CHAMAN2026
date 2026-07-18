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
const card = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-ubicacion-lote/card-ubicacion-lote.component.html",
  ),
  "utf8",
);
const cardTs = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-ubicacion-lote/card-ubicacion-lote.component.ts",
  ),
  "utf8",
);
const cardCss = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-ubicacion-lote/card-ubicacion-lote.component.scss",
  ),
  "utf8",
);

test("la tarjeta Ubicación del lote aparece una sola vez después del resumen general", () => {
  assert.equal((detail.match(/<app-card-ubicacion-lote/g) || []).length, 1);
  assert.ok(
    detail.indexOf("<app-card-ubicacion-lote") > detail.indexOf("</section>"),
  );
  assert.match(card, /<h2>Ubicación del lote<\/h2>/);
});

test("la tarjeta no ofrece un cálculo normal y contempla estados operativos", () => {
  assert.doesNotMatch(card, /Calcular ubicación/i);
  for (const state of [
    "pending",
    "processing",
    "partial",
    "failed",
    "source_unavailable",
  ]) {
    assert.match(`${card}\n${cardTs}`, new RegExp(state));
  }
});

test("mantiene distancias y jurisdicciones operativas, y concentra metodología y observaciones en un diálogo", () => {
  assert.match(card, /distancia\(ubicacion\?\.localidadReferencia/);
  assert.match(card, /fuenteLabel/);
  assert.match(card, /conflictoManual/);
  assert.match(card, /jurisdiccionesSecundarias/);
  assert.match(card, /<p-dialog[\s\S]*?\[\(visible\)\]="infoVisible"/);
  assert.match(card, /\[ariaLabel\]="informationAriaLabel"/);
  assert.match(card, /@for \(warning of informationWarnings; track warning\)/);
  assert.doesNotMatch(card, /advertencias\?\.join/);
  assert.ok(
    card.indexOf("<p-dialog") > card.indexOf("jurisdiccionesSecundarias"),
  );
  assert.match(`${card}\n${cardCss}`, /44px/);
});

test("el indicador informa observaciones y el modal se cierra al cambiar de lote", () => {
  assert.match(cardTs, /informationObservationCount/);
  assert.match(cardTs, /hasInformationObservations/);
  assert.match(cardTs, /this\.infoVisible = false/);
  assert.match(card, /observation-count/);
  assert.match(cardTs, /key === conflictKey/);
  assert.match(cardTs, /warningKey/);
  assert.match(cardCss, /background: #754a08/);
  assert.match(
    cardCss,
    /@media \(max-width: 580px\)[\s\S]*?flex-direction: column/,
  );
});
