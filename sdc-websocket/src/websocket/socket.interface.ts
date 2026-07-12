import { IUsuario } from 'modelos/src';
import { WebSocket } from 'ws';

interface ISocketInfo {
  failedPings?: number;
  usuario?: IUsuario;
  authTimer?: NodeJS.Timeout;
}

export type ISocket = WebSocket & ISocketInfo;
