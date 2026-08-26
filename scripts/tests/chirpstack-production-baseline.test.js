const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const chirpstack = path.join(root, 'deploy', 'railway', 'chirpstack');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const regionChannels = (value) =>
  [...value.matchAll(/\[\[regions\.gateway\.channels\]\]\s+frequency=(\d+)/g)].map(
    (match) => Number(match[1]),
  );

test('Network Server keeps Kleppe FSB1 and the existing FSB2 fleet independent', () => {
  const server = read('deploy', 'railway', 'chirpstack', 'server', 'chirpstack.toml');
  const region0 = read('deploy', 'railway', 'chirpstack', 'server', 'region_au915_0.toml');
  const region1 = read('deploy', 'railway', 'chirpstack', 'server', 'region_au915_1.toml');

  assert.match(server, /enabled_regions=\["au915_0", "au915_1"\]/);

  assert.match(region0, /id="au915_0"/);
  assert.match(region0, /channels 0-7 \+ 64/);
  assert.match(region0, /topic_prefix="au915_0"/);
  assert.match(region0, /enabled_uplink_channels=\[0, 1, 2, 3, 4, 5, 6, 7, 64\]/);
  assert.deepEqual(regionChannels(region0), [
    915200000, 915400000, 915600000, 915800000, 916000000,
    916200000, 916400000, 916600000, 915900000,
  ]);

  assert.match(region1, /id="au915_1"/);
  assert.match(region1, /channels 8-15 \+ 65/);
  assert.match(region1, /topic_prefix="au915_1"/);
  assert.match(region1, /enabled_uplink_channels=\[8, 9, 10, 11, 12, 13, 14, 15, 65\]/);
  assert.deepEqual(regionChannels(region1), [
    916800000, 917000000, 917200000, 917400000, 917600000,
    917800000, 918000000, 918200000, 917500000,
  ]);
});

test('Basic Station bridge remains bound to AU915 FSB2', () => {
  const bridge = read(
    'deploy', 'railway', 'chirpstack', 'gateway-bridge-basicstation',
    'chirpstack-gateway-bridge.toml',
  );

  assert.match(bridge, /frequencies=\[\s*916800000,[\s\S]*918200000,/);
  assert.match(bridge, /frequency=917500000/);
  assert.match(bridge, /event_topic_template="au915_1\/gateway\//);
  assert.match(bridge, /state_topic_template="au915_1\/gateway\//);
  assert.match(bridge, /command_topic_template="au915_1\/gateway\//);
  assert.doesNotMatch(bridge, /au915_0\/gateway/);
});

test('Mosquitto authorizes both region prefixes without embedding credentials', () => {
  const acl = read('deploy', 'railway', 'chirpstack', 'mosquitto', 'acl');
  const config = read('deploy', 'railway', 'chirpstack', 'mosquitto', 'mosquitto.conf');
  const entrypoint = read(
    'deploy', 'railway', 'chirpstack', 'mosquitto', 'docker-entrypoint-chaman.sh',
  );

  assert.match(acl, /topic readwrite au915_0\/#/);
  assert.match(acl, /topic readwrite au915_1\/#/);
  assert.match(acl, /topic readwrite au915_0\/gateway\/#/);
  assert.match(acl, /topic readwrite au915_1\/gateway\/#/);
  assert.match(acl, /user chirpstack/);
  assert.match(acl, /__MQTT_GATEWAY_USERNAME__/);

  assert.match(config, /per_listener_settings true/);
  assert.match(config, /listener 1883 0\.0\.0\.0/);
  assert.match(config, /allow_anonymous false/);
  assert.match(config, /password_file \/run\/mosquitto\/passwords/);
  assert.match(entrypoint, /MQTT_CHIRPSTACK_PASSWORD/);
  assert.match(entrypoint, /MQTT_GATEWAY_PASSWORD/);
});

test('each Docker build context contains every local COPY source', () => {
  const contexts = ['server', 'gateway-bridge-basicstation', 'mosquitto', 'postgres', 'redis'];

  for (const context of contexts) {
    const contextDir = path.join(chirpstack, context);
    const dockerfile = fs.readFileSync(path.join(contextDir, 'Dockerfile'), 'utf8');
    const copies = [...dockerfile.matchAll(/^COPY\s+(?!--from=)(\S+)\s+\S+/gm)]
      .map((match) => match[1]);

    for (const source of copies) {
      assert.equal(
        fs.existsSync(path.join(contextDir, source)),
        true,
        `${context}/Dockerfile references missing ${source}`,
      );
    }
  }
});

test('the preserved tree contains no private key or generated runtime material', () => {
  const pending = [chirpstack];
  const files = [];

  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else files.push(absolute);
    }
  }

  for (const file of files) {
    const relative = path.relative(chirpstack, file).replaceAll('\\', '/');
    assert.doesNotMatch(relative, /(?:^|\/)(?:ca-key\.pem|server\.key|.+-key\.pem|.+\.p12)$/i);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  }

  const ignore = read('.gitignore');
  assert.match(ignore, /\.railway-chirpstack-credentials\.txt/);
  assert.match(ignore, /\*\*\/ca-key\.pem/);
  assert.match(ignore, /deploy\/railway\/chirpstack\/\*\*\/runtime\//);
});

test('production manifest records the deployment guardrail and both bands', () => {
  const manifest = JSON.parse(read('deploy', 'production-baseline-2026-08-26.json'));

  assert.equal(
    manifest.baseline.applicationCommit,
    '8e9d0f2df2fab89f6bd7b7fae5e6b519bffb0be6',
  );
  assert.equal(manifest.deploymentRisk.githubConnectedServicesOnMain, 11);
  assert.equal(manifest.deploymentRisk.waitForCiBeforeDeploy, false);
  assert.equal(manifest.chamanServices.length, 11);
  assert.equal(manifest.chirpstackServices.length, 5);
  assert.equal(manifest.recoveryStatus.snapshotOnly, true);
  assert.equal(manifest.recoveryStatus.deployable, false);
  assert.deepEqual(manifest.lorawanChannelPlan.au915_0.uplinkChannels, [
    0, 1, 2, 3, 4, 5, 6, 7, 64,
  ]);
  assert.deepEqual(manifest.lorawanChannelPlan.au915_1.uplinkChannels, [
    8, 9, 10, 11, 12, 13, 14, 15, 65,
  ]);

  for (const service of [...manifest.chamanServices, ...manifest.chirpstackServices]) {
    assert.equal('activeDeploymentId' in service, false);
    assert.equal('activeDeploymentMode' in service, true);
    assert.equal('configuredSource' in service, true);
  }
  assert.doesNotMatch(JSON.stringify(manifest.excludedLocalState), /C:\/|C:\\|CHAMAN2026/i);
});

test('Mosquitto manifest hashes verify both active CRLF and staged LF provenance', () => {
  const manifest = JSON.parse(read('deploy', 'production-baseline-2026-08-26.json'));
  const hashes = manifest.staticSourceHashesSha256.mosquitto.stagedGitBlobLf;

  for (const [name, expected] of Object.entries(hashes)) {
    const value = fs.readFileSync(path.join(chirpstack, 'mosquitto', name));
    assert.equal(crypto.createHash('sha256').update(value).digest('hex'), expected);
  }
});

test('known Basic Station authentication gap is explicit and deployment-blocking', () => {
  const bridge = read(
    'deploy', 'railway', 'chirpstack', 'gateway-bridge-basicstation',
    'chirpstack-gateway-bridge.toml',
  );
  const warning = read(
    'deploy', 'railway', 'chirpstack', 'gateway-bridge-basicstation',
    'DO-NOT-DEPLOY.md',
  );
  const manifest = JSON.parse(read('deploy', 'production-baseline-2026-08-26.json'));

  assert.match(bridge, /username=""/);
  assert.match(bridge, /password=""/);
  assert.match(warning, /Snapshot only — do not deploy/);
  assert.equal(
    manifest.recoveryStatus.blockers.some((value) =>
      /Basic Station MQTT credentials are empty/.test(value),
    ),
    true,
  );
});
