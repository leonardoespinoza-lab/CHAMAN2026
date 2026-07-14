const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const detail = fs.readFileSync(
  path.join(
    root,
    'sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/detalles-lote.component.html',
  ),
  'utf8',
);
const card = fs.readFileSync(
  path.join(
    root,
    'sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-ubicacion-lote/card-ubicacion-lote.component.html',
  ),
  'utf8',
);
const cardTs = fs.readFileSync(
  path.join(
    root,
    'sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-ubicacion-lote/card-ubicacion-lote.component.ts',
  ),
  'utf8',
);

test('la tarjeta Ubicación del lote aparece una sola vez después del resumen general', () => {
  assert.equal((detail.match(/<app-card-ubicacion-lote/g) || []).length, 1);
  assert.ok(detail.indexOf('<app-card-ubicacion-lote') > detail.indexOf('</section>'));
  assert.match(card, /<h2>Ubicación del lote<\/h2>/);
});

test('la tarjeta no ofrece un cálculo normal y contempla estados operativos', () => {
  assert.doesNotMatch(card, /Calcular ubicación/i);
  for (const state of ['pending', 'processing', 'partial', 'failed', 'source_unavailable']) {
    assert.match(`${card}\n${cardTs}`, new RegExp(state));
  }
});

test('distancias, fuente, conflicto manual y jurisdicciones secundarias son visibles', () => {
  assert.match(card, /distancia\(ubicacion\?\.localidadReferencia/);
  assert.match(card, /fuenteLabel/);
  assert.match(card, /conflictoManual/);
  assert.match(card, /jurisdiccionesSecundarias/);
});
