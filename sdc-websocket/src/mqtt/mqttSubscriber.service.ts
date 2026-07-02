import { Injectable, Logger } from '@nestjs/common';
import * as MQTT from 'async-mqtt';
import { ISocketMessage } from 'modelos/src';
import {
  ENV,
  MQTT_CLIENT_ID,
  MQTT_HOST,
  MQTT_PASS,
  MQTT_PORT,
  MQTT_PROTOCOL,
  MQTT_TOPIC_APIS,
  MQTT_USER,
} from '../env';
import { ISocket } from '../websocket/socket.interface';
import { WebsocketService } from '../websocket/websocket.service';

enum Protocol {
  ws = 'ws',
  wss = 'wss',
  mqtt = 'mqtt',
  mqtts = 'mqtts',
  tcp = 'tcp',
  ssl = 'ssl',
  wx = 'wx',
  wxs = 'wxs',
}

const mqttOptions: MQTT.IClientOptions = {
  clientId: `${MQTT_CLIENT_ID}-subscriber`,
  host: MQTT_HOST,
  port: +MQTT_PORT,
  username: MQTT_USER,
  password: MQTT_PASS,
  keepalive: 20,
  protocol: MQTT_PROTOCOL as Protocol,
};

@Injectable()
export class MqttSubscriberService {
  private logger: Logger = new Logger('MqttService');
  private client: MQTT.AsyncMqttClient;

  constructor(private websocketService: WebsocketService) {
    this.connect();
  }

  private async connect() {
    try {
      const host = `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}`;
      this.logger.verbose(
        `Connecting to MQTT broker... ${host} | clientId: ${mqttOptions.clientId}`,
      );
      this.client = await MQTT.connectAsync(host, mqttOptions);
      this.logger.verbose(`MQTT Client ${mqttOptions.clientId} connected`);
      this.initMessageHandler();
      await this.subscribeTopics();
    } catch (error) {
      if (ENV !== 'local') {
        this.logger.error('Error al conectar al broker MQTT');
        this.logger.error(error);
        process.exit(1);
      }
    }
  }

  private initMessageHandler() {
    this.client.on('message', (topic, message) => {
      this.handleMessageApi(message.toString());
    });
  }

  private async subscribeTopics() {
    try {
      await Promise.all([this.client.subscribe(MQTT_TOPIC_APIS, { qos: 1 })]);
      this.logger.verbose(`Subscribed to ${MQTT_TOPIC_APIS}`);
    } catch (error) {
      this.logger.error('Error al suscribirse a los topics');
      this.logger.error(error);
    }
  }

  private handleMessageApi(message: string) {
    try {
      const mensajeWS: ISocketMessage = JSON.parse(message);
      this.sendUsuariosPorAlcance(mensajeWS);
    } catch (error) {
      Logger.error(`Error al parsear el mensaje: ${message}`);
    }
  }

  // Envio de mensajes a usuarios

  private async sendUsuarioPorId(mensaje: ISocketMessage, id: string) {
    this.websocketService.getSesionesUsuarioPorId(id).forEach((socket) => {
      this.websocketService.sendMessageUsuario(socket, {
        ...mensaje,
        motivo: 'usuarioPorId',
      });
    });
  }

  private async sendUsuariosPorAlcance(mensaje: ISocketMessage) {
    const sockets = this.websocketService.getSesionesPorAlcance(
      mensaje.alcance,
      mensaje.idUser,
    );

    if (!sockets.length && mensaje.idUser) {
      this.sendUsuarioPorId(mensaje, mensaje.idUser);
      return;
    }

    sockets.forEach((socket: ISocket) => {
      this.websocketService.sendMessageUsuario(socket, {
        ...mensaje,
        motivo: mensaje.alcance ? 'alcanceTenant' : 'usuarioFallback',
      });
    });
  }
}
