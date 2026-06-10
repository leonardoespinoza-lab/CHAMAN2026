import { Injectable } from '@angular/core';
import { ISocketMessage } from 'modelos/src';
import { interval, Observable, Subject } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { WebSocketSubject, webSocket } from 'rxjs/webSocket';
import { HelperService } from './helper';
import { WS } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket$?: WebSocketSubject<any>;
  private socketMsg$ = new Subject<ISocketMessage>();

  constructor(private helper: HelperService) {
    this.initWs();
  }

  public initWs() {
  const token = this.helper.accessToken;

  if (token && WS) {
    try {
      this.socket$ = webSocket({
        url: WS,
        
        openObserver: {
          next: () => {
            console.log('✅ WebSocket CONECTADO');
            this.sendToken(token); // 👈 ahora sí, en el momento correcto
          }
        },
        
        closeObserver: {
          next: () => {
            console.log('❌ WebSocket CERRADO');
          }
        }
      });

      this.socket$.subscribe(
        (message: ISocketMessage) => {
          console.log('📩 Mensaje recibido:', message);
          this.handleMessage(message);
        },
        (error: Error) => {
          console.error('🚨 Error WS:', error);
          this.handleError(error);
        }
      );

      console.log(`Intentando conectar a ${WS}`);

    } catch (error) {
      console.log(`Error al iniciar WebSocket ${error}`);
    }
  } else {
    console.warn('No hay token o websocketServer');
  }
}

  private sendToken(token: string) {
    // Envio de mensaje con el token
    const identity = {
      event: 'identity',
      data: `Bearer ${token}`,
    };
    this.socket$?.next(identity);
  }

  public closeWS() {
    this.socket$?.complete();
  }

  public getMessage(): Observable<ISocketMessage> {
    return this.socketMsg$.asObservable();
  }

  // WS Handlers

  private handleMessage(message: ISocketMessage) {
    // console.log(message);
    this.socketMsg$.next(message);
  }

  private handleError(error: Error) {
    console.log('WebSocket error reconectando...');
    this.socket$ = undefined;
    const reconect = interval(1000).pipe(takeWhile(() => !this.socket$));
    reconect.subscribe(() => {
      this.initWs();
    });
  }

  private closed() {
    console.log('WebSocket closed');
  }
}
