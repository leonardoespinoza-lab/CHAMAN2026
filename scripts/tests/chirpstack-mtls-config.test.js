const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Mosquitto isolates internal password auth from external certificate auth', () => {
  const config = read('deploy', 'railway', 'chirpstack', 'mosquitto', 'mosquitto.conf');
  const entrypoint = read(
    'deploy',
    'railway',
    'chirpstack',
    'mosquitto',
    'docker-entrypoint-chaman.sh',
  );
  const acl = read('deploy', 'railway', 'chirpstack', 'mosquitto', 'gateway-acl');

  assert.match(config, /per_listener_settings true/);
  assert.doesNotMatch(
    config.split('listener 1883 0.0.0.0')[0],
    /allow_zero_length_clientid/,
    'security settings before the first explicit listener create a duplicate default listener',
  );
  assert.match(config, /listener 1883 0\.0\.0\.0[\s\S]*password_file/);
  assert.match(config, /listener 1883 0\.0\.0\.0[\s\S]*allow_zero_length_clientid false/);
  assert.match(entrypoint, /MQTT_TLS_CLIENT_AUTH:=password/);
  assert.match(entrypoint, /listener 8883 0\.0\.0\.0[\s\S]*allow_zero_length_clientid false/);
  assert.match(entrypoint, /require_certificate true/);
  assert.match(entrypoint, /use_identity_as_username true/);
  assert.match(entrypoint, /acl_file \/run\/mosquitto\/gateway-acl/);
  assert.match(acl, /pattern readwrite \+\/gateway\/%u\/#/);
});

test('ChirpStack receives the CA and signs one certificate per gateway', () => {
  const entrypoint = read(
    'deploy',
    'railway',
    'chirpstack',
    'server',
    'docker-entrypoint-chaman.sh',
  );

  assert.match(entrypoint, /CHIRPSTACK_GATEWAY_CA_B64/);
  assert.match(entrypoint, /CHIRPSTACK_GATEWAY_CA_KEY_B64/);
  assert.match(entrypoint, /\[gateway\]/);
  assert.match(entrypoint, /client_cert_lifetime="12months"/);
  assert.match(entrypoint, /ca_cert="\/run\/chirpstack\/certs\/ca\.pem"/);
  assert.match(entrypoint, /ca_key="\/run\/chirpstack\/certs\/ca-key\.pem"/);
});

test('ChirpStack accepts both AU915 topic identifiers used by the SG50 fleet', () => {
  const config = read(
    'deploy',
    'railway',
    'chirpstack',
    'server',
    'configuration',
    'chirpstack.toml',
  );
  const region0 = read(
    'deploy',
    'railway',
    'chirpstack',
    'server',
    'configuration',
    'region_au915_0.toml',
  );
  const region1 = read(
    'deploy',
    'railway',
    'chirpstack',
    'server',
    'configuration',
    'region_au915_1.toml',
  );

  assert.match(config, /enabled_regions=\["au915_0", "au915_1"\]/);
  assert.match(region0, /id="au915_0"/);
  assert.match(region0, /topic_prefix="au915_0"/);
  assert.match(region1, /id="au915_1"/);
  assert.match(region1, /topic_prefix="au915_1"/);
  assert.match(region1, /client_id="chirpstack-au915-1"/);

  const expectedChannels = [
    916800000, 917000000, 917200000, 917400000, 917600000,
    917800000, 918000000, 918200000, 917500000,
  ];
  for (const frequency of expectedChannels) {
    assert.match(region0, new RegExp(`frequency=${frequency}`));
    assert.match(region1, new RegExp(`frequency=${frequency}`));
  }
});

test('PKI generator never creates a shared gateway client key', () => {
  const generator = read('scripts', 'generate-chirpstack-mtls-pki.py');
  assert.match(generator, /ChirpStack creates a different client certificate and key/);
  assert.doesNotMatch(generator, /client-key\.pem/);
  assert.match(generator, /SubjectAlternativeName/);
  assert.match(generator, /ExtendedKeyUsageOID\.SERVER_AUTH/);
});
