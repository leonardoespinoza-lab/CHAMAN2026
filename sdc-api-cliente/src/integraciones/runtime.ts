import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from '../env';

@Injectable()
export class IntegrationRuntime implements OnModuleDestroy {
  private redis?: Redis;
  private connection(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        commandTimeout: 5000,
      });
      this.redis.on('error', () => {}); // Do not log connection secrets.
    }
    return this.redis;
  }
  async rateLimit(id: string, limit: number): Promise<void> {
    let count: number;
    try {
      count = Number(
        await this.connection().eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],60000) end; return n",
          1,
          `integrations:v1:rate:${id}`,
        ),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Control de capacidad temporalmente no disponible.',
      );
    }
    if (count > limit)
      throw new HttpException(
        'Límite de consultas alcanzado. Reintentar en 60 segundos.',
        429,
      );
  }
  async exclusive<T>(
    id: string,
    task: (assertHeld: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const key = `integrations:v1:write:${id}`;
    const owner = randomUUID();
    let acquired: string | null;
    try {
      acquired = await this.connection().set(key, owner, 'PX', 120000, 'NX');
    } catch {
      throw new ServiceUnavailableException(
        'Control de escritura temporalmente no disponible.',
      );
    }
    if (!acquired)
      throw new HttpException(
        'Hay una operación en curso. Reintentar el mismo idExterno.',
        409,
      );
    let lost = false;
    let renewing = false;
    const renew = async () => {
      if (renewing || lost) return;
      renewing = true;
      try {
        if (
          Number(
            await this.connection().eval(
              "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],120000) end; return 0",
              1,
              key,
              owner,
            ),
          ) !== 1
        )
          lost = true;
      } catch {
        lost = true;
      } finally {
        renewing = false;
      }
    };
    const assertHeld = async () => {
      if (lost)
        throw new ServiceUnavailableException(
          'Se perdió la reserva de escritura. Reintentar el mismo idExterno.',
        );
      try {
        if ((await this.connection().get(key)) !== owner) lost = true;
      } catch {
        lost = true;
      }
      if (lost)
        throw new ServiceUnavailableException(
          'Se perdió la reserva de escritura. Reintentar el mismo idExterno.',
        );
    };
    const timer = setInterval(() => {
      void renew();
    }, 30000);
    timer.unref();
    try {
      const result = await task(assertHeld);
      await assertHeld();
      return result;
    } finally {
      clearInterval(timer);
      try {
        await this.connection().eval(
          "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0",
          1,
          key,
          owner,
        );
      } catch {
        /* The bounded lease expires. */
      }
    }
  }
  onModuleDestroy(): void {
    this.redis?.disconnect();
  }
}
