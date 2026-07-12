import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as MQTT from 'async-mqtt';
import Redis from 'ioredis';
import { ISocketMessage } from 'modelos/src';
import {
  MQTT_CLIENT_ID,
  MQTT_HOST,
  MQTT_PASS,
  MQTT_PORT,
  MQTT_PROTOCOL,
  MQTT_TOPIC_APIS,
  MQTT_USER,
  REALTIME_CHANNEL,
  REALTIME_TRANSPORT,
  REDIS_DB,
  REDIS_HOST,
  REDIS_PASSWORD,
  REDIS_PORT,
} from '../env';
import { ISocket } from '../websocket/socket.interface';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable()
export class MqttSubscriberService implements OnModuleDestroy {
  private readonly logger = new Logger('RealtimeSubscriber');
  private mqtt?: MQTT.AsyncMqttClient;
  private redis?: Redis;
  private connected = false;
  private lastError?: string;

  constructor(private websocketService: WebsocketService) {
    void this.connect();
  }

  private async connect(): Promise<void> {
    try {
      if (REALTIME_TRANSPORT === 'redis') {
        this.redis = new Redis({
          host: REDIS_HOST,
          port: REDIS_PORT,
          password: REDIS_PASSWORD || undefined,
          db: REDIS_DB,
          lazyConnect: true,
        });
        this.redis.on('message', (_channel, message) => this.handleMessageApi(message));
        this.redis.on('error', (error) =>
          this.registerError(`Redis realtime: ${error.message}`),
        );
        await this.redis.connect();
        await this.redis.subscribe(REALTIME_CHANNEL);
        this.connected = true;
        this.logger.log(`Redis Pub/Sub suscripto a ${REALTIME_CHANNEL}`);
        return;
      }

      if (REALTIME_TRANSPORT === 'mqtt') {
        const host = `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}`;
        this.mqtt = await MQTT.connectAsync(host, {
          clientId: `${MQTT_CLIENT_ID}-subscriber`,
          host: MQTT_HOST,
          port: MQTT_PORT,
          username: MQTT_USER,
          password: MQTT_PASS,
          keepalive: 20,
          protocol: MQTT_PROTOCOL as any,
        });
        this.mqtt.on('message', (_topic, message) =>
          this.handleMessageApi(message.toString()),
        );
        await this.mqtt.subscribe(MQTT_TOPIC_APIS, { qos: 1 });
        this.connected = true;
        this.logger.log(`MQTT suscripto a ${MQTT_TOPIC_APIS}`);
        return;
      }

      this.logger.log('Transporte realtime deshabilitado explicitamente.');
      this.connected = true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.registerError(`No se pudo iniciar realtime: ${detail}`);
    }
  }

  private handleMessageApi(message: string): void {
    try {
      const mensaje: ISocketMessage = JSON.parse(message);
      const sockets = this.websocketService.getSesionesPorAlcance(
        mensaje.alcance,
        mensaje.idUser,
      );
      if (!sockets.length && mensaje.idUser && !mensaje.alcance) {
        this.sendUsuarioPorId(mensaje, mensaje.idUser);
        return;
      }
      sockets.forEach((socket: ISocket) => {
        void this.websocketService.sendMessageUsuario(socket, {
          ...mensaje,
          motivo: mensaje.alcance ? 'alcanceTenant' : 'usuarioFallback',
        });
      });
    } catch {
      this.logger.error('Evento realtime invalido; se descarto sin exponer su contenido.');
    }
  }

  private registerError(message: string): void {
    this.connected = false;
    this.lastError = message;
    this.logger.error(message);
  }

  public getStatus(): { transport: string; connected: boolean; lastError?: string } {
    return {
      transport: REALTIME_TRANSPORT,
      connected: this.connected,
      lastError: this.lastError,
    };
  }

  private sendUsuarioPorId(mensaje: ISocketMessage, id: string): void {
    this.websocketService.getSesionesUsuarioPorId(id).forEach((socket) => {
      void this.websocketService.sendMessageUsuario(socket, {
        ...mensaje,
        motivo: 'usuarioPorId',
      });
    });
  }

  public async onModuleDestroy(): Promise<void> {
    this.connected = false;
    await this.mqtt?.end();
    if (this.redis) await this.redis.quit();
  }
}
