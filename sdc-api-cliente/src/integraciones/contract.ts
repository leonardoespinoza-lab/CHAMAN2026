import { BadRequestException, RequestMethod } from '@nestjs/common';
import { createHash } from 'crypto';
import { ILicencia, IPermiso } from 'modelos/src';

export const INTEGRATION_PREFIX = 'integraciones/v1';
export const RESOURCE_TYPES = [
  'productores',
  'establecimientos',
  'lotes',
  'siembras',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export const SCOPES = [
  'estructura:leer',
  'estructura:crear',
  'catalogos:leer',
  'fenologia:leer',
] as const;
export type Scope = (typeof SCOPES)[number];
export interface IntegrationClient {
  id: string;
  name: string;
  advisorUserId: string;
  permissionIndex: number;
  scopes: Scope[];
  enabled: boolean;
  expiresAt: string;
  requestsPerMinute: number;
  keys: { id: string; sha256: string; expiresAt: string }[];
}
export interface IntegrationContext {
  client: IntegrationClient;
  permission: IPermiso;
  license: ILicencia;
  requestId: string;
}
// Exact method/path exclusions: integration keys never authenticate regular app routes.
export const INTEGRATION_ROUTES = [
  { method: RequestMethod.GET, path: `${INTEGRATION_PREFIX}/servicios` },
  {
    method: RequestMethod.GET,
    path: `${INTEGRATION_PREFIX}/catalogos/semillas`,
  },
  ...RESOURCE_TYPES.flatMap((kind) => [
    {
      method: RequestMethod.GET,
      path: `${INTEGRATION_PREFIX}/${kind}/:externalId`,
    },
    {
      method: RequestMethod.PUT,
      path: `${INTEGRATION_PREFIX}/${kind}/:externalId`,
    },
  ]),
  {
    method: RequestMethod.GET,
    path: `${INTEGRATION_PREFIX}/siembras/:externalId/fenologia`,
  },
];
export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function externalId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value)
  ) {
    throw new BadRequestException(
      'idExterno: usar 1–80 letras, números, puntos, guiones o guiones bajos.',
    );
  }
  return value;
}
export function resourceId(
  client: IntegrationClient,
  kind: ResourceType,
  id: string,
): string {
  return hash(
    JSON.stringify([
      'chaman-integrations-v1',
      client.id,
      client.advisorUserId,
      kind,
      externalId(id),
    ]),
  ).slice(0, 24);
}
export function objectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value))
    throw new BadRequestException('idSemilla inválido.');
  return value;
}
function record(value: unknown, fields: string[]): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Se requiere un objeto JSON.');
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new BadRequestException('El cuerpo contiene campos no admitidos.');
  return value;
}
function name(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 120 ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new BadRequestException('nombre inválido.');
  return value.trim();
}
export function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException('fechaSiembra debe ser YYYY-MM-DD.');
  const parsed = new Date(value + 'T12:00:00Z');
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Fecha inexistente.');
  return value;
}
export function normalizeBody(
  kind: ResourceType,
  input: unknown,
): Record<string, any> {
  const fields = {
    productores: ['nombre'],
    establecimientos: ['nombre', 'productorIdExterno'],
    lotes: ['nombre', 'establecimientoIdExterno', 'ubicacion', 'superficieHa'],
    siembras: ['loteIdExterno', 'idSemilla', 'fechaSiembra'],
  };
  const body = record(input, fields[kind]);
  if (kind === 'productores') return { nombre: name(body.nombre) };
  if (kind === 'establecimientos')
    return {
      nombre: name(body.nombre),
      productorIdExterno: externalId(body.productorIdExterno),
    };
  if (kind === 'siembras') {
    const date = calendarDate(body.fechaSiembra);
    if (
      date < '2000-01-01' ||
      date > new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10)
    )
      throw new BadRequestException(
        'Fecha fuera del rango admitido para el piloto.',
      );
    return {
      loteIdExterno: externalId(body.loteIdExterno),
      idSemilla: objectId(body.idSemilla),
      fechaSiembra: date,
    };
  }
  const point = record(body.ubicacion, ['lat', 'lng']);
  if (
    typeof point.lat !== 'number' ||
    !Number.isFinite(point.lat) ||
    Math.abs(point.lat) > 90 ||
    typeof point.lng !== 'number' ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lng) > 180
  )
    throw new BadRequestException('ubicacion requiere lat/lng WGS84 válidas.');
  if (
    typeof body.superficieHa !== 'number' ||
    !Number.isFinite(body.superficieHa) ||
    body.superficieHa <= 0 ||
    body.superficieHa > 100000
  )
    throw new BadRequestException(
      'superficieHa debe ser mayor que cero y menor o igual a 100000.',
    );
  return {
    nombre: name(body.nombre),
    establecimientoIdExterno: externalId(body.establecimientoIdExterno),
    ubicacion: { lat: point.lat, lng: point.lng },
    superficieHa: body.superficieHa,
  };
}
