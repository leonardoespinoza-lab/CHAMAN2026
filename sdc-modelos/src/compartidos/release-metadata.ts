export interface ReleaseMetadata {
  schemaVersion: 1;
  service: string;
  sha: string;
  version: string;
  builtAt: string;
}

type ReleaseEnvironment = Record<string, string | undefined>;

const UNKNOWN = 'unknown';

function safeToken(value: string | undefined, pattern: RegExp): string {
  const normalized = String(value || '').trim();
  return pattern.test(normalized) ? normalized : UNKNOWN;
}

function safeBuiltAt(value: string | undefined): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 64) return UNKNOWN;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : UNKNOWN;
}

function safeSourceDateEpoch(value: string | undefined): string {
  const normalized = String(value || '').trim();
  if (!/^\d{1,12}$/.test(normalized)) return UNKNOWN;
  const timestamp = Number(normalized) * 1000;
  if (!Number.isSafeInteger(timestamp)) return UNKNOWN;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : UNKNOWN;
}

export function buildReleaseMetadata(
  serviceName: string,
  environment: ReleaseEnvironment = {},
): ReleaseMetadata {
  const explicitSha = environment.CHAMAN_RELEASE_SHA;
  const sha = safeToken(
    explicitSha === undefined
      ? environment.RAILWAY_GIT_COMMIT_SHA || environment.GIT_COMMIT_SHA
      : explicitSha,
    /^[0-9a-f]{40}$/i,
  ).toLowerCase();

  return {
    schemaVersion: 1,
    service: safeToken(serviceName, /^[a-z0-9][a-z0-9-]{1,63}$/),
    sha,
    version: safeToken(
      environment.CHAMAN_RELEASE_VERSION || environment.npm_package_version,
      /^[a-z0-9][a-z0-9._+-]{0,63}$/i,
    ),
    builtAt:
      environment.CHAMAN_RELEASE_BUILT_AT === undefined
        ? safeSourceDateEpoch(environment.SOURCE_DATE_EPOCH)
        : safeBuiltAt(environment.CHAMAN_RELEASE_BUILT_AT),
  };
}
