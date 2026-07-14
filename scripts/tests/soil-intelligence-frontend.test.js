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
const cardPath = path.join(
  root,
  "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-suelo-ambiente",
);
const card = fs.readFileSync(
  path.join(cardPath, "card-suelo-ambiente.component.html"),
  "utf8",
);
const cardTs = fs.readFileSync(
  path.join(cardPath, "card-suelo-ambiente.component.ts"),
  "utf8",
);
const cardCss = fs.readFileSync(
  path.join(cardPath, "card-suelo-ambiente.component.scss"),
  "utf8",
);

test("Suelo y ambiente aparece una sola vez a nivel de lote", () => {
  assert.equal((detail.match(/<app-card-suelo-ambiente/g) || []).length, 1);
  assert.ok(
    detail.indexOf("<app-card-suelo-ambiente") >
      detail.indexOf("<app-card-ubicacion-lote"),
  );
  assert.match(card, /<h2>Suelo y ambiente<\/h2>/);
});

test("la tarjeta informa textura, fuente, confianza, profundidad y fósforo no medido", () => {
  for (const value of [
    "Textura operativa",
    "Estimación cartográfica",
    "SoilGrids:",
    "sourceLabel",
    "confidenceLabel",
    "depthLabel",
    "Fósforo disponible",
    "No medido",
  ]) {
    assert.match(`${card}\n${cardTs}`, new RegExp(value, "i"));
  }
});

test("renderiza composición por profundidad, estados, nulls y móvil sin botón Calcular", () => {
  assert.match(card, /Composición por profundidad/);
  assert.match(card, /fieldCapacityPercentage/);
  for (const state of [
    "pending",
    "processing",
    "partial",
    "failed",
    "source_unavailable",
  ]) {
    assert.match(`${card}\n${cardTs}`, new RegExp(state));
  }
  assert.doesNotMatch(card, /label="Calcular"/i);
  assert.match(cardCss, /@media \(max-width: 620px\)/);
});
