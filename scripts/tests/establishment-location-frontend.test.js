const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const establishmentTs = read(
  'sdc-app-chaman/src/app/main/modulo-productor/establecimientos/crear-editar-establecimientos/crear-editar-establecimientos.component.ts',
);
const establishmentHtml = read(
  'sdc-app-chaman/src/app/main/modulo-productor/establecimientos/crear-editar-establecimientos/crear-editar-establecimientos.component.html',
);
const lotTs = read(
  'sdc-app-chaman/src/app/main/modulo-productor/lotes/crear-editar-lote/crear-editar-lote.component.ts',
);

test('la busqueda del mapa queda declarada como orientativa', () => {
  assert.match(establishmentHtml, /La busqueda solo orienta la vista/);
  assert.match(establishmentHtml, /No se guardara como dato territorial definitivo/);
  assert.match(establishmentHtml, /GeoRef/);
});

test('el formulario no envia ubicacion administrativa manual', () => {
  assert.doesNotMatch(establishmentTs, /formControlName.*ubicacionAdministrativa/);
  assert.doesNotMatch(establishmentTs, /data\.ubicacionAdministrativa\s*=/);
  assert.doesNotMatch(establishmentTs, /completarUbicacionAdministrativaDesdePoligono/);
});

test('el lote no envia un departamento heredado y usa la ubicacion oficial del establecimiento', () => {
  assert.match(lotTs, /establecimientoSeleccionado\?\.ubicacionOficial/);
  assert.match(lotTs, /delete \(data as any\)\.idDepartamento/);
  assert.doesNotMatch(lotTs, /idDepartamento:\s*this\.form\?\.get\('idDepartamento'\)/);
});
