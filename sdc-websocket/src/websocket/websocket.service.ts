import { Injectable } from '@nestjs/common';
import { ISocketMessage } from 'modelos/src';
import { Server } from 'ws';
import { AuthenticationService } from '../auxiliares/authentication/authentication.service';
import { ISocket } from './socket.interface';

@Injectable()
export class WebsocketService {
  private server?: Server;

  constructor(private auth: AuthenticationService) {}

  // ******************************************** //
  // General
  // ******************************************** //
  public setServer(server: Server) {
    this.server = server;
  }

  // ******************************************** //
  // Usuarios / Vecinos
  // ******************************************** //

  public async authenticateUsuario(
    data: string,
    socket: ISocket,
  ): Promise<string> {
    try {
      const token = await this.auth.authorization(data);
      socket.usuario = token.user;
      return `Sesion WS iniciada ${socket.usuario?.username}. Conexiones totales: ${this.server.clients.size}`;
    } catch (error) {
      return error.message;
    }
  }

  public async sendMessageUsuario(
    socket: ISocket,
    data: ISocketMessage,
  ): Promise<string> {
    try {
      socket.send(JSON.stringify(data));
      // this.logger.verbose(`Mensaje enviado a usuario ${socket.id}`);
    } catch (error) {
      return error.message;
    }
  }

  // Listados de sesiones de  usuarios
  public getSesionesUsuarios(): ISocket[] {
    const sockets = [];
    this.server.clients.forEach((ws: ISocket) => {
      if (ws.usuario) {
        sockets.push(ws);
      }
    });
    return sockets;
  }

  public getSesionesUsuarioPorId(idUser: string): ISocket[] {
    const sockets: ISocket[] = [];
    this.server.clients.forEach((socket: ISocket) => {
      if (socket.usuario?._id === idUser) {
        sockets.push(socket);
      }
    });
    return sockets;
  }
}
