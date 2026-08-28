const services = {
  'sdc-datos': {
    aliases: ['chaman-datos', 'datos'],
    path: 'sdc-datos',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-auth': {
    aliases: ['chaman-auth', 'auth'],
    path: 'sdc-auth',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-api-clima': {
    aliases: ['chaman-clima', 'clima'],
    path: 'sdc-api-clima',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-api-predicciones': {
    aliases: ['chaman-predicciones', 'predicciones'],
    path: 'sdc-api-predicciones',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-api-cliente': {
    aliases: ['chaman-api', 'api', 'cliente'],
    path: 'sdc-api-cliente',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-api-externa': {
    aliases: ['chaman-externa', 'externa', 'api-externa'],
    path: 'sdc-api-externa',
    install: 'npm install',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-api-lora': {
    aliases: ['chaman-lora', 'lora', 'lorawan'],
    path: 'sdc-api-lora',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-websocket': {
    aliases: ['chaman-websocket', 'websocket', 'ws'],
    path: 'sdc-websocket',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-ftp': {
    aliases: ['chaman-ftp', 'ftp', 'timelapse-ftp', 'time-lapse-ftp'],
    path: 'sdc-ftp',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm run start:prod',
  },
  'sdc-app-chaman': {
    aliases: ['CHAMAN2026', 'chaman-web', 'web', 'app'],
    path: 'sdc-app-chaman',
    install: 'npm ci --legacy-peer-deps',
    build: 'npm run build',
    start: 'node scripts/serve-static.js sdc-app-chaman/dist',
  },
  'sdc-ndvi-worker': {
    aliases: ['chaman-ndvi-worker', 'ndvi-worker', 'ndvi'],
    path: 'sdc-ndvi-worker',
    install: 'python -m pip install --upgrade pip && python -m pip install -r requirements.txt',
    build: 'python -m py_compile worker.py calcular_ndvi.py recorte.py storage.py config.py geo.py health.py cleaner.py',
    start: 'python worker.py',
  },
  'sdc-meteo-worker': {
    aliases: ['chaman-meteo-worker', 'meteo-worker', 'chaman-meteo'],
    path: 'sdc-meteo-worker',
    install: 'python -m pip install --upgrade pip && python -m pip install -r requirements.txt',
    build:
      'python -m py_compile worker.py cds_client.py calculations.py config.py health.py',
    start: 'python worker.py',
  },
  'sdc-weed-ai': {
    aliases: ['chaman-weed-ai', 'weed-ai', 'ia-malezas'],
    path: 'sdc-weed-ai',
    install: 'python -m pip install --upgrade pip && python -m pip install -r requirements.txt',
    build: 'python -m py_compile main.py start.py',
    start: 'python start.py',
  },
};

function getServiceName() {
  return process.env.CHAMAN_SERVICE || process.env.RAILWAY_SERVICE_NAME || '';
}

function resolveService() {
  const requested = getServiceName().trim();
  const normalized = requested.toLowerCase();

  for (const [name, config] of Object.entries(services)) {
    const aliases = [name, ...config.aliases].map((value) => value.toLowerCase());
    if (aliases.includes(normalized)) {
      return { name, ...config };
    }
  }

  const expected = Object.entries(services)
    .map(([name, config]) => `${name} (${config.aliases.join(', ')})`)
    .join('\n- ');

  throw new Error(
    `CHAMAN_SERVICE no valido o no definido: "${requested}". Valores esperados:\n- ${expected}`,
  );
}

module.exports = {
  resolveService,
  services,
};
