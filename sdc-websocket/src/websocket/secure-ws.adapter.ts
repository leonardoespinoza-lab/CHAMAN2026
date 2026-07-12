import { INestApplicationContext, Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { WEBSOCKET_ALLOWED_ORIGINS, WEBSOCKET_MAX_PAYLOAD_BYTES } from '../env';

interface VerifyClientInfo {
  origin?: string;
}

export function isWebsocketOriginAllowed(
  origin: string | undefined,
  allowed: true | string[] = WEBSOCKET_ALLOWED_ORIGINS,
): boolean {
  if (allowed === true) return true;
  if (!origin) return false;
  return allowed.includes(origin);
}

export class SecureWsAdapter extends WsAdapter {
  private readonly securityLogger = new Logger(SecureWsAdapter.name);

  constructor(app: INestApplicationContext) {
    super(app);
  }

  create(port: number, options: Record<string, unknown> = {}): any {
    const verifyClient = (info: VerifyClientInfo): boolean => {
      const allowed = isWebsocketOriginAllowed(info.origin);
      if (!allowed) {
        this.securityLogger.warn('Conexion WebSocket rechazada por origen no permitido.');
      }
      return allowed;
    };

    return super.create(port, {
      ...options,
      maxPayload: WEBSOCKET_MAX_PAYLOAD_BYTES,
      verifyClient,
    });
  }
}
