import { Injectable, Logger } from '@nestjs/common';
import {
  ENV,
  MQTT_ENABLED,
  MQTT_CLIENT_ID,
  MQTT_HOST,
  MQTT_PASS,
  MQTT_PORT,
  MQTT_PROTOCOL,
  MQTT_USER,
} from '../../env';
import * as MQTT from 'async-mqtt';

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
  clientId: MQTT_CLIENT_ID,
  host: MQTT_HOST,
  port: +MQTT_PORT,
  username: MQTT_USER,
  password: MQTT_PASS,
  keepalive: 20,
  protocol: MQTT_PROTOCOL as Protocol,
};

@Injectable()
export class MqttService {
  private logger = new Logger('MqttService');
  private client?: MQTT.AsyncMqttClient;

  constructor() {
    if (MQTT_ENABLED) {
      this.connect();
    } else {
      this.logger.verbose('MQTT deshabilitado. Definir MQTT_ENABLED=true para activar broker externo.');
    }
  }

  private async connect() {
    if (!MQTT_ENABLED) {
      return;
    }

    try {
      const host = `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}`;
      this.logger.verbose(`Connecting to MQTT broker... ${host}`);
      this.client = await MQTT.connectAsync(host, mqttOptions);
      this.logger.verbose('MQTT connected');
    } catch (error) {
      if (ENV !== 'local') {
        this.logger.error(error);
        process.exit(1);
      }
    }
  }

  public async sendMessage(topic: string, message: string) {
    if (!MQTT_ENABLED) {
      return;
    }

    if (!this.client) {
      await this.connect();
    }
    if (this.client) {
      await this.client.publish(topic, message);
      this.logger.verbose(`MQTT message sent to ${topic}`);
    }
  }
}
