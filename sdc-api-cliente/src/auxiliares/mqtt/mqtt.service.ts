import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as MQTT from 'async-mqtt';
import Redis from 'ioredis';
import {
  ENV,
  MQTT_CLIENT_ID,
  MQTT_HOST,
  MQTT_PASS,
  MQTT_PORT,
  MQTT_PROTOCOL,
  MQTT_USER,
  REALTIME_CHANNEL,
  REALTIME_TRANSPORT,
  REDIS_DB,
  REDIS_HOST,
  REDIS_PASSWORD,
  REDIS_PORT,
} from '../../env';

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

@Injectable()
export class MqttService implements OnModuleDestroy {
  private readonly logger = new Logger('RealtimePublisher');
  private mqtt?: MQTT.AsyncMqttClient;
  private redis?: Redis;

  constructor() {
    void this.connect().catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo iniciar el publicador realtime: ${detail}`);
    });
  }

  private async connect(): Promise<void> {
    if (REALTIME_TRANSPORT === 'redis') {
      this.redis = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
        db: REDIS_DB,
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      });
      this.redis.on('error', (error) =>
        this.logger.error(`Redis realtime: ${error.message}`),
      );
      await this.redis.connect();
      this.logger.log(`Redis Pub/Sub activo en ${REALTIME_CHANNEL}`);
      return;
    }

    if (REALTIME_TRANSPORT === 'mqtt') {
      const host = `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}`;
      this.mqtt = await MQTT.connectAsync(host, {
        clientId: MQTT_CLIENT_ID,
        host: MQTT_HOST,
        port: MQTT_PORT,
        username: MQTT_USER,
        password: MQTT_PASS,
        keepalive: 20,
        protocol: MQTT_PROTOCOL as Protocol,
      });
      this.logger.log('MQTT realtime activo');
      return;
    }

    this.logger.log('Actualizaciones realtime deshabilitadas explicitamente.');
  }

  public async sendMessage(topic: string, message: string): Promise<void> {
    try {
      if (REALTIME_TRANSPORT === 'redis') {
        if (!this.redis || this.redis.status !== 'ready') await this.connect();
        await this.redis?.publish(REALTIME_CHANNEL, message);
      } else if (REALTIME_TRANSPORT === 'mqtt') {
        if (!this.mqtt) await this.connect();
        await this.mqtt?.publish(topic, message);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo publicar evento realtime: ${detail}`);
      if (ENV === 'production') {
        this.logger.warn(
          'La operacion HTTP continuo; realtime reintentara en el proximo evento.',
        );
      }
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.mqtt?.end();
    if (this.redis) await this.redis.quit();
  }
}
