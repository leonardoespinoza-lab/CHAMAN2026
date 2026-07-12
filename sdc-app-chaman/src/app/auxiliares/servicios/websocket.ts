import { Injectable } from '@angular/core';
import { ISocketMessage } from 'modelos/src';
import { Observable, Subject, Subscription } from 'rxjs';
import { WebSocketSubject, webSocket } from 'rxjs/webSocket';
import { WS } from '../../environments/environment';
import { HelperService } from './helper';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket$?: WebSocketSubject<ISocketMessage | Record<string, unknown>>;
  private socketMsg$ = new Subject<ISocketMessage>();
  private socketSubscription?: Subscription;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private closedByUser = false;

  constructor(private helper: HelperService) {
    this.initWs();
  }

  public initWs(): void {
    const token = this.helper.accessToken;
    if (!WS || !token || this.socket$) return;

    this.closedByUser = false;
    this.clearReconnectTimer();
    try {
      this.socket$ = webSocket({
        url: WS,
        openObserver: {
          next: () => {
            this.reconnectAttempt = 0;
            this.sendToken(token);
          },
        },
        closeObserver: {
          next: () => {
            this.resetSocket();
            this.scheduleReconnect();
          },
        },
      });

      this.socketSubscription = this.socket$.subscribe({
        next: (message) => this.handleMessage(message as ISocketMessage),
        error: () => {
          this.resetSocket();
          this.scheduleReconnect();
        },
        complete: () => this.resetSocket(),
      });
    } catch {
      this.resetSocket();
      this.scheduleReconnect();
    }
  }

  public closeWS(): void {
    this.closedByUser = true;
    this.clearReconnectTimer();
    this.socket$?.complete();
    this.resetSocket();
  }

  public getMessage(): Observable<ISocketMessage> {
    return this.socketMsg$.asObservable();
  }

  private sendToken(token: string): void {
    this.socket$?.next({
      event: 'identity',
      data: `Bearer ${token}`,
    });
  }

  private handleMessage(message: ISocketMessage): void {
    this.socketMsg$.next(message);
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || !WS || !this.helper.accessToken || this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.initWs();
    }, delay);
  }

  private resetSocket(): void {
    this.socketSubscription?.unsubscribe();
    this.socketSubscription = undefined;
    this.socket$ = undefined;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
