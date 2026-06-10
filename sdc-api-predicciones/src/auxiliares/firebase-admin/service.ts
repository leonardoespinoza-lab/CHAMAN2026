import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common/services';
import { ServiceAccount } from 'firebase-admin';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { BatchResponse, getMessaging, Message } from 'firebase-admin/messaging';

function buildServiceAccount(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

@Injectable()
export class FirebaseAdminService {
  private readonly app: App | null;

  constructor() {
    const serviceAccount = buildServiceAccount();

    if (!serviceAccount) {
      this.app = null;
      Logger.warn(
        'Firebase Admin no configurado. Las notificaciones push quedan deshabilitadas hasta definir FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.',
      );
      return;
    }

    this.app = initializeApp({
      credential: cert(serviceAccount),
    });
  }

  public async sendNotificationPrueba() {
    try {
      const messaging = this.getMessaging();
      const registrationToken = process.env.FIREBASE_TEST_REGISTRATION_TOKEN;

      if (!messaging || !registrationToken) {
        Logger.warn('Notificacion de prueba omitida: Firebase Admin o token de prueba no configurados.');
        return;
      }

      const message = {
        notification: {
          title: 'Portugal vs. Denmark',
          body: 'great match!',
        },
        token: registrationToken,
      };

      const resp = await messaging.send(message);
      Logger.log(`Respuesta send: ${JSON.stringify(resp)}`);
    } catch (error) {
      Logger.error(error);
    }
  }

  public async sendNotifications(
    tokens: string[],
    titulo: string,
    mensaje: string,
    data: { [key: string]: string } = { action: 'abrir notificaciones' },
  ) {
    try {
      const messaging = this.getMessaging();
      if (!messaging) {
        Logger.warn('Envio de notificaciones omitido: Firebase Admin no configurado.');
        return;
      }

      const messages: Message[] = [];
      for (const token of tokens) {
        const message: Message = {
          notification: {
            title: titulo,
            body: mensaje,
          },
          token: token,
          data,
        };
        messages.push(message);
      }

      const resp: BatchResponse = await messaging.sendEach(messages);
      Logger.log(`Respuesta sendAll: ${JSON.stringify(resp)}`);
    } catch (error) {
      Logger.error(error);
    }
  }

  private getMessaging() {
    if (!this.app) {
      return null;
    }

    return getMessaging(this.app);
  }
}
