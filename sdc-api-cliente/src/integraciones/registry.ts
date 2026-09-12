import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { hash, IntegrationClient, SCOPES } from './contract';

@Injectable()
export class IntegrationRegistry {
  private readonly clients: IntegrationClient[];
  constructor() {
    this.clients = this.load();
  }
  private load(): IntegrationClient[] {
    if (process.env.CHAMAN_INTEGRATIONS_ENABLED !== 'true') return [];
    // The first release is deliberately sandbox-only, including if copied to Production.
    if (
      !['test', 'testing', 'dev', 'local', 'development'].includes(
        String(process.env.ENV || '').toLowerCase(),
      )
    )
      throw new Error('Integrations pilot requires a non-production ENV.');
    try {
      const clients = JSON.parse(
        process.env.CHAMAN_INTEGRATIONS_CLIENTS || '[]',
      );
      const ids = new Set<string>();
      const keyIds = new Set<string>();
      const operators = new Set<string>();
      if (!Array.isArray(clients) || !clients.length || clients.length > 100)
        throw Error();
      for (const client of clients) {
        if (
          typeof client.id !== 'string' ||
          !/^[a-z0-9_-]{3,50}$/.test(client.id) ||
          ids.has(client.id) ||
          typeof client.name !== 'string' ||
          !/^[a-f0-9]{24}$/.test(client.advisorUserId) ||
          !Number.isInteger(client.permissionIndex) ||
          client.permissionIndex < 0 ||
          typeof client.enabled !== 'boolean' ||
          typeof client.expiresAt !== 'string' ||
          !Number.isFinite(Date.parse(client.expiresAt))
        )
          throw Error();
        ids.add(client.id);
        if (operators.has(client.advisorUserId)) throw Error();
        operators.add(client.advisorUserId);
        if (
          !Array.isArray(client.scopes) ||
          !client.scopes.length ||
          client.scopes.some((scope) => !SCOPES.includes(scope))
        )
          throw Error();
        if (
          !Number.isInteger(client.requestsPerMinute) ||
          client.requestsPerMinute < 1 ||
          client.requestsPerMinute > 600 ||
          !Array.isArray(client.keys) ||
          !client.keys.length ||
          client.keys.length > 3
        )
          throw Error();
        for (const key of client.keys) {
          if (
            typeof key.id !== 'string' ||
            !/^[a-z0-9_-]{3,50}$/.test(key.id) ||
            keyIds.has(key.id) ||
            !/^[a-f0-9]{64}$/.test(key.sha256) ||
            typeof key.expiresAt !== 'string' ||
            !Number.isFinite(Date.parse(key.expiresAt))
          )
            throw Error();
          keyIds.add(key.id);
        }
      }
      return clients;
    } catch {
      throw new Error('Invalid integration registry. No credentials logged.');
    }
  }
  authenticate(header: unknown): IntegrationClient {
    if (!this.clients.length) throw new NotFoundException();
    if (typeof header !== 'string' || header.length > 200)
      throw new UnauthorizedException('Credencial de integración inválida.');
    const parts = /^chm_test_([a-z0-9_-]{3,50})\.([A-Za-z0-9_-]{43,86})$/.exec(
      header,
    );
    const client =
      parts &&
      this.clients.find((item) => item.keys.some((key) => key.id === parts[1]));
    const key = client?.keys.find((item) => item.id === parts[1]);
    const valid =
      key &&
      timingSafeEqual(
        Buffer.from(hash(header), 'hex'),
        Buffer.from(key.sha256, 'hex'),
      );
    if (
      !valid ||
      !client.enabled ||
      Date.parse(client.expiresAt) <= Date.now() ||
      Date.parse(key.expiresAt) <= Date.now()
    )
      throw new UnauthorizedException(
        'Credencial de integración inválida o vencida.',
      );
    return structuredClone(client);
  }
}
