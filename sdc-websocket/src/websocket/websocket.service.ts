import { Injectable } from '@nestjs/common';
import { IPermiso, ISocketMessage, ISocketMessageScope } from 'modelos/src';
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

  public getSesionesPorAlcance(
    alcance?: ISocketMessageScope,
    idUserFallback?: string,
  ): ISocket[] {
    if (!alcance || !Object.values(alcance).some(Boolean)) {
      return idUserFallback ? this.getSesionesUsuarioPorId(idUserFallback) : [];
    }

    const sockets: ISocket[] = [];
    this.server.clients.forEach((socket: ISocket) => {
      if (this.usuarioPuedeRecibir(socket, alcance)) {
        sockets.push(socket);
      }
    });
    return sockets;
  }

  private usuarioPuedeRecibir(
    socket: ISocket,
    alcance: ISocketMessageScope,
  ): boolean {
    const permisos = socket.usuario?.permisos || [];
    return permisos.some((permiso) => this.permisoPuedeRecibir(permiso, alcance));
  }

  private permisoPuedeRecibir(
    permiso: IPermiso,
    alcance: ISocketMessageScope,
  ): boolean {
    if (permiso?.nivel === 'Admin') {
      return true;
    }

    if (permiso?.nivel === 'Quimica') {
      return !!alcance.idQuimica && permiso.idQuimica === alcance.idQuimica;
    }

    if (permiso?.nivel === 'Distribuidor') {
      return !!alcance.idDistribuidor && permiso.idDistribuidor === alcance.idDistribuidor;
    }

    if (permiso?.nivel === 'Productor') {
      return !!alcance.idProductor && permiso.idProductor === alcance.idProductor;
    }

    if (permiso?.nivel === 'Establecimiento') {
      return (
        !!alcance.idEstablecimiento &&
        permiso.idEstablecimiento === alcance.idEstablecimiento
      );
    }

    return false;
  }
}
