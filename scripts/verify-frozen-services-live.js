const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { validateFrozenDeploymentList } = require('./release-safety');

function run(executable, args, { cwd, label }) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label}: comando falló con estado ${result.status}`);
  }
  return String(result.stdout || '').trim();
}

function verifyFrozenServicesLive(
  manifest,
  {
    root = path.join(__dirname, '..'),
    railwayCli = process.env.CHAMAN_RAILWAY_CLI || 'railway',
    runCommand = run,
  } = {},
) {
  const frozen = manifest.services.filter((service) => service.deploymentMode === 'frozen');
  return frozen.map((service) => {
    const raw = runCommand(
      railwayCli,
      [
        'deployment',
        'list',
        '--service',
        service.railwayServiceId,
        '--environment',
        service.railwayEnvironmentId,
        '--project',
        service.railwayProjectId,
        '--json',
      ],
      { cwd: root, label: `${service.role}: consulta Railway live` },
    );
    let deployments;
    try {
      deployments = JSON.parse(raw);
    } catch {
      throw new Error(`${service.role}: Railway no devolvió JSON válido`);
    }
    const rawVariables = runCommand(
      railwayCli,
      [
        'variables',
        '--service',
        service.railwayServiceId,
        '--environment',
        service.railwayEnvironmentId,
        '--project',
        service.railwayProjectId,
        '--json',
      ],
      { cwd: root, label: `${service.role}: variables Railway live` },
    );
    let variables;
    try {
      variables = JSON.parse(rawVariables);
    } catch {
      throw new Error(`${service.role}: Railway no devolvió variables JSON válidas`);
    }
    const configuredMqtt = variables?.LORAWAN_MQTT_ENABLED;
    const mqttValue = configuredMqtt && typeof configuredMqtt === 'object'
      ? configuredMqtt.value
      : configuredMqtt;
    if (String(mqttValue).trim().toLowerCase() !== 'false') {
      throw new Error(`${service.role}: LORAWAN_MQTT_ENABLED debe permanecer false`);
    }
    const shortSha = service.expectedCliMessage.split(/\s+/, 1)[0];
    const gitResolvedSha = runCommand(
      'git',
      ['rev-parse', `${shortSha}^{commit}`],
      { cwd: root, label: `${service.role}: resolución Git` },
    );
    return {
      ...validateFrozenDeploymentList(service, deployments, gitResolvedSha),
      mqttDisabled: true,
    };
  });
}

module.exports = { verifyFrozenServicesLive };
