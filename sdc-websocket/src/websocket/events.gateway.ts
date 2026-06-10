import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { PREFIX_PATH } from '../env';
import { ISocket } from './socket.interface';
import { WebsocketService } from './websocket.service';

function heartbeat() {
  this.failedPings = 0;
}

function handlePing(data: Buffer) {
  if (this.usuario) {
    this.pong?.();
  } else {
    Logger.log(`Ping de socket sin usuario. Data: ${data?.toString()}`);
    // ws.terminate();
  }
}

function handleError(err: Error) {
  let errMsg: string;
  try {
    errMsg = JSON.stringify(err);
  } catch (e) {
    errMsg = err.message;
  }
  Logger.error(`Error ${this.usuario?.nombre}. Error ${errMsg}`);
}

@WebSocketGateway({
  path: `/${PREFIX_PATH}`,
  cors: {
    origin: '*',
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private logger = new Logger(EventsGateway.name);
  private interval?: NodeJS.Timeout;

  @WebSocketServer()
  server: Server;

  constructor(private service: WebsocketService) {}

  async afterInit() {
    this.logger.verbose('Websocket server is ready');
    this.initPing();
    this.initOnServerClose();
    this.service.setServer(this.server);
  }

  async handleConnection(@ConnectedSocket() socket: ISocket) {
    this.logger.verbose(
      `Cliente conectado. Conexiones totales: ${this.server.clients.size}`,
    );
    socket.failedPings = 0;
    socket.on('pong', heartbeat);
    socket.on('ping', handlePing);
    socket.on('error', handleError);
  }

  async handleDisconnect(@ConnectedSocket() socket: ISocket) {
    this.logger.verbose(
      `Usuario ${socket.usuario?.username} desconectado, Conexiones totales: ${this.server.clients.size}`,
    );
  }

  private async initPing() {
    if (this.server) {
      this.interval = setInterval(() => {
        this.server.clients.forEach((ws: ISocket) => {
          if (ws.failedPings === 3) {
            return ws?.terminate();
          }
          ws.failedPings++;
          ws.ping();
        });
      }, 10000);
    } else {
      this.logger.error('Server is not ready');
    }
  }

  private async initOnServerClose() {
    this.server.on('close', () => {
      clearInterval(this.interval);
    });
  }

  // Handle messages from the client

  // Usuarios / Vecinos

  @SubscribeMessage('identity')
  async authenticateUsuario(
    @MessageBody() data: string,
    @ConnectedSocket() socket: ISocket,
  ): Promise<string> {
    // this.logger.verbose(`identity: ${data}`);
    return await this.service.authenticateUsuario(data, socket);
  }
}
