const fs = require('fs');
const path = require('path');
const { services: railwayServices } = require('./railway-services');

const manifestPath = path.join(__dirname, '..', 'deploy', 'environment-topology.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const requiredRoles = [
  'web',
  'api',
  'auth',
  'datos',
  'clima',
  'predicciones',
  'externa',
  'websocket',
  'ftp',
  'lora',
  'ndvi-worker',
  'meteo-worker',
  'mongodb',
  'redis',
];
const issues = [];

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

for (const role of requiredRoles) {
  if (!manifest.services.some((service) => service.role === role)) {
    issues.push(`Falta el rol requerido: ${role}`);
  }
}

for (const duplicate of duplicateValues(manifest.services.map((service) => service.role))) {
  issues.push(`Rol duplicado: ${duplicate}`);
}
for (const duplicate of duplicateValues(manifest.services.map((service) => service.production))) {
  issues.push(`Servicio productivo duplicado: ${duplicate}`);
}
for (const duplicate of duplicateValues(manifest.services.map((service) => service.testing))) {
  issues.push(`Servicio de testing duplicado: ${duplicate}`);
}

for (const service of manifest.services) {
  if (!service.role || !service.selector || !service.production || !service.testing || !service.port) {
    issues.push(`Definicion incompleta para ${service.role || 'rol desconocido'}`);
  }
  if (service.production === service.testing) {
    issues.push(`${service.role}: produccion y testing no pueden compartir nombre de servicio`);
  }
  if (service.selector.startsWith('sdc-') && !railwayServices[service.selector]) {
    issues.push(`${service.role}: CHAMAN_SERVICE no reconocido: ${service.selector}`);
  }
  if (service.versionPath && service.versionPath !== '/version') {
    issues.push(`${service.role}: versionPath debe ser /version`);
  }
  if (service.testingPromotion) {
    if (service.testingPromotion.mode !== 'frozen-at-baseline') {
      issues.push(`${service.role}: testingPromotion.mode no soportado`);
    }
    if (service.role !== 'lora') {
      issues.push(`${service.role}: solo testing-lora puede quedar congelado en este release`);
    }
    if (!/^[0-9a-f]{40}$/.test(service.testingPromotion.expectedSha || '')) {
      issues.push(`${service.role}: testingPromotion.expectedSha debe ser completo`);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(service.testingPromotion.deploymentId || '')) {
      issues.push(`${service.role}: testingPromotion.deploymentId invalido`);
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(service.testingPromotion.imageDigest || '')) {
      issues.push(`${service.role}: testingPromotion.imageDigest invalido`);
    }
    const shortSha = /^([0-9a-f]{7,40})\b/i.exec(service.testingPromotion.cliMessage || '')?.[1]?.toLowerCase();
    if (!shortSha || !service.testingPromotion.expectedSha?.startsWith(shortSha)) {
      issues.push(`${service.role}: testingPromotion.cliMessage no corresponde al SHA protegido`);
    }
    for (const field of ['railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId']) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(service.testingPromotion[field] || '')) {
        issues.push(`${service.role}: testingPromotion.${field} invalido`);
      }
    }
  }
  if (service.productionPromotion) {
    issues.push(`${service.role}: no se permiten excepciones de promocion en Produccion`);
  }
}

const meteoWorker = manifest.services.find((service) => service.role === 'meteo-worker');
if (meteoWorker) {
  if (meteoWorker.selector !== 'sdc-meteo-worker') {
    issues.push('meteo-worker: CHAMAN_SERVICE debe ser sdc-meteo-worker');
  }
  if (meteoWorker.rootDirectory !== 'sdc-meteo-worker') {
    issues.push('meteo-worker: Root Directory debe ser sdc-meteo-worker');
  }
  if (meteoWorker.configPath !== 'sdc-meteo-worker/railway.json') {
    issues.push('meteo-worker: configPath debe apuntar a su railway.json dedicado');
  }
  for (const safety of [
    'CHAMAN_METEO_ENABLED=true',
    'CHAMAN_METEO_IMPORT_ENABLED=false',
  ]) {
    if (!meteoWorker.testingSafety?.includes(safety)) {
      issues.push(`meteo-worker: falta guardrail de Testing ${safety}`);
    }
  }
}

const lora = manifest.services.find((service) => service.role === 'lora');
if (lora && !lora.testingSafety?.includes('LORAWAN_MQTT_ENABLED=false')) {
  issues.push('lora: Testing debe conservar LORAWAN_MQTT_ENABLED=false');
}
if (lora?.testingPromotion?.mode !== 'frozen-at-baseline') {
  issues.push('lora: testing-lora debe quedar frozen-at-baseline');
}

for (const selector of ['sdc-api-cliente', 'sdc-datos']) {
  const service = manifest.services.find((item) => item.selector === selector);
  if (service?.versionPath !== '/version') {
    issues.push(`${selector}: falta el contrato /version de la primera fase`);
  }
}

if (manifest.dataPolicy?.cloneDirection !== 'production-to-testing') {
  issues.push('La unica direccion de clonado admitida es production-to-testing');
}
if (manifest.dataPolicy?.promoteTestingDatabase !== false) {
  issues.push('La base de testing nunca debe promoverse completa a produccion');
}
if (manifest.codePromotion?.productionBranch !== 'main') {
  issues.push('La rama productiva declarada debe ser main');
}
if (!manifest.codePromotion?.requireSameCommitAcrossPromotedStatelessServices) {
  issues.push('Los servicios promovidos sin estado deben desplegar exactamente el mismo commit');
}

if (issues.length) {
  console.error('Topologia de despliegue invalida:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `Topologia OK: ${manifest.services.length} roles, bases aisladas y promocion por commit.`,
);
