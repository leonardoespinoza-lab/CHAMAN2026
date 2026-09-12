import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiEnvironment } from 'modelos/src';
import { AxiosService } from '../auxiliares/axios/axios.service';
import { API_DATOS } from '../env';

export function integrationEnvironment(): ApiEnvironment {
  const env = String(process.env.ENV || '').toLowerCase();
  if (env === 'production') return 'production';
  if (['test', 'testing', 'dev', 'development', 'local'].includes(env))
    return 'testing';
  throw new ServiceUnavailableException(
    'Entorno de integraciones no configurado.',
  );
}
@Injectable()
export class IntegrationControlStore {
  constructor(private readonly axios: AxiosService) {}
  async command<T = any>(command: Record<string, unknown>): Promise<T> {
    if (process.env.CHAMAN_INTEGRATIONS_ADMIN_ENABLED !== 'true')
      throw new NotFoundException(
        'Administración de API no habilitada en este entorno.',
      );
    const secret = process.env.CHAMAN_INTEGRATIONS_INTERNAL_TOKEN || '';
    if (secret.length < 32 || secret.length > 200)
      throw new ServiceUnavailableException(
        'Canal interno de integraciones no configurado.',
      );
    return this.axios.POST(
      `${API_DATOS}/internal/integration-control/command`,
      { ...command, environment: integrationEnvironment() },
      {
        headers: { 'x-integration-control-token': secret },
        timeout: 10000,
        maxRedirects: 0,
      },
    );
  }
  async track(clientId: string, req: any, res: any): Promise<string> {
    const requestId = randomUUID();
    const started = Date.now();
    // Route template, never the URL, query, IDs, body, headers, IP or credentials.
    const template = String(req.route?.path || '').split(
      'integraciones/v1/',
    )[1];
    const operation = `${req.method} ${template}`;
    await this.command({
      action: 'usage-start',
      clientId,
      requestId,
      operation,
      startedAt: new Date(started).toISOString(),
    });
    let finished = false;
    const finish = (status: number) => {
      if (finished) return;
      finished = true;
      void this.command({
        action: 'usage-finish',
        requestId,
        status,
        durationMs: Math.min(86400000, Math.max(0, Date.now() - started)),
      }).catch(() =>
        Logger.warn(
          'Un registro de consumo de API quedó sin resultado final; revisar contadores pendientes.',
          'IntegrationsUsage',
        ),
      );
    };
    res.once('finish', () => finish(res.statusCode));
    res.once('close', () => {
      if (!res.writableFinished) finish(499);
    });
    return requestId;
  }
}
