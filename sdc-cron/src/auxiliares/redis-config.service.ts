import { Injectable, Logger } from '@nestjs/common';
import {
  RedisClientOptions,
  RedisModuleOptions,
  RedisOptionsFactory,
} from '@liaoliaots/nestjs-redis';
import {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_NAMESPACE,
  REDIS_DB,
} from 'src/env';

const config: RedisClientOptions = {
  host: REDIS_HOST,
  port: parseInt(REDIS_PORT),
  password: REDIS_PASSWORD,
  namespace: REDIS_NAMESPACE,
  onClientCreated: () => {
    Logger.log(
      `============================Redis Connected============================ ${REDIS_HOST}:${REDIS_PORT} DB:${REDIS_DB}`,
    );
  },
  db: REDIS_DB,
};

@Injectable()
export class RedisConfigService implements RedisOptionsFactory {
  createRedisOptions(): RedisModuleOptions {
    return {
      readyLog: true,
      config,
    };
  }
}
