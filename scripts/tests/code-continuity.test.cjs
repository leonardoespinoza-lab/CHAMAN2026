const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePaths } = require('../check-code-continuity.cjs');
const policy = {
  baseline: 'a'.repeat(40),
  allowedChanges: ['src/engine.ts', 'src/map.ts', 'src/styles.scss'],
  protectedPaths: ['src/map.ts', 'src/auth'],
  protectStyles: true,
};
test('acepta solo el archivo de la tarea', () =>
  validatePaths(policy, ['src/engine.ts']));
test('rechaza archivos inesperados y renombres de destino', () => {
  assert.throws(
    () => validatePaths(policy, ['src/other.ts']),
    /fuera del alcance/,
  );
});
test('la lista permitida no puede anular un mapa protegido', () => {
  assert.throws(() => validatePaths(policy, ['src/map.ts']), /protegida/);
});
test('protege estilos aunque se agreguen al alcance', () => {
  assert.throws(
    () => validatePaths(policy, ['src/styles.scss']),
    /Estilo protegido/,
  );
});
test('protege descendientes de permisos', () => {
  assert.throws(
    () =>
      validatePaths({ ...policy, allowedChanges: ['src/auth/guard.ts'] }, [
        'src/auth/guard.ts',
      ]),
    /protegida/,
  );
});
test('exige base completa, no una rama variable', () => {
  assert.throws(
    () => validatePaths({ ...policy, baseline: 'main' }, []),
    /Base Git/,
  );
});
test('exige alcance y protecciones no vacias', () => {
  assert.throws(() => validatePaths({ ...policy, allowedChanges: [] }, []));
  assert.throws(() => validatePaths({ ...policy, protectedPaths: [] }, []));
});
for (const invalid of [
  '../file',
  '/file',
  'src/../file',
  'src\\file',
  ':file',
  '*',
  'src//file',
]) {
  test(`rechaza rutas ambiguas: ${invalid}`, () => {
    assert.throws(
      () => validatePaths({ ...policy, allowedChanges: [invalid] }, []),
      /Ruta no admisible/,
    );
  });
}
