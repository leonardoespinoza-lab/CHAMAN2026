import {
  ApiPendingServiceCode,
  validApiRequestedServices,
} from "./integraciones-catalogo";
export * from "./integraciones-catalogo";
/** Implemented permissions only. The full commercial catalogue is separate. */
export const API_SERVICES = [
  {
    scope: "estructura:leer",
    nombre: "Consultar productores, establecimientos, lotes y siembras",
  },
  {
    scope: "estructura:crear",
    nombre: "Crear estructura y registrar siembras",
  },
  { scope: "catalogos:leer", nombre: "Consultar cultivos y semillas" },
  { scope: "fenologia:leer", nombre: "Consultar fenología procesada" },
] as const;
export type ApiScope = (typeof API_SERVICES)[number]["scope"];
export type ApiEnvironment = "testing" | "production";
export interface ApiSettings {
  name: string;
  enabled: boolean;
  expiresAt: string;
  scopes: ApiScope[];
  /** Administrative requests awaiting an external adapter; never grants access. */
  requestedServices?: ApiPendingServiceCode[];
  limits: { productores: number; establecimientos: number; lotes: number };
  requestsPerMinute: number;
  maxSowingAgeDays: number;
}
export interface ApiRegistration extends ApiSettings {
  id: string;
  advisorUserId: string;
  permissionIndex: number;
}
export interface ApiKeyInfo {
  id: string;
  expiresAt: string;
}
export interface ApiAudit {
  at: string;
  actorId: string;
  action: string;
  revision: number;
}
export interface ApiClientView extends ApiRegistration {
  environment: ApiEnvironment;
  revision: number;
  keys: ApiKeyInfo[];
  createdAt: string;
  updatedAt: string;
  audit: ApiAudit[];
}
export interface ApiClientRecord extends Omit<ApiClientView, "keys"> {
  keys: (ApiKeyInfo & { sha256: string })[];
}
export interface ApiUsageRow {
  day: string;
  operation: string;
  requests: number;
  success: number;
  errors: number;
  pending: number;
  rateLimited: number;
  unfinished: number;
  durationMs: number;
}
export interface ApiUsageReport {
  from: string;
  to: string;
  lastRequestAt: string | null;
  rows: ApiUsageRow[];
  retentionDays: number;
}
export interface ApiUsageEvent {
  requestId: string;
  clientId: string;
  environment: ApiEnvironment;
  operation: string;
  startedAt: string;
}
export const apiId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9_-]{3,50}$/.test(value);
export const apiObjectId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{24}$/.test(value);
export const apiIsoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const plain = (v: any): boolean =>
  !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: any, min: number, max: number): boolean =>
  Number.isInteger(v) && v >= min && v <= max;
const settingsKeys = [
  "name",
  "enabled",
  "expiresAt",
  "scopes",
  "limits",
  "requestsPerMinute",
  "maxSowingAgeDays",
];
export function validApiSettings(v: any, registration = false): boolean {
  const requiredKeys = registration
    ? [...settingsKeys, "id", "advisorUserId", "permissionIndex"]
    : settingsKeys;
  const keys = [...requiredKeys, "requestedServices"];
  return (
    plain(v) &&
    requiredKeys.every((k) => Object.prototype.hasOwnProperty.call(v, k)) &&
    Object.keys(v).every((k) => keys.includes(k)) &&
    (!Object.prototype.hasOwnProperty.call(v, "requestedServices") ||
      validApiRequestedServices(v.requestedServices)) &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 120 &&
    !/[\u0000-\u001f]/.test(v.name) &&
    typeof v.enabled === "boolean" &&
    apiIsoDate(v.expiresAt) &&
    Array.isArray(v.scopes) &&
    v.scopes.length > 0 &&
    v.scopes.length <= API_SERVICES.length &&
    new Set(v.scopes).size === v.scopes.length &&
    v.scopes.every((s: unknown) => API_SERVICES.some((a) => a.scope === s)) &&
    plain(v.limits) &&
    Object.keys(v.limits).length === 3 &&
    ["productores", "establecimientos", "lotes"].every((k) =>
      int(v.limits[k], 0, 100000),
    ) &&
    int(v.requestsPerMinute, 1, 600) &&
    int(v.maxSowingAgeDays, 1, 366) &&
    (!registration ||
      (apiId(v.id) &&
        apiObjectId(v.advisorUserId) &&
        int(v.permissionIndex, 0, 99)))
  );
}
export function apiClientView(record: ApiClientRecord): ApiClientView {
  // Whitelist: no Mongo internals, credential hashes or future private fields.
  return {
    id: record.id,
    name: record.name,
    advisorUserId: record.advisorUserId,
    permissionIndex: record.permissionIndex,
    enabled: record.enabled,
    environment: record.environment,
    expiresAt: record.expiresAt,
    scopes: [...record.scopes],
    ...(record.requestedServices !== undefined
      ? { requestedServices: [...record.requestedServices] }
      : {}),
    limits: { ...record.limits },
    requestsPerMinute: record.requestsPerMinute,
    maxSowingAgeDays: record.maxSowingAgeDays,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    keys: record.keys.map((k) => ({ id: k.id, expiresAt: k.expiresAt })),
    audit: record.audit.map((a) => ({
      at: a.at,
      actorId: a.actorId,
      action: a.action,
      revision: a.revision,
    })),
  };
}
