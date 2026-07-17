import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  public async sendNotificationPrueba() {
    this.logger.verbose('Push externo deshabilitado en CHAMAN2026 staging.');
  }

  public async sendNotifications(tokens: string[], titulo: string, mensaje: string) {
    this.logger.verbose(
      `Push externo omitido para ${tokens.length} token(s). La notificacion interna queda registrada. ${titulo}: ${mensaje}`,
    );
    return {
      status: 'skipped' as const,
      reason: 'push-externo-deshabilitado',
    };
  }
}
