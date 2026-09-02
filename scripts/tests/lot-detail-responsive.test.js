const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..", "..");
const detailCss = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/detalles-lote.component.scss",
  ),
  "utf8",
);
const weedsCss = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-malezas/card-malezas.component.scss",
  ),
  "utf8",
);
const waterHtml = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-demanda-hidrica/card-demanda-hidrica.component.html",
  ),
  "utf8",
);
const waterTs = fs.readFileSync(
  path.join(
    root,
    "sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-demanda-hidrica/card-demanda-hidrica.component.ts",
  ),
  "utf8",
);

test("el detalle del lote evita desborde horizontal y respeta el viewport movil", () => {
  assert.match(detailCss, /height:\s*100dvh/);
  assert.match(detailCss, /overflow-x:\s*hidden/);
  assert.match(detailCss, /max-width:\s*100%/);
  assert.match(detailCss, /@media\s*\(max-width:\s*720px\)/);
  assert.match(detailCss, /env\(safe-area-inset-top\)/);
});

test("las acciones se apilan sin recortar textos en pantallas angostas", () => {
  assert.match(detailCss, /\.lote-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(
    detailCss,
    /\.services-stack \.p-button-label\s*\{[\s\S]*?white-space:\s*normal/,
  );
  assert.match(
    detailCss,
    /\.lot-primary-actions \.p-button\s*\{[\s\S]*?width:\s*100%/,
  );
});

test("malezas conserva altura propia y presenta resultados compactos", () => {
  assert.match(weedsCss, /\.weeds-card\s*\{[\s\S]*?min-height:\s*0/);
  assert.doesNotMatch(weedsCss, /\.weeds-card\s*\{[\s\S]*?min-height:\s*100%/);
  assert.match(weedsCss, /\.weed-action-card\s*\{[\s\S]*?min-height:\s*0/);
  assert.match(
    detailCss,
    /\.sanitary-monitoring-row\s*\{[\s\S]*?align-items:\s*start/,
  );
});

test("la imagen hidrica optimizada se precarga y conserva respaldo PNG", () => {
  assert.match(waterHtml, /<source \[srcset\]="imageUrl" type="image\/webp"/);
  assert.match(waterHtml, /\[src\]="imageFallbackUrl"/);
  assert.match(waterHtml, /loading="eager"/);
  assert.match(waterHtml, /fetchpriority="high"/);
  assert.match(waterTs, /private preloadImage\(\): void/);
  assert.match(waterTs, /image\.src = url/);
});

test("todos los cultivos tienen un WebP liviano", () => {
  const directory = path.join(
    root,
    "sdc-app-chaman/public/images/water-demand",
  );
  const expected = [
    "arveja",
    "cebada",
    "maiz",
    "manzano",
    "papa",
    "pecan",
    "peral",
    "soja",
    "trigo",
    "vid",
  ];
  for (const crop of expected) {
    const file = path.join(directory, `${crop}.webp`);
    const contents = fs.readFileSync(file);
    assert.ok(contents.length < 150 * 1024, `${crop}.webp supera 150 KiB`);
    assert.equal(contents.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(contents.subarray(8, 12).toString("ascii"), "WEBP");
  }
});
