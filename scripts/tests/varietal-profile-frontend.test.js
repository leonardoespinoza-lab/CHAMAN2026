const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const template = read(
  'sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/detalles-lote.component.html',
);
const component = read(
  'sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/detalles-lote.component.ts',
);
const resolver = read('sdc-modelos/src/motores/ficha-varietal.ts');
const entity = read('sdc-modelos/src/entidades/semilla.ts');
const schema = read('sdc-datos/src/entidades/semilla/modelos/schema.ts');

test('el lote ofrece una ficha varietal accesible y trazable', () => {
  assert.match(template, /label="Ficha de la variedad"/);
  assert.match(template, /header="Ficha de la variedad"/);
  assert.match(component, /resolverFichaVarietal\(this\.siembra\?\.semilla\)/);
  assert.match(template, /Documentos y bibliografia/);
  assert.match(template, /Uso responsable del dato/);
});

test('la ficha distingue identidad oficial, evidencia y calibracion', () => {
  assert.match(entity, /export interface IFichaVarietalPersistida/);
  assert.match(entity, /"referencia_documental"/);
  assert.match(entity, /"calibrada_localmente"/);
  assert.match(entity, /"validada"/);
  assert.match(resolver, /nombreOficialVerificado/);
  assert.match(resolver, /coberturaPorcentaje/);
  assert.match(resolver, /no lo atribuye a un obtentor/);
});

test('los documentos quedan persistibles sin activar decisiones automaticas', () => {
  assert.match(entity, /export interface IDocumentoFichaVarietal/);
  assert.match(schema, /fichaVarietal\?: ISemilla\['fichaVarietal'\]/);
  assert.match(resolver, /resolverFichaTermicaVarietal/);
  assert.doesNotMatch(resolver, /permiteObjetivoAutomatico:\s*true/);
});
