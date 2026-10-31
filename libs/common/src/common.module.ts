import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './context/request-context.service';
import { AuditColumnsSubscriber } from './database/audit-columns.subscriber';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor';
import { CorrelationIdMiddleware } from './middlewares/correlation-id.middleware';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';

const COMMON_PROVIDERS = [
  RequestContextService,
  AuditColumnsSubscriber,
  ResponseEnvelopeInterceptor,
  LoggingInterceptor,
  GlobalExceptionFilter,
  CorrelationIdMiddleware,
  RedisService,
];

/**
 * Shared infrastructure kernel module (`@app/common`) providing `AsyncLocalStorage` context,
 * response envelope interceptor, global exception filter, structured logging interceptor,
 * correlation ID middleware, Redis caching, and TypeORM audit column subscriber.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [...COMMON_PROVIDERS],
  exports: [...COMMON_PROVIDERS, RedisModule],
})
export class CommonModule {}
