function resolveRuntimeEnvironment(environment = process.env) {
  return String(
    environment.RAILWAY_ENVIRONMENT_NAME ||
      environment.ENV ||
      environment.NODE_ENV ||
      "",
  )
    .trim()
    .toLowerCase();
}

function productionValidationArgs(serviceName) {
  return ["scripts/validate-production-config.js", serviceName];
}

module.exports = {
  productionValidationArgs,
  resolveRuntimeEnvironment,
};
