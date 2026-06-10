import { Injectable, Logger } from '@nestjs/common';
import * as MQTT from 'async-mqtt';
import {
  ENV,
  MQTT_CLIENT_ID,
  MQTT_HOST,
  MQTT_PASS,
  MQTT_PORT,
  MQTT_PROTOCOL,
  MQTT_USER,
} from '../env';

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
  clientId: `${MQTT_CLIENT_ID}-publisher`,
  host: MQTT_HOST,
  port: +MQTT_PORT,
  username: MQTT_USER,
  password: MQTT_PASS,
  keepalive: 20,
  protocol: MQTT_PROTOCOL as Protocol,
};

@Injectable()
export class MqttPublisherService {
  private logger: Logger = new Logger('MqttService');
  private client: MQTT.AsyncMqttClient;

  constructor() {
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
    } catch (error) {
      if (ENV !== 'local') {
        this.logger.error('Error al conectar al broker MQTT');
        this.logger.error(error);
        process.exit(1);
      }
    }
  }

  public async sendMessage(topic: string, message: string) {
    try {
      if (!this.client) {
        await this.connect();
      }
      await this.client.publish(topic, message, { qos: 1 });
      // this.logger.verbose(`MQTT message sent to ${topic}`);
    } catch (err) {
      this.logger.error('Error al enviar el mensaje MQTT');
      this.logger.error(err);
    }
  }
}
