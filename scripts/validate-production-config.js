const SERVICE_ALIASES = {
  'sdc-app-chaman': 'web',
  'chaman-web': 'web',
  web: 'web',
  'sdc-api-cliente': 'api',
  'chaman-api': 'api',
  api: 'api',
  'sdc-auth': 'auth',
  auth: 'auth',
  'sdc-datos': 'datos',
  datos: 'datos',
  'sdc-api-predicciones': 'predicciones',
  predicciones: 'predicciones',
  'sdc-api-clima': 'clima',
  clima: 'clima',
  'sdc-api-lora': 'lora',
  lora: 'lora',
  'sdc-api-externa': 'externa',
  externa: 'externa',
  'sdc-websocket': 'websocket',
  websocket: 'websocket',
  'sdc-ndvi-worker': 'ndvi-worker',
  'ndvi-worker': 'ndvi-worker',
  'sdc-meteo-worker': 'meteo-worker',
  'meteo-worker': 'meteo-worker',
};

const BACKEND_SERVICES = new Set([
  'api',
  'auth',
  'datos',
  'predicciones',
  'clima',
  'lora',
  'externa',
  'websocket',
]);

const SERVICE_REQUIRED = {
  web: ['CHAMAN_WEB_API_URL'],
  api: [
    'API_DATOS',
    'API_AUTH',
    'API_PREDICCIONES',
    'API_CLIMA',
    'AUTH_CLIENT_ID',
    'AUTH_CLIENT_SECRET',
    'SOIL_INTELLIGENCE_INTERNAL_TOKEN',
    'AGROMETEO_INTERNAL_TOKEN',
    'OPEN_METEO_API_KEY',
    'CHAMAN_RELEASE_VERSION',
  ],
  auth: ['API_DATOS', 'CLIENT_ID_INICIAL', 'CLIENT_SECRET_INICIAL'],
  datos: [
    'MONGO_URI',
    'SOIL_INTELLIGENCE_INTERNAL_TOKEN',
    'AGROMETEO_INTERNAL_TOKEN',
    'OPEN_METEO_API_KEY',
    'CHAMAN_RELEASE_VERSION',
  ],
  predicciones: [
    'API_DATOS',
    'API_CLIMA',
    'SOIL_INTELLIGENCE_INTERNAL_TOKEN',
    'AGROMETEO_INTERNAL_TOKEN',
    'OPEN_METEO_API_KEY',
  ],
  clima: [
    'API_DATOS',
    'SOIL_INTELLIGENCE_INTERNAL_TOKEN',
    'AGROMETEO_INTERNAL_TOKEN',
    'OPEN_METEO_API_KEY',
  ],
  lora: ['API_DATOS'],
  externa: [
    'API_DATOS',
    'NDVI_WORKER_TOKEN',
    'SOIL_INTELLIGENCE_INTERNAL_TOKEN',
  ],
  websocket: ['API_AUTH', 'API_DATOS', 'CORS_ORIGINS'],
  'ndvi-worker': ['REDIS_HOST', 'API_EXTERNA_URL', 'NDVI_WORKER_TOKEN'],
  'meteo-worker': [
    'API_DATOS',
    'REDIS_HOST',
    'CHAMAN_METEO_INTERNAL_TOKEN',
    'CHAMAN_METEO_IMPORT_ENABLED',
  ],
};

const FORBIDDEN_VALUES = {
  AUTH_CLIENT_SECRET: new Set(['', '1', 'change-me', '<change-me>']),
  CLIENT_SECRET_INICIAL: new Set(['', '1', 'change-me', '<change-me>']),
  NDVI_WORKER_TOKEN: new Set(['', '1', 'change-me', '<change-me>']),
  SOIL_INTELLIGENCE_INTERNAL_TOKEN: new Set([
    '',
    '1',
    'change-me',
    '<change-me>',
  ]),
  AGROMETEO_INTERNAL_TOKEN: new Set(['', '1', 'change-me', '<change-me>']),
  OPEN_METEO_API_KEY: new Set(['', '1', 'change-me', '<change-me>']),
  CHAMAN_METEO_INTERNAL_TOKEN: new Set(['', '1', 'change-me', '<change-me>']),
  CDS_API_KEY: new Set(['', '1', 'change-me', '<change-me>']),
  OPEN_METEO_ARCHIVE_API_KEY: new Set(['1', 'change-me', '<change-me>']),
  TIMELAPSE_ADMIN_TOKEN: new Set(['1', 'change-me', '<change-me>']),
};

function getService() {
  const raw =
    process.env.CHAMAN_SERVICE || process.env.SERVICE || process.argv[2] || '';
  const normalized = raw.trim();
  if (!normalized) return '';
  return SERVICE_ALIASES[normalized] || normalized;
}

function hasValue(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function getValue(name) {
  return String(process.env[name] || '').trim();
}

function isAngularPlaceholder(value) {
  return /^<[^<>]+>$/.test(String(value || '').trim());
}

function isPublicRailwayUrl(value) {
  return /https?:\/\/[^/\s]*\.up\.railway\.app/i.test(value);
}

function pushIssue(list, level, message) {
  list.push({ level, message });
}

function validateOpenMeteoEndpoint(
  issues,
  variableName,
  value,
  kind,
  hasApiKey,
) {
  let url;
  try {
    url = new URL(value);
  } catch {
    pushIssue(
      issues,
      'error',
      `${variableName} debe ser una URL valida de Open-Meteo`,
    );
    return;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    pushIssue(
      issues,
      'error',
      `${variableName} debe usar HTTPS sin credenciales, puerto, query ni fragmento`,
    );
    return;
  }
  const publicHost =
    kind === 'forecast' ? 'api.open-meteo.com' : 'archive-api.open-meteo.com';
  const customerHost =
    kind === 'forecast'
      ? 'customer-api.open-meteo.com'
      : 'customer-archive-api.open-meteo.com';
  const host = url.hostname.toLowerCase();
  if (host !== publicHost && host !== customerHost) {
    pushIssue(
      issues,
      'error',
      `${variableName} debe apuntar al host oficial de Open-Meteo para ${kind}`,
    );
    return;
  }
  if (hasApiKey !== (host === customerHost)) {
    pushIssue(
      issues,
      'error',
      `${variableName} no coincide con la API key configurada; public no lleva key y customer la exige`,
    );
  }
}

function validate() {
  const service = getService();
  const env = String(
    process.env.ENV || process.env.NODE_ENV || '',
  ).toLowerCase();
  const force = process.argv.includes('--force');
  const issues = [];

  if (!service || !SERVICE_REQUIRED[service]) {
    pushIssue(
      issues,
      'error',
      `Servicio no reconocido. Definir CHAMAN_SERVICE o pasar argumento. Servicios: ${Object.keys(SERVICE_REQUIRED).join(', ')}`,
    );
    return issues;
  }

  if (env !== 'production' && !force) {
    pushIssue(
      issues,
      'warn',
      'ENV/NODE_ENV no es production. Este comando valida igualmente como predeploy; definir ENV=production para la revision final.',
    );
  }

  for (const name of SERVICE_REQUIRED[service]) {
    if (
      name === 'MONGO_URI' &&
      (hasValue('MONGO_URI') ||
        hasValue('MONGO_URL') ||
        hasValue('DATABASE_URL'))
    ) {
      continue;
    }
    if (!hasValue(name)) {
      pushIssue(issues, 'error', `Falta variable requerida: ${name}`);
    }
  }

  const placeholderCandidates = new Set([
    ...SERVICE_REQUIRED[service],
    ...Object.keys(FORBIDDEN_VALUES),
  ]);
  for (const name of placeholderCandidates) {
    if (hasValue(name) && isAngularPlaceholder(getValue(name))) {
      pushIssue(
        issues,
        'error',
        `${name} tiene un valor placeholder angular; reemplazarlo por una configuracion real`,
      );
    }
  }

  for (const [name, forbidden] of Object.entries(FORBIDDEN_VALUES)) {
    if (hasValue(name) && forbidden.has(getValue(name).toLowerCase())) {
      pushIssue(
        issues,
        'error',
        `${name} tiene un valor placeholder o inseguro`,
      );
    }
  }

  for (const name of [
    'SOIL_INTELLIGENCE_INTERNAL_TOKEN',
    'AGROMETEO_INTERNAL_TOKEN',
    'CHAMAN_METEO_INTERNAL_TOKEN',
  ]) {
    if (hasValue(name) && getValue(name).length < 32) {
      pushIssue(issues, 'error', `${name} debe tener al menos 32 caracteres`);
    }
  }

  if (BACKEND_SERVICES.has(service)) {
    if (getValue('SWAGGER_ENABLED') !== 'false') {
      pushIssue(
        issues,
        'error',
        'SWAGGER_ENABLED debe ser false en produccion',
      );
    }

    const cors = getValue('CORS_ORIGINS');
    if (!cors) {
      pushIssue(
        issues,
        'error',
        'CORS_ORIGINS debe estar definido explicitamente en produccion',
      );
    } else if (cors.includes('*')) {
      pushIssue(issues, 'error', 'CORS_ORIGINS no debe usar comodines');
    }

    if (getValue('GOOGLE_LOGIN_ENABLED') === 'true') {
      pushIssue(
        issues,
        'warn',
        'GOOGLE_LOGIN_ENABLED=true. Confirmar aprobacion antes de publicar',
      );
    }
  }

  for (const name of [
    'API_DATOS',
    'API_AUTH',
    'API_CLIMA',
    'API_PREDICCIONES',
    'API_EXTERNA_URL',
  ]) {
    if (hasValue(name) && isPublicRailwayUrl(getValue(name))) {
      pushIssue(
        issues,
        'warn',
        `${name} apunta a dominio publico Railway. Preferir RAILWAY_PRIVATE_DOMAIN para servicios internos`,
      );
    }
  }

  if (service === 'lora' && getValue('LORAWAN_MQTT_ENABLED') === 'true') {
    for (const name of [
      'LORAWAN_MQTT_URL',
      'LORAWAN_MQTT_USERNAME',
      'LORAWAN_MQTT_PASSWORD',
    ]) {
      if (!hasValue(name)) {
        pushIssue(issues, 'error', `LoRaWAN activo pero falta ${name}`);
      }
    }
  }

  if (['api', 'datos'].includes(service)) {
    const releaseSha =
      getValue('CHAMAN_RELEASE_SHA') ||
      getValue('RAILWAY_GIT_COMMIT_SHA') ||
      getValue('GIT_COMMIT_SHA');
    if (!/^[0-9a-f]{40}$/i.test(releaseSha)) {
      pushIssue(
        issues,
        'error',
        'El endpoint /version requiere CHAMAN_RELEASE_SHA o un SHA Git provisto por Railway',
      );
    }
    if (!/^[a-z0-9][a-z0-9._+-]{0,63}$/i.test(getValue('CHAMAN_RELEASE_VERSION'))) {
      pushIssue(issues, 'error', 'CHAMAN_RELEASE_VERSION tiene un formato inválido');
    }

    const explicitBuiltAt = getValue('CHAMAN_RELEASE_BUILT_AT');
    const sourceDateEpoch = getValue('SOURCE_DATE_EPOCH');
    if (!explicitBuiltAt && !sourceDateEpoch) {
      pushIssue(
        issues,
        'error',
        'El endpoint /version requiere CHAMAN_RELEASE_BUILT_AT o SOURCE_DATE_EPOCH',
      );
    } else if (
      explicitBuiltAt &&
      (!Number.isFinite(Date.parse(explicitBuiltAt)) || explicitBuiltAt.length > 64)
    ) {
      pushIssue(issues, 'error', 'CHAMAN_RELEASE_BUILT_AT debe ser una fecha ISO válida');
    } else if (
      !explicitBuiltAt &&
      (!/^\d{1,12}$/.test(sourceDateEpoch) ||
        !Number.isSafeInteger(Number(sourceDateEpoch) * 1000))
    ) {
      pushIssue(issues, 'error', 'SOURCE_DATE_EPOCH debe expresarse en segundos enteros');
    }
  }

  if (service === 'meteo-worker') {
    const importEnabled = getValue('CHAMAN_METEO_IMPORT_ENABLED') === 'true';
    if (importEnabled && getValue('CHAMAN_METEO_ENABLED') !== 'true') {
      pushIssue(
        issues,
        'error',
        'CHAMAN_METEO_IMPORT_ENABLED=true requiere CHAMAN_METEO_ENABLED=true',
      );
    }
    if (importEnabled && !hasValue('CDS_API_KEY')) {
      pushIssue(issues, 'error', 'Importador Chamán-Meteo activo pero falta CDS_API_KEY');
    }
    if (getValue('CHAMAN_METEO_RUN_ONCE') === 'true') {
      pushIssue(
        issues,
        'error',
        'CHAMAN_METEO_RUN_ONCE no puede quedar habilitado en un servicio productivo continuo',
      );
    }
    for (const name of [
      'CHAMAN_METEO_REPAIR_GRID_POINT',
      'CHAMAN_METEO_REPAIR_FROM',
      'CHAMAN_METEO_REPAIR_TO',
      'CHAMAN_METEO_REPAIR_FORCE',
    ]) {
      if (hasValue(name)) {
        pushIssue(
          issues,
          'error',
          `${name} debe estar ausente del servicio productivo continuo`,
        );
      }
    }
  }

  if (
    service === 'lora' &&
    getValue('CHIRPSTACK_DEVICE_SYNC_ENABLED') === 'true'
  ) {
    for (const name of [
      'CHIRPSTACK_GRPC_ADDRESS',
      'CHIRPSTACK_API_TOKEN',
      'LORAWAN_CATALOG_INTERNAL_TOKEN',
    ]) {
      if (!hasValue(name)) {
        pushIssue(
          issues,
          'error',
          `Inventario ChirpStack activo pero falta ${name}`,
        );
      }
    }
  }

  if (service === 'clima' && !hasValue('METEOBLUE_API_KEY')) {
    pushIssue(
      issues,
      'warn',
      'METEOBLUE_API_KEY no esta configurada. La comparacion profesional Meteoblue queda desactivada y Open-Meteo opera sin contraste.',
    );
  }

  if (['api', 'clima', 'datos', 'predicciones'].includes(service)) {
    const forecastHasKey = hasValue('OPEN_METEO_API_KEY');
    const forecastBase =
      getValue('OPEN_METEO_FORECAST_BASE_URL') ||
      (forecastHasKey
        ? 'https://customer-api.open-meteo.com/v1'
        : getValue('API_OPEN_METEO') || 'https://api.open-meteo.com/v1');
    validateOpenMeteoEndpoint(
      issues,
      'OPEN_METEO_FORECAST_BASE_URL',
      forecastBase,
      'forecast',
      forecastHasKey,
    );

    if (['api', 'clima', 'datos'].includes(service)) {
      const archiveHasKey = hasValue('OPEN_METEO_ARCHIVE_API_KEY');
      const explicitArchiveBase = getValue('OPEN_METEO_ARCHIVE_BASE_URL');
      if (archiveHasKey || explicitArchiveBase) {
        const archiveBase =
          explicitArchiveBase ||
          'https://customer-archive-api.open-meteo.com/v1';
        validateOpenMeteoEndpoint(
          issues,
          'OPEN_METEO_ARCHIVE_BASE_URL',
          archiveBase,
          'archive',
          archiveHasKey,
        );
      } else {
        pushIssue(
          issues,
          'warn',
          'Open-Meteo Historical Weather no esta habilitado. Se usara exclusivamente Forecast comercial con hasta 92 dias de pasado; los periodos sin cobertura canonica quedaran incompletos.',
        );
      }
    }
  }

  if (getValue('REALTIME_TRANSPORT') === 'redis' && !hasValue('REDIS_HOST')) {
    pushIssue(
      issues,
      'error',
      'REALTIME_TRANSPORT=redis pero falta REDIS_HOST',
    );
  }

  if (
    service === 'websocket' &&
    !['redis', 'mqtt'].includes(getValue('REALTIME_TRANSPORT'))
  ) {
    pushIssue(
      issues,
      'error',
      'WebSocket requiere REALTIME_TRANSPORT=redis o mqtt para distribuir eventos',
    );
  }

  return issues;
}

const issues = validate();
const errors = issues.filter((issue) => issue.level === 'error');

for (const issue of issues) {
  const prefix = issue.level === 'error' ? 'ERROR' : 'WARN';
  console.log(`${prefix}: ${issue.message}`);
}

if (errors.length) {
  console.error(`Validacion productiva fallida: ${errors.length} error(es).`);
  process.exit(1);
}

console.log('Validacion productiva OK.');
