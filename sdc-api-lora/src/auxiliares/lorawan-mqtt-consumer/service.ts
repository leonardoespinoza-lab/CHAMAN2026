import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AsyncMqttClient, connect } from 'async-mqtt';
import { ICreateLorawanUplink } from 'modelos/src';
import {
  LORAWAN_MQTT_CLIENT_ID,
  LORAWAN_MQTT_ENABLED,
  LORAWAN_MQTT_PASSWORD,
  LORAWAN_MQTT_QOS,
  LORAWAN_MQTT_TOPIC,
  LORAWAN_MQTT_URL,
  LORAWAN_MQTT_USERNAME,
} from '../../env';
import { LorawanUplinksService } from '../../entidades/lorawan-uplinks/service';

@Injectable()
export class LorawanMqttConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LorawanMqttConsumerService.name);
  private client?: AsyncMqttClient;

  constructor(private readonly uplinks: LorawanUplinksService) {}

  async onModuleInit(): Promise<void> {
    if (!LORAWAN_MQTT_ENABLED) {
      this.logger.warn('Consumer MQTT LoRaWAN desactivado por entorno.');
      return;
    }

    if (!LORAWAN_MQTT_URL) {
      this.logger.warn(
        'Consumer MQTT LoRaWAN sin URL. Definir LORAWAN_MQTT_URL o EMQX_MQTT_URL.',
      );
      return;
    }

    this.client = connect(LORAWAN_MQTT_URL, {
      clientId: LORAWAN_MQTT_CLIENT_ID,
      username: LORAWAN_MQTT_USERNAME || undefined,
      password: LORAWAN_MQTT_PASSWORD || undefined,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 15000,
    });

    this.client.on('connect', () => {
      this.logger.log(`Conectado a EMQX: ${this.safeBrokerUrl()}`);
    });
    this.client.on('reconnect', () => {
      this.logger.warn('Reconectando a EMQX...');
    });
    this.client.on('error', (error) => {
      this.logger.error(`Error MQTT LoRaWAN: ${error.message}`);
    });
    this.client.on('message', (topic, payload) => {
      void this.handleMessage(topic, payload);
    });

    await this.client.subscribe(LORAWAN_MQTT_TOPIC, { qos: this.qos() });
    this.logger.log(`Suscripto a ${LORAWAN_MQTT_TOPIC}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.end(true);
    }
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    let parsed: Record<string, any>;

    try {
      parsed = JSON.parse(payload.toString('utf8'));
    } catch (error) {
      this.logger.error(`Payload MQTT invalido en ${topic}: ${error.message}`);
      return;
    }

    const uplink = this.normalizeUplink(topic, parsed);

    try {
      await this.uplinks.create(uplink);
      this.logger.log(
        `Uplink guardado devEUI=${uplink.devEUI || '--'} fCnt=${uplink.fCnt ?? '--'}`,
      );
    } catch (error) {
      this.logger.error(`No se pudo guardar uplink MQTT: ${error.message}`);
    }
  }

  private normalizeUplink(
    topic: string,
    payload: Record<string, any>,
  ): ICreateLorawanUplink {
    const topicData = this.parseTopic(topic);
    const deviceInfo = payload.deviceInfo || {};
    const rxInfo = Array.isArray(payload.rxInfo) ? payload.rxInfo[0] || {} : {};
    const txInfo = payload.txInfo || {};
    const timestamp = this.normalizeTimestamp(
      payload.time || payload.timestamp || payload.publishedAt || rxInfo.time,
    );

    const devEUI =
      deviceInfo.devEui ||
      deviceInfo.devEUI ||
      payload.devEui ||
      payload.devEUI ||
      topicData.devEUI;

    return {
      topic,
      applicationID:
        deviceInfo.applicationId ||
        deviceInfo.applicationID ||
        payload.applicationID ||
        payload.applicationId ||
        topicData.applicationID,
      applicationName:
        deviceInfo.applicationName ||
        payload.applicationName ||
        payload.application_name,
      devEUI: devEUI ? String(devEUI).toUpperCase() : undefined,
      deviceName: deviceInfo.deviceName || payload.deviceName,
      fCnt: this.toNumber(payload.fCnt ?? payload.fCntUp),
      fPort: this.toNumber(payload.fPort),
      data: payload.data,
      gatewayID:
        rxInfo.gatewayId ||
        rxInfo.gatewayID ||
        rxInfo.gateway_id ||
        rxInfo.mac,
      rssi: this.toNumber(rxInfo.rssi),
      snr: this.toNumber(rxInfo.snr ?? rxInfo.loRaSNR),
      frequency: this.toNumber(txInfo.frequency ?? payload.frequency),
      dr: this.toNumber(
        payload.dr ??
          txInfo.dr ??
          txInfo.dataRate ??
          txInfo.modulation?.lora?.spreadingFactor,
      ),
      timestamp,
      rawPayload: payload,
    };
  }

  private parseTopic(topic: string): {
    applicationID?: string;
    devEUI?: string;
  } {
    const parts = topic.split('/');
    return {
      applicationID: parts[0] === 'application' ? parts[1] : undefined,
      devEUI: parts[2] === 'device' ? parts[3] : undefined,
    };
  }

  private toNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private normalizeTimestamp(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return new Date().toISOString();
    }

    if (typeof value === 'number') {
      return new Date(value < 100000000000 ? value * 1000 : value).toISOString();
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const parsed = Number(value);
      return new Date(parsed < 100000000000 ? parsed * 1000 : parsed).toISOString();
    }

    const parsedDate = new Date(value as string);
    return Number.isFinite(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();
  }

  private qos(): 0 | 1 | 2 {
    return [0, 1, 2].includes(LORAWAN_MQTT_QOS)
      ? (LORAWAN_MQTT_QOS as 0 | 1 | 2)
      : 0;
  }

  private safeBrokerUrl(): string {
    try {
      const url = new URL(LORAWAN_MQTT_URL);
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return 'broker configurado';
    }
  }
}
