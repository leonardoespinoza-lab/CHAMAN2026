import { Injectable } from '@angular/core';
import { ITokenPush } from 'modelos/src';

@Injectable({
  providedIn: 'root',
})
export class PushNotificationsService {
  public async estadoPermisos() {
    return;
  }

  public async iniciarPermisos() {
    return;
  }

  public async upsertToken(): Promise<ITokenPush> {
    return undefined as unknown as ITokenPush;
  }
}
