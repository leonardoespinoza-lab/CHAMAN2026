const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('../../sdc-app-chaman/node_modules/typescript');

const appRoot = path.resolve(__dirname, '../../sdc-app-chaman');
const source = fs.readFileSync(path.join(appRoot, 'src/app/environments/environment.prod.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function environment({ platform = 'web', hostname = 'localhost', runtime = {} } = {}) {
  const result = {};
  vm.runInNewContext(compiled, {
    exports: result,
    location: { hostname },
    __CHAMAN_CONFIG__: runtime,
    require: (name) => {
      if (name === '@capacitor/core') {
        return { Capacitor: { isNativePlatform: () => platform !== 'web' } };
      }
      if (name === './version') return { v: '1.6.0' };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return result;
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: bundled app resolves production without Railway startup scripts`, () => {
    const config = environment({ platform });
    assert.equal(config.API, 'https://chaman-api-production.up.railway.app/sdc-quimica');
    assert.equal(config.WS, 'wss://chaman-websocket-production.up.railway.app/sdc-websocket');
    assert.equal(config.TILES_URL, `${config.API}/data`);
    assert.equal(config.WATER_DEMAND_CARD_ENABLED, true);
    assert.equal(config.COOKIE_AUTH, false);
    assert.equal(config.VERSION, '1.6.0');
  });
}

test('explicit flags, including false, take precedence over native defaults', () => {
  for (const value of [false, 'false', null, 0, 'invalid']) {
    const config = environment({ platform: 'ios', runtime: { WATER_DEMAND_CARD_ENABLED: value } });
    assert.equal(config.WATER_DEMAND_CARD_ENABLED, false);
  }
  for (const value of [true, 'true']) {
    assert.equal(environment({ runtime: { WATER_DEMAND_CARD_ENABLED: value } }).WATER_DEMAND_CARD_ENABLED, true);
  }
});

test('productive web keeps its existing runtime flag behavior', () => {
  const config = environment({ hostname: 'app.chamanagro.ar' });
  assert.equal(config.API, 'https://chaman-api-production.up.railway.app/sdc-quimica');
  assert.equal(config.WATER_DEMAND_CARD_ENABLED, false);
  assert.equal(config.COOKIE_AUTH, false);
  assert.equal(environment({ hostname: 'app.chamanagro.ar', runtime: { WATER_DEMAND_CARD_ENABLED: true } }).WATER_DEMAND_CARD_ENABLED, true);
});

test('testing web remains connected only to testing fallbacks', () => {
  const config = environment({ hostname: 'testing-web-testing-dc8e.up.railway.app' });
  assert.equal(config.API, 'https://testing-api-testing.up.railway.app/sdc-quimica-test');
  assert.equal(config.WS, 'wss://testing-websocket-testing.up.railway.app/sdc-websocket-test');
  assert.equal(config.WATER_DEMAND_CARD_ENABLED, false);
});

test('unknown web host does not silently connect to Production', () => {
  const config = environment({ hostname: 'unknown.invalid' });
  assert.equal(config.API, '');
  assert.equal(config.WS, '');
  assert.equal(config.TILES_URL, '');
});

test('explicit runtime endpoints and auth settings remain authoritative', () => {
  const config = environment({ platform: 'ios', runtime: {
    API: 'https://api.example.invalid', WS: 'wss://ws.example.invalid',
    TILES_URL: 'https://tiles.example.invalid', COOKIE_AUTH: true,
  } });
  assert.equal(config.API, 'https://api.example.invalid');
  assert.equal(config.WS, 'wss://ws.example.invalid');
  assert.equal(config.TILES_URL, 'https://tiles.example.invalid');
  assert.equal(config.COOKIE_AUTH, true);
});

test('release bundles its own frontend and does not load an old remote site', () => {
  const capacitor = fs.readFileSync(path.join(appRoot, 'capacitor.config.ts'), 'utf8');
  assert.match(capacitor, /webDir:\s*'dist\/browser'/);
  assert.doesNotMatch(capacitor, /\burl\s*:/);
  assert.match(fs.readFileSync(path.join(appRoot, 'public/runtime-config.bootstrap'), 'utf8'), /__CHAMAN_CONFIG__/);
});
