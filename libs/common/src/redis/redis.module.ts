import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

/** Minimum duration between consecutive connection error logs (ms) to prevent log flooding. */
const ERROR_LOG_THROTTLE_MS = 30_000;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('RedisClient');

        const host = config.get<string>('REDIS_HOST', 'localhost');
        // Environment variables are always string, cast to number explicitly
        const port = Number(config.get<string | number>('REDIS_PORT', 6379));
        const db = Number(config.get<string | number>('REDIS_DB', 0));
        const password = config.get<string>('REDIS_PASSWORD', '');

        const client = new Redis({
          host,
          port,
          db,
          password: password || undefined,
          lazyConnect: true,
          // Infinite retry with max 5s exponential backoff: auto-reconnects when Redis recovers.
          // Anti-flood logging is handled by throttling in the 'error' event handler, not by stopping retry.
          retryStrategy: (times: number) => Math.min(times * 200, 5000),
          // Fail fast when Redis is down so the application can fallback to DB without hanging requests.
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 5000,
          commandTimeout: 2000,
          enableReadyCheck: true,
        });

        let lastErrorLogAt = 0;

        client.on('ready', () => {
          lastErrorLogAt = 0;
          logger.log(`Redis ready at ${host}:${port} (db ${db})`);
        });

        client.on('error', (err: Error) => {
          const now = Date.now();
          if (now - lastErrorLogAt >= ERROR_LOG_THROTTLE_MS) {
            lastErrorLogAt = now;
            logger.warn(`Redis error: ${err.message}. Falling back to DB.`);
          }
        });

        client.on('end', () => {
          logger.warn('Redis connection ended permanently.');
        });

        // Asynchronous non-blocking connect; failures are captured by the 'error' event listener.
        client.connect().catch(() => undefined);

        return client;
      },
    },
    RedisService,
  ],
  // Export REDIS_CLIENT for shared connections across modules (BullMQ, throttler, etc.)
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  public constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /** Factory-created providers lack automated lifecycle disposal; close client connection here. */
  public async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
