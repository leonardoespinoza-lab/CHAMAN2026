import { Injectable, Logger } from '@nestjs/common';
import {
  IPermiso,
  ISocketMessage,
  ISocketMessageScope,
  IToken,
} from 'modelos/src';
import { Server, WebSocket } from 'ws';
import { AuthenticationService } from '../auxiliares/authentication/authentication.service';
import { ISocket } from './socket.interface';
import { WEBSOCKET_MAX_IDENTITY_LENGTH } from '../env';

@Injectable()
export class WebsocketService {
  private server?: Server;
  private readonly logger = new Logger(WebsocketService.name);

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
    this.clearSessionExpiryTimer(socket);
    socket.usuario = undefined;
    try {
      const authorization = typeof data === 'string' ? data.trim() : '';
      if (!authorization || authorization.length > WEBSOCKET_MAX_IDENTITY_LENGTH) {
        throw new Error('Credencial WebSocket invalida');
      }
      const token = await this.auth.authorization(authorization);
      if (!token?.user?._id) throw new Error('Usuario WebSocket invalido');
      const sessionExpiresAt = this.sessionExpiresAt(token);
      (token.user.permisos || []).forEach((permiso) => {
        if (permiso.nivel === 'Asesor') {
          permiso.idAsesor = String(token.user._id);
          permiso.idLotes = [];
        }
      });
      this.clearSocketTimers(socket);
      socket.usuario = token.user;
      this.scheduleSessionExpiry(socket, sessionExpiresAt);
      return `Sesion WS iniciada. Conexiones totales: ${this.server?.clients.size || 0}`;
    } catch (error) {
      this.logger.warn('Autenticacion WebSocket rechazada.');
      this.clearSocketTimers(socket);
      socket.usuario = undefined;
      socket.close(4401, 'Autenticacion invalida');
      return 'Autenticacion invalida';
    }
  }

  public clearSocketTimers(socket: ISocket): void {
    if (socket.authTimer) {
      clearTimeout(socket.authTimer);
      socket.authTimer = undefined;
    }
    this.clearSessionExpiryTimer(socket);
  }

  public async sendMessageUsuario(
    socket: ISocket,
    data: ISocketMessage,
  ): Promise<string> {
    try {
      if (socket.readyState !== WebSocket.OPEN) return 'Socket no disponible';
      socket.send(JSON.stringify(data));
      // this.logger.verbose(`Mensaje enviado a usuario ${socket.id}`);
    } catch (error) {
      return error.message;
    }
  }

  // Listados de sesiones de  usuarios
  public getSesionesUsuarios(): ISocket[] {
    const sockets = [];
    this.server?.clients.forEach((ws: ISocket) => {
      if (ws.usuario) {
        sockets.push(ws);
      }
    });
    return sockets;
  }

  public getSesionesUsuarioPorId(idUser: string): ISocket[] {
    const sockets: ISocket[] = [];
    this.server?.clients.forEach((socket: ISocket) => {
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
    this.server?.clients.forEach((socket: ISocket) => {
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

    if (permiso?.nivel === 'Tenant') {
      return (
        !!alcance.idTenant &&
        String(permiso.idTenant || '') === String(alcance.idTenant)
      );
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

    if (permiso?.nivel === 'Asesor') {
      if (
        alcance.idAsesorPropietario &&
        permiso.idAsesor === alcance.idAsesorPropietario
      ) {
        return true;
      }
      const establecimientos = (permiso.idEstablecimientos || []).map(String);
      const lotes = (permiso.idLotes || []).map(String);
      return (
        !!alcance.idEstablecimiento &&
        establecimientos.includes(String(alcance.idEstablecimiento)) &&
        (!alcance.idLote || !lotes.length || lotes.includes(String(alcance.idLote)))
      );
    }

    if (permiso?.nivel === 'Establecimiento') {
      return (
        !!alcance.idEstablecimiento &&
        permiso.idEstablecimiento === alcance.idEstablecimiento &&
        (!alcance.idLote ||
          !permiso.idLotes?.length ||
          permiso.idLotes.includes(String(alcance.idLote)))
      );
    }

    return false;
  }

  private sessionExpiresAt(token: IToken): number {
    const accessExpiresAt = this.validExpiry(
      token.accessTokenExpiresAt,
      'access token',
    );
    const expiries = [accessExpiresAt];
    if (token.sessionAbsoluteExpiresAt) {
      expiries.push(
        this.validExpiry(
          token.sessionAbsoluteExpiresAt,
          'sesion absoluta',
        ),
      );
    }
    const expiresAt = Math.min(...expiries);
    if (expiresAt <= Date.now()) {
      throw new Error('La sesion WebSocket ya vencio');
    }
    return expiresAt;
  }

  private validExpiry(value: string | undefined, label: string): number {
    const expiresAt = value ? new Date(value).getTime() : Number.NaN;
    if (!Number.isFinite(expiresAt)) {
      throw new Error(`Vencimiento invalido de ${label}`);
    }
    return expiresAt;
  }

  private scheduleSessionExpiry(socket: ISocket, expiresAt: number): void {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      socket.usuario = undefined;
      socket.close(4401, 'Sesion expirada');
      return;
    }
    socket.sessionExpiryTimer = setTimeout(() => {
      socket.sessionExpiryTimer = undefined;
      socket.usuario = undefined;
      socket.close(4401, 'Sesion expirada');
    }, remaining);
  }

  private clearSessionExpiryTimer(socket: ISocket): void {
    if (socket.sessionExpiryTimer) {
      clearTimeout(socket.sessionExpiryTimer);
      socket.sessionExpiryTimer = undefined;
    }
  }
}
