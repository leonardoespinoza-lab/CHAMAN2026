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
const editorPath = path.join(
  root,
  "sdc-app-chaman/src/app/main/modulo-productor/lotes/crear-editar-lote",
);
const editorTs = fs.readFileSync(
  path.join(editorPath, "crear-editar-lote.component.ts"),
  "utf8",
);
const editorHtml = fs.readFileSync(
  path.join(editorPath, "crear-editar-lote.component.html"),
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

test("la tarjeta separa cartografía canónica, override, fuente y fósforo no medido", () => {
  for (const value of [
    "Textura cartográfica canónica",
    "Override operativo",
    "canonicalTextureLabel",
    "operationalSourceLabel",
    "sourceLabel",
    "confidenceLabel",
    "depthLabel",
    "Fósforo disponible",
    "No medido",
  ]) {
    assert.match(`${card}\n${cardTs}`, new RegExp(value, "i"));
  }
});

test("el editor no inventa suelo ni lo reenvía durante una edición neutra", () => {
  assert.doesNotMatch(editorTs, /this\.cambioTipoSueloManual\(false\)/);
  assert.doesNotMatch(
    editorTs,
    /return desdePerfil \|\| desdeHuella \|\| desdeReferencia \|\| ['"]Franco['"]/,
  );
  assert.match(editorTs, /omitUnchangedSoilOverrides\(data\)/);
  assert.match(editorTs, /soilPayloadWasEdited\(name/);
  assert.match(editorTs, /sanitizeSoilLayers/);
  assert.doesNotMatch(editorTs, /shouldSynchronizeManualWaterValues/);
  for (const key of [
    "suelos",
    "capacidadDeCampo",
    "puntoMarchitez",
    "sueloReferencia",
    "texturaLixiviacion",
    "texturaEscorrentia",
  ]) {
    assert.match(editorTs, new RegExp(`['"]${key}['"]`));
  }
  assert.match(editorHtml, /Override manual opcional/);
});

test("un dato manual legacy nunca se rotula como confirmado", () => {
  assert.match(cardTs, /Dato legacy no confirmado/);
  assert.match(cardTs, /Alternativa legacy/);
  assert.match(cardTs, /isOperationalTextureConfirmed/);
  assert.match(card, /operationalTextureDetail/);
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

test("prioriza el bloque operativo y difiere servicios pesados e historial", () => {
  assert.match(
    detail,
    /@defer \(on viewport; on interaction\(loadServicesTrigger\); prefetch on idle\)/,
  );
  assert.match(detail, /#loadServicesTrigger/);
  assert.match(detail, /services-deferred-placeholder/);
  assert.match(
    detail,
    /@defer \(when verDrawerSiembras\) \{[\s\S]*?<app-drawer-listado-siembras/,
  );
  assert.ok(
    detail.indexOf("<app-card-suelo-ambiente") <
      detail.indexOf(
        "@defer (on viewport; on interaction(loadServicesTrigger); prefetch on idle)",
      ),
  );
});
