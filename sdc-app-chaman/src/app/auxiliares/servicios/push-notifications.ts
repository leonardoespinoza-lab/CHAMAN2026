import { Injectable } from '@angular/core';
import { getMessaging, getToken, Messaging, onMessage, isSupported } from 'firebase/messaging';
import { initializeApp } from 'firebase/app';
import { ITokenPush } from 'modelos/src';
import { HttpService } from '../http/http.service';
import { HelperService } from './helper';
import { FIREBASE_CONFIG, VAPID_KEY } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PushNotificationsService {
  constructor(
    private http: HttpService,
    private helper: HelperService
  ) {
    this.init();
  }

  private async init() {
    initializeApp(FIREBASE_CONFIG);
    this.iniciarPermisos();
  }

  //

  public async estadoPermisos() {
    let response: 'denied' | 'granted' | 'prompt' = 'prompt';
    const { state } = await navigator?.permissions?.query({
      name: 'notifications' as any,
    });

    if (state === 'granted') {
      response = 'granted';
      await this.iniciarPermisos();
    }
    if (state === 'denied') {
      response = 'denied';
    }
  }

  public async iniciarPermisos() {
    await this.initWeb();
  }

  /// WEB

  public upsertToken(token: string, idUsuario: string): Promise<ITokenPush> {
    const url = `/tokenPushs/upsert`;
    const body = { tokenPush: token, idUsuario };
    return this.http.post(url, body);
  }

  private async initWeb() {
    const usuario = this.helper.user;
    if (!usuario) {
      console.warn('No hay usuario logueado');
      return;
    }

    if (!(await isSupported())) {
      console.error('Notifications not supported');
      return;
    }

    // 1. Verificar si ya está bloqueado
    if (Notification.permission === 'denied') {
      console.warn('Usuario bloqueó las notificaciones');
      return;
    }

    let permission: string = Notification.permission;

    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return;
    }

    // 4. Recién acá usar Firebase
    const messaging = getMessaging();

    try {
      const token = await this.getToken(messaging);

      if (token && usuario._id) {
        await this.upsertToken(token, usuario._id);
        await this.listen(messaging);
      } else {
        console.error('No registration token available');
      }
    } catch (error: any) {
      if (error.code === 'messaging/permission-blocked') {
        return; // evitar ruido en consola
      }
      console.error(error);
    }
  
  }

  private async getToken(messaging: Messaging) {
    return getToken(messaging, { vapidKey: VAPID_KEY });
  }

  private async listen(messaging: Messaging) {
    onMessage(messaging, (payload) => {
      // Acá se pueden hacer cosas con el mensaje
      console.log('Message received. ', payload);
    });
  }
}
