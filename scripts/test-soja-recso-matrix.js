const assert = require('assert/strict');
const {
  PROFILES,
  buildResistance,
  varietyKey,
} = require('./migrations/20260712-soja-recso-matrix-v2');

assert.ok(PROFILES.size >= 123, 'La matriz debe priorizar los 123 cultivares RECSO 2024/25.');
assert.equal(varietyKey('33 E 22 SE'), varietyKey('DM 33E22 SE'));
assert.equal(varietyKey('ACA NEO 40S22 SE'), varietyKey('NEO 40S22 SE'));

const known = buildResistance({
  variedad: '33 E 22 SE',
  resistencia: [
    {
      idEnfermedad: 'soja.fin_ciclo',
      enfermedad: 'Fin de Ciclo',
      estado: 'desconocida',
    },
  ],
});
assert.ok(known.find((item) => item.idEnfermedad === 'soja.fin_ciclo'));
assert.equal(
  known.find((item) => item.idEnfermedad === 'soja.cancro_tallo').perfil,
  'R',
);
assert.ok(
  known
    .find((item) => item.idEnfermedad === 'soja.phytophthora')
    .detalleSanitario.patotiposResistentes.includes('1'),
);
assert.equal(
  known.find((item) => item.idEnfermedad === 'soja.cancro_tallo').campaniaFuente,
  '2024-2025',
);

const unknown = buildResistance({ variedad: 'CULTIVAR SIN FUENTE' });
assert.equal(unknown.length, 4);
assert.ok(unknown.every((item) => item.estado === 'desconocida'));

console.log('Matriz RECSO soja: 5 comprobaciones aprobadas.');
